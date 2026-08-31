/* ═══════════════════════════════════════════════════════
   CoursUs 다국어 이름 채우기 — TourAPI 일문·중문 서비스 → places.i18n
   음식점·카페·명소·쇼핑·국립공원 전부 대상.
   VisitKorea는 9개 언어로 관광지·맛집·쇼핑 정보를 제공하므로
   같은 장소의 일본어/중국어 정식 표기를 가져올 수 있습니다.

   두 가지 방식을 자동으로 골라 씁니다:
     · source가 tourapi-* (국립공원)  → external_id = contentid 로 직접 조회
     · 그 외 (부산시 API에서 온 것)   → name_ko 키워드 검색 + 좌표 2km 검증

   엔드포인트 버전(JpnService2 vs JpnService)은 첫 호출에서 자동 탐지합니다.

   준비:
     .env (DATA_GO_KR_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY)
     공공데이터포털에서 활용신청:
       한국관광공사_일문 관광정보서비스_GW
       한국관광공사_중문 번체 관광정보서비스_GW

   실행:
     node fill-i18n.js                    미리보기 (DB 안 건드림)
     node fill-i18n.js --apply            실제 반영
     node fill-i18n.js --only=nature      특정 카테고리만
     node fill-i18n.js --lang=ja          한 언어만 (일 1,000건 한도 분산용)
     node fill-i18n.js --limit=200        앞에서 N곳만 (한도 조절)
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const KEY = process.env.DATA_GO_KR_KEY;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY  = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;
const LANG_ARG = (args.find(a => a.startsWith('--lang=')) || '').split('=')[1] || null;
const LIMIT = Number((args.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 0;

/* ── 언어별 서비스 후보 (앞에서부터 시도, 되는 걸 기억) ──
   ja  = 일문, zh = 중문 번체(대만·홍콩), zhs = 중문 간체(중국 본토) */
const SERVICES = {
  ja:  ['JpnService2', 'JpnService'],
  zh:  ['ChtService2', 'ChtService'],
  zhs: ['ChsService2', 'ChsService'],
};
const resolved = {};          // { ja: 'JpnService2', ... } 탐지 결과 캐시

const BASE = 'http://apis.data.go.kr/B551011';
const MAX_DIST_KM = 2;
const DELAY_MS = 150;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasHangul = s => /[가-힣]/.test(s || '');
const hasCJK = s => /[\u3040-\u30ff\u4e00-\u9fff]/.test(s || '');  // 히라가나/가타카나/한자

