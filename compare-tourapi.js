/* ═══════════════════════════════════════════════════════
   CoursUs 대조 스크립트 — TourAPI 부산 전체 명소 vs 우리 DB
   TourAPI 영문 서비스의 부산 관광지/문화시설 전체를 받아서:
     1) fill-names에서 못 찾은 곳 중 실제로는 TourAPI에 있는 것 찾기
        (이름 표기 차이로 검색이 놓친 것 → 자동 매칭 제안)
     2) TourAPI에는 있는데 우리 DB에 없는 명소 목록 뽑기 (보강 후보)

   준비:  .env (DATA_GO_KR_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY)
   실행:
     node compare-tourapi.js            결과 파일 3개 생성 (DB 안 건드림)
     node compare-tourapi.js --apply    1)의 자동 매칭을 DB에 반영
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const KEY = process.env.DATA_GO_KR_KEY;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPLY = process.argv.includes('--apply');

const ENDPOINT = 'http://apis.data.go.kr/B551011/EngService2/areaBasedList2';
const AREA_BUSAN = 6;
const TYPES = ['76', '78'];   // 관광지, 문화시설
const MAX_DIST_KM = 2;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || '').replace(/[\s\-·,()\[\]]/g, '');   // 공백·기호 무시 비교

function distKm(lat1, lng1, lat2, lng2){
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*d/2)**2
    + Math.cos(lat1*d) * Math.cos(lat2*d) * Math.sin((lng2-lng1)*d/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// TourAPI 부산 전체 (타입별, 전 페이지)
async function fetchBusanAll(){
  const all = [];
  for (const type of TYPES){
    let page = 1;
    while (true){
      const url = `${ENDPOINT}?serviceKey=${KEY}&MobileOS=ETC&MobileApp=CoursUs`
        + `&areaCode=${AREA_BUSAN}&contentTypeId=${type}`
        + `&numOfRows=100&pageNo=${page}&_type=json`;
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 80)}`);
      const json = JSON.parse(text);
      let items = json.response?.body?.items?.item;
      if (!items) break;
      if (!Array.isArray(items)) items = [items];
      all.push(...items);
      const total = Number(json.response?.body?.totalCount || 0);
      console.log(`  타입${type} p${page}: 누적 ${all.length}`);
      if (page * 100 >= total) break;
      page++;
      await sleep(150);
    }
    await sleep(150);
  }
  return all;
}

// title "Busan Gamcheon Culture Village (부산 감천문화마을)" → { en, ko }
function splitTitle(title){
  const m = (title || '').match(/^(.*?)\s*\(([^)]*[가-힣][^)]*)\)\s*$/);
  if (m) return { en: m[1].replace(/\s*\[.*?\]\s*/g, ' ').replace(/\s{2,}/g,' ').trim(), ko: m[2].trim() };
  return { en: (title || '').trim(), ko: '' };
}

async function main(){
  if (!KEY){ console.error('⚠️  .env 키 확인'); return; }

  console.log('1) TourAPI 부산 전체 명소 수집...');
  const tour = await fetchBusanAll();
  console.log(`   총 ${tour.length}건\n`);

  // 전체 목록 저장 (참고용)
  writeFileSync('tourapi-busan-all.txt',
    tour.map(t => `${t.title}  [type ${t.contenttypeid}]`).join('\n'));

  console.log('2) 우리 DB 명소 로드...');
  const { data, error } = await sb.from('places')
    .select('id, name_en, name_ko, lat, lng')
    .eq('category', 'attraction');
  if (error){ console.error(error); return; }

  // 아직 영문명 없는(한글이거나 로마자 전) = fill-names가 못 채운 대상
  const unresolved = data.filter(p => /[가-힣]/.test(p.name_en || ''));
  console.log(`   명소 ${data.length}곳 중 영문명 미확정 ${unresolved.length}곳\n`);

  console.log('3) 대조...');
  const matched = [], stillMissing = [];
  const usedTourIds = new Set();

  for (const p of unresolved){
    const pn = norm(p.name_ko);
    // 이름 유사(정규화 후 포함관계) + 좌표 2km 이내
    const hit = tour.find(t => {
      const { ko } = splitTitle(t.title);
      const tn = norm(ko || t.title);
      const nameOk = tn.includes(pn) || pn.includes(tn);
      if (!nameOk) return false;
      if (p.lat && p.lng && t.mapy && t.mapx){
        return distKm(p.lat, p.lng, Number(t.mapy), Number(t.mapx)) <= MAX_DIST_KM;
      }
      return true;   // 좌표 없으면 이름만으로
    });
    if (hit){
      const { en } = splitTitle(hit.title);
      if (en && !/[가-힣]/.test(en)){
        matched.push({ id: p.id, ko: p.name_ko, to: en });
        usedTourIds.add(hit.contentid);
        continue;
      }
    }
    stillMissing.push(p.name_ko);
  }

  // 역방향: TourAPI에 있는데 우리 DB에 없는 명소 (보강 후보)
  const ourNames = new Set(data.map(p => norm(p.name_ko)));
  const notInOurs = tour.filter(t => {
    const { ko } = splitTitle(t.title);
    const tn = norm(ko || '');
    if (!tn) return false;
    return ![...ourNames].some(on => on.includes(tn) || tn.includes(on));
  });

  // 결과 저장
  writeFileSync('compare-matched.txt',
    matched.map(m => `${m.ko}  →  ${m.to}`).join('\n'));
  writeFileSync('compare-still-missing.txt', stillMissing.join('\n'));
  writeFileSync('compare-not-in-db.txt',
    notInOurs.map(t => t.title).join('\n'));

  console.log(`\n결과:`);
  console.log(`  ✔ 추가 매칭 가능: ${matched.length}곳  → compare-matched.txt`);
  matched.slice(0, 15).forEach(m => console.log(`     ${m.ko}  →  ${m.to}`));
  if (matched.length > 15) console.log(`     ... 외 ${matched.length - 15}곳`);
  console.log(`  ✖ TourAPI에 정말 없음: ${stillMissing.length}곳  → compare-still-missing.txt (로마자 처리 대상)`);
  console.log(`  ➕ TourAPI엔 있는데 우리 DB에 없음: ${notInOurs.length}곳  → compare-not-in-db.txt (보강 후보)`);

  if (!APPLY){
    console.log('\n미리보기 모드. 추가 매칭을 반영하려면:  node compare-tourapi.js --apply');
    return;
  }

  console.log('\n반영 중...');
  let done = 0;
  for (const u of matched){
    const { error } = await sb.from('places').update({ name_en: u.to }).eq('id', u.id);
    if (error){ console.error('❌', u.ko, error.message); continue; }
    done++;
  }
  console.log(`\n✅ 완료: ${done}곳 추가 반영.`);
}

main().catch(e => console.error('❌', e.message));