/* ═══════════════════════════════════════════════════════
   CoursUs 영문명 채우기 v3 — TourAPI 키워드 검색 + 재시도
   명소의 한글 이름(name_ko)으로 TourAPI 영문 서비스를 검색해
   정식 영어 명칭을 name_en에 채웁니다.

   검색 순서 (하나라도 성공하면 멈춤):
     1) name_ko 그대로            "다대포 해수욕장"
     2) 공백 제거                 "다대포해수욕장"   ← TourAPI 표기 대응
     3) 쉼표/괄호 앞부분만        "송정해수욕장, 죽도공원" → "송정해수욕장"
   결과 중 우리 좌표와 2km 이내 + 관광지(76) 우선으로 채택.
   title "Busan Gamcheon Culture Village (부산 감천문화마을)"
   → 괄호 앞 영문만 저장. name_ko는 보존.

   준비:  .env (DATA_GO_KR_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY)
   실행:
     node fill-names.js            미리보기 (DB 안 건드림)
     node fill-names.js --apply    실제 반영
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const KEY = process.env.DATA_GO_KR_KEY;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPLY = process.argv.includes('--apply');

const ENDPOINT = 'http://apis.data.go.kr/B551011/EngService2/searchKeyword2';
const MAX_DIST_KM = 2;
const DELAY_MS = 150;

const hasHangul = s => /[가-힣]/.test(s || '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function distKm(lat1, lng1, lat2, lng2){
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*d/2)**2
    + Math.cos(lat1*d) * Math.cos(lat2*d) * Math.sin((lng2-lng1)*d/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 키워드 하나로 검색 → 좌표 맞는 항목의 영문명 (없으면 null)
async function searchOnce(keyword, lat, lng){
  const url = `${ENDPOINT}?serviceKey=${KEY}&MobileOS=ETC&MobileApp=CoursUs`
    + `&keyword=${encodeURIComponent(keyword)}&numOfRows=10&pageNo=1&_type=json`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 80)}`);

  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`응답이 JSON이 아님: ${text.slice(0, 80)}`); }

  let items = json.response?.body?.items?.item;
  if (!items) return null;
  if (!Array.isArray(items)) items = [items];

  // 좌표가 있으면 2km 이내만
  let cands = items;
  if (lat && lng){
    cands = items.filter(it =>
      it.mapy && it.mapx &&
      distKm(lat, lng, Number(it.mapy), Number(it.mapx)) <= MAX_DIST_KM);
  }
  if (!cands.length) return null;

  // 관광지(76) > 문화시설(78) > 그 외 (기념품숍·상점 회피)
  cands.sort((a, b) => {
    const rank = t => t === '76' ? 0 : t === '78' ? 1 : 2;
    return rank(a.contenttypeid) - rank(b.contenttypeid);
  });

  const title = (cands[0].title || '').trim();
  const en = title
    .replace(/\s*\[.*?\]\s*/g, ' ')          // [Tax Refund Shop] 류 제거
    .replace(/\s*\(.*?\)\s*$/g, '')          // 끝의 (한글명) 제거
    .replace(/\s{2,}/g, ' ')
    .trim();
  return (en && !hasHangul(en)) ? en : null;
}

// 재시도 포함 검색: 원래 이름 → 공백 제거 → 쉼표/괄호 앞부분
async function lookupName(nameKo, lat, lng){
  let en = await searchOnce(nameKo, lat, lng);

  if (!en && nameKo.includes(' ')){
    await sleep(DELAY_MS);
    en = await searchOnce(nameKo.replace(/\s/g, ''), lat, lng);
  }

  if (!en && /[,(]/.test(nameKo)){
    await sleep(DELAY_MS);
    const head = nameKo.split(/[,(]/)[0].trim();
    if (head && head !== nameKo) en = await searchOnce(head, lat, lng);
  }

  return en;
}

async function main(){
  if (!KEY || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY){
    console.error('⚠️  .env에 키 3개를 확인하세요.'); return;
  }

  const { data, error } = await sb.from('places')
    .select('id, name_en, name_ko, lat, lng')
    .eq('category', 'attraction');
  if (error){ console.error(error); return; }

  const targets = (data || []).filter(p => p.name_ko);
  console.log(`명소 ${targets.length}곳 검색 시작 (키워드 + 재시도)\n`);

  const found = [], missed = [];
  for (let i = 0; i < targets.length; i++){
    const p = targets[i];
    try {
      const en = await lookupName(p.name_ko, p.lat, p.lng);
      if (en){
        found.push({ id: p.id, ko: p.name_ko, to: en });
        console.log(`  ✔ ${p.name_ko}  →  ${en}`);
      } else {
        missed.push(p.name_ko);
      }
    } catch(e){
      console.error(`  ✖ ${p.name_ko}: ${e.message}`);
      if (i === 0 && /Unauthorized|REGISTERED|JSON이 아님/i.test(e.message)){
        console.error('\n⚠️  키 문제로 보입니다. 나중에 다시 시도하세요.');
        return;
      }
      missed.push(p.name_ko);
    }
    if ((i + 1) % 20 === 0) console.log(`   --- ${i + 1}/${targets.length} ---`);
    await sleep(DELAY_MS);
  }

  console.log(`\n매칭 성공 ${found.length}곳 / 못 찾음 ${missed.length}곳`);
  writeFileSync('fill-names-missed.txt', missed.join('\n'));
  console.log('못 찾은 목록: fill-names-missed.txt → romanize.js로 로마자 처리');

  if (!APPLY){
    console.log('\n미리보기 모드. 반영하려면:  node fill-names.js --apply');
    return;
  }

  console.log('\n반영 중...');
  let done = 0;
  for (const u of found){
    const { error } = await sb.from('places').update({ name_en: u.to }).eq('id', u.id);
    if (error){ console.error('❌', u.ko, error.message); continue; }
    done++;
  }
  console.log(`\n✅ 완료: ${done}곳에 정식 영문명 반영. name_ko는 보존됨.`);
}

main().catch(e => console.error('❌', e.message));