function distKm(lat1, lng1, lat2, lng2){
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*d/2)**2
    + Math.cos(lat1*d) * Math.cos(lat2*d) * Math.sin((lng2-lng1)*d/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// title에서 괄호 안 한글/로마자 보조표기 제거 → 현지어 이름만
function cleanTitle(title){
  return (title || '')
    .replace(/\s*\[.*?\]\s*/g, ' ')
    .replace(/\s*[\(（][^)）]*[\)）]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 한 번 호출 (실패 시 throw)
// ※ serviceKey는 이미 URL 인코딩된 형태(%2B 등)일 수 있어 재인코딩하면 안 됨.
//    그래서 URLSearchParams를 쓰지 않고 문자열로 직접 조립한다.
async function callApi(svc, path, params){
  const extra = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${BASE}/${svc}/${path}?serviceKey=${KEY}`
    + `&MobileOS=ETC&MobileApp=CoursUs&_type=json&${extra}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} (${svc}/${path})`);
  try { return JSON.parse(text); }
  catch { throw new Error(`JSON 아님 (${svc}): ${text.slice(0, 70)}`); }
}

// 언어별로 작동하는 서비스명 찾기 (한 번만)
async function resolveService(lang){
  if (resolved[lang]) return resolved[lang];
  for (const svc of SERVICES[lang]){
    for (const path of ['searchKeyword2', 'searchKeyword']){
      try {
        const json = await callApi(svc, path, { keyword: '해운대', numOfRows: 1, pageNo: 1 });
        if (json.response?.header?.resultCode === '0000'){
          resolved[lang] = { svc, kw: path, detail: path.endsWith('2') ? 'detailCommon2' : 'detailCommon' };
          console.log(`   ✔ ${lang}: ${svc}/${path} 사용`);
          return resolved[lang];
        }
      } catch(e){ /* 다음 후보 */ }
      await sleep(DELAY_MS);
    }
  }
  throw new Error(`${lang} 서비스를 찾을 수 없습니다 (활용신청/키 반영 확인 필요)`);
}

// contentid로 직접 조회
async function byContentId(lang, contentId){
  const r = await resolveService(lang);
  const json = await callApi(r.svc, r.detail, { contentId });
  let items = json.response?.body?.items?.item;
  if (!items) return null;
  if (!Array.isArray(items)) items = [items];
  const t = cleanTitle(items[0]?.title);
  return (t && !hasHangul(t)) ? t : null;
}

// 한글 이름으로 검색 + 좌표 검증
async function byKeyword(lang, nameKo, lat, lng){
  const r = await resolveService(lang);
  const json = await callApi(r.svc, r.kw, { keyword: nameKo, numOfRows: 10, pageNo: 1 });
  let items = json.response?.body?.items?.item;
  if (!items) return null;
  if (!Array.isArray(items)) items = [items];

  let cands = items;
  if (lat && lng){
    cands = items.filter(it => it.mapx && it.mapy &&
      distKm(lat, lng, Number(it.mapy), Number(it.mapx)) <= MAX_DIST_KM);
  }
  if (!cands.length) return null;

  cands.sort((a, b) => {
    const rank = t => t === '76' ? 0 : t === '78' ? 1 : t === '39' ? 1 : 2;  // 39=음식점
    return rank(a.contenttypeid) - rank(b.contenttypeid);
  });

  const t = cleanTitle(cands[0].title);
  return (t && !hasHangul(t)) ? t : null;
}

async function lookup(lang, place){
  // 국립공원 등 TourAPI에서 온 데이터는 contentid로 정확 조회
  if ((place.source || '').startsWith('tourapi') && /^\d+$/.test(place.external_id || '')){
    const t = await byContentId(lang, place.external_id);
    if (t) return t;
  }
  // 그 외: 이름 검색 (공백 제거 재시도 포함)
  let t = await byKeyword(lang, place.name_ko, place.lat, place.lng);
  if (!t && place.name_ko.includes(' ')){
    await sleep(DELAY_MS);
    t = await byKeyword(lang, place.name_ko.replace(/\s/g, ''), place.lat, place.lng);
  }
  return t;
}

async function main(){
  if (!KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY){
    console.error('⚠️  .env에 키 3개를 확인하세요.'); return;
  }

  const langs = LANG_ARG ? [LANG_ARG] : ['ja', 'zh', 'zhs'];
  console.log(`대상 언어: ${langs.join(', ')}\n서비스 탐지 중...`);
  for (const l of langs) await resolveService(l);

  let q = sb.from('places').select('id, name_en, name_ko, category, source, external_id, lat, lng, i18n');
  if (ONLY) q = q.eq('category', ONLY);
  const { data, error } = await q;
  if (error){ console.error(error); return; }

  // 이미 현지어 이름이 있는 곳은 건너뜀 (한글이면 다시 채움)
  let targets = (data || []).filter(p => {
    if (!p.name_ko) return false;
    return langs.some(l => {
      const cur = p.i18n?.[l]?.name;
      return !cur || hasHangul(cur);
    });
  });
  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`\n대상 ${targets.length}곳 (전체 ${data.length}곳)\n`);

  const updates = [], missed = [];
  for (let i = 0; i < targets.length; i++){
    const p = targets[i];
    const next = { ...(p.i18n || {}) };
    let got = false;

    for (const lang of langs){
      const cur = next[lang]?.name;
      if (cur && !hasHangul(cur)) continue;      // 이미 현지어면 유지
      try {
        const t = await lookup(lang, p);
        if (t && hasCJK(t)){
          next[lang] = { ...(next[lang] || {}), name: t };   // menu/hours/address 보존
          got = true;
          console.log(`  ✔ [${lang}] ${p.name_ko}  →  ${t}`);
        }
      } catch(e){
        console.error(`  ✖ [${lang}] ${p.name_ko}: ${e.message}`);
      }
      await sleep(DELAY_MS);
    }

    if (got) updates.push({ id: p.id, ko: p.name_ko, i18n: next });
    else missed.push(p.name_ko);

    if ((i + 1) % 25 === 0) console.log(`   --- ${i + 1}/${targets.length} ---`);
  }

  console.log(`\n채운 곳 ${updates.length} / 못 찾음 ${missed.length}`);
  writeFileSync('fill-i18n-missed.txt', missed.join('\n'));
  console.log('못 찾은 목록: fill-i18n-missed.txt (영문명으로 폴백되어 표시됩니다)');

  if (!APPLY){
    console.log('\n미리보기 모드. 반영하려면:  node fill-i18n.js --apply');
    return;
  }

  console.log('\n반영 중...');
  let done = 0;
  for (const u of updates){
    const { error } = await sb.from('places').update({ i18n: u.i18n }).eq('id', u.id);
    if (error){ console.error('❌', u.ko, error.message); continue; }
    if (++done % 50 === 0) console.log(`   ${done}/${updates.length}`);
  }
  console.log(`\n✅ 완료: ${done}곳 다국어 이름 반영. 사이트에서 🌐 버튼으로 확인하세요.`);
}

main().catch(e => console.error('❌', e.message));