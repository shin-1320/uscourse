/* ═══════════════════════════════════════════════════════
   CoursUs 전국 확장 — 국립공원(하이킹) 수집 → category 'nature'
   한국관광공사 TourAPI 영문 서비스에서 산악형 국립공원 19곳의
   정식 영문명·좌표·주소·공식 이미지를 받아 places에 넣습니다.

   준비:  .env (DATA_GO_KR_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY)
   실행:
     node collect-korea.js            미리보기 (DB 안 건드림)
     node collect-korea.js --insert   실제 입력
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const KEY = process.env.DATA_GO_KR_KEY;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const DO_INSERT = process.argv.includes('--insert');

const ENDPOINT = 'http://apis.data.go.kr/B551011/EngService2/searchKeyword2';
const DELAY_MS = 200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 산악형 국립공원 19곳 — { 검색 키워드, 표시할 지역(도), name_ko } */
const PARKS = [
  { ko:'설악산국립공원',   area:'Gangwon' },
  { ko:'오대산국립공원',   area:'Gangwon' },
  { ko:'치악산국립공원',   area:'Gangwon' },
  { ko:'태백산국립공원',   area:'Gangwon' },
  { ko:'북한산국립공원',   area:'Seoul · Gyeonggi' },
  { ko:'소백산국립공원',   area:'Chungbuk · Gyeongbuk' },
  { ko:'월악산국립공원',   area:'Chungbuk' },
  { ko:'속리산국립공원',   area:'Chungbuk · Gyeongbuk' },
  { ko:'계룡산국립공원',   area:'Chungnam' },
  { ko:'덕유산국립공원',   area:'Jeonbuk' },
  { ko:'내장산국립공원',   area:'Jeonbuk · Jeonnam' },
  { ko:'지리산국립공원',   area:'Jeonnam · Gyeongnam' },
  { ko:'무등산국립공원',   area:'Gwangju · Jeonnam' },
  { ko:'월출산국립공원',   area:'Jeonnam' },
  { ko:'가야산국립공원',   area:'Gyeongnam · Gyeongbuk' },
  { ko:'주왕산국립공원',   area:'Gyeongbuk' },
  { ko:'팔공산국립공원',   area:'Daegu · Gyeongbuk' },
  { ko:'한라산국립공원',   area:'Jeju' },
  { ko:'경주국립공원',     area:'Gyeongbuk' },   // 사적형이지만 남산 하이킹 유명 — 원치 않으면 이 줄 삭제
];

async function search(keyword){
  const url = `${ENDPOINT}?serviceKey=${KEY}&MobileOS=ETC&MobileApp=CoursUs`
    + `&keyword=${encodeURIComponent(keyword)}&numOfRows=10&pageNo=1&_type=json`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = JSON.parse(text);
  let items = json.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function pickBest(items, ko){
  // 관광지(76) 우선, title에 National Park 포함 우선
  const scored = items.map(it => {
    let s = 0;
    if (it.contenttypeid === '76') s += 2;
    if (/national park/i.test(it.title || '')) s += 3;
    if ((it.title || '').includes(ko.replace('국립공원',''))) s += 1;
    return { it, s };
  }).sort((a, b) => b.s - a.s);
  return scored[0]?.s > 0 ? scored[0].it : null;
}

function titleToEn(title){
  return (title || '')
    .replace(/\s*\[.*?\]\s*/g, ' ')
    .replace(/\s*\(.*?\)\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function main(){
  if (!KEY){ console.error('⚠️  .env 키 확인'); return; }

  console.log(`국립공원 ${PARKS.length}곳 수집 시작\n`);
  const rows = [], missed = [];

  for (const park of PARKS){
    try {
      // "설악산국립공원" → 안 나오면 "설악산"으로 재시도
      let items = await search(park.ko);
      if (!items.length){
        await sleep(DELAY_MS);
        items = await search(park.ko.replace('국립공원',''));
      }
      const best = pickBest(items, park.ko);
      if (!best){ missed.push(park.ko); console.log(`  ✖ ${park.ko}: 검색 결과 없음`); continue; }

      const en = titleToEn(best.title);
      rows.push({
        source:      'tourapi-npark',
        external_id: String(best.contentid),
        name_en:     en,
        name_ko:     park.ko,
        category:    'nature',
        subcategory: 'National Park · Hiking',
        address:     (best.addr1 || '').trim() || null,
        area:        park.area,
        city:        'Korea',
        lat:         best.mapy ? Number(best.mapy) : null,
        lng:         best.mapx ? Number(best.mapx) : null,
        image_url:   (best.firstimage || '').trim() || null,
        i18n:        {},
        solo_ok: null, english_menu: null, foreign_card: null,
        spice_level: null, is_local: false,
        sort_order: 5,     // 기본 수집분(0)보다 위, 큐레이션(10+)보다 아래
      });
      console.log(`  ✔ ${park.ko}  →  ${en}`);
      await sleep(DELAY_MS);
    } catch(e){
      console.error(`  ✖ ${park.ko}: ${e.message}`);
      missed.push(park.ko);
    }
  }

  console.log(`\n성공 ${rows.length} / 실패 ${missed.length}`);

  if (!DO_INSERT){
    writeFileSync('preview-korea.json', JSON.stringify(rows, null, 2));
    console.log('\n미리보기: preview-korea.json 저장. 확인 후 --insert 로 실행하세요.');
    return;
  }

  console.log('\nSupabase upsert...');
  const { error } = await sb.from('places').upsert(rows, { onConflict: 'source,external_id' });
  if (error){ console.error('❌', error.message); return; }
  console.log(`✅ 완료: ${rows.length}곳 입력. Nature 탭에서 확인하세요.`);
}

main().catch(e => console.error('❌', e.message));