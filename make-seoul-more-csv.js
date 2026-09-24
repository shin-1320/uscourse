/* ═══════════════════════════════════════════════════════
   서울 새 가게 좌표 받기

   seoul-more.json 에는 외국어판에만 실려 있던 새 가게 931곳이 들어 있습니다.
   주소는 이미 한국어로 바꿔 두었습니다.
     首爾市江南區論峴洞16-1        → 서울 강남구 논현동 16-1
     416, Apgujeong-ro, Gangnam-gu → 서울 강남구 압구정로 416
   이 스크립트는 카카오로 좌표만 받아 업로드용 CSV 를 만듭니다.

   이름은 실려 있던 언어 그대로 씁니다.
     영어판 가게는 영어 이름, 일본어판 가게는 일본어 이름.

   실행
     node make-seoul-more-csv.js
   결과
     seoul-more-for-supabase.csv
     → Supabase → Table Editor → places → Insert → Import data from CSV
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY){ console.error('.env 에 KAKAO_REST_KEY 가 없습니다.'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const WHY = { ok:0, empty:0, limit:0, error:0 };

async function geocode(addr){
  for (let attempt = 0; attempt < 4; attempt++){
    try {
      const res = await fetch(
        'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(addr),
        { headers: { Authorization: 'KakaoAK ' + KEY } });
      if (res.status === 401 || res.status === 403){
        console.error('\n카카오가 요청을 거부했습니다:', (await res.text()).slice(0, 160));
        process.exit(1);
      }
      if (res.status === 429){ WHY.limit++; await sleep(1000 * (attempt + 1)); continue; }
      if (!res.ok){ WHY.error++; return null; }
      const d = ((await res.json()).documents || [])[0];
      if (!d){ WHY.empty++; return null; }
      WHY.ok++;
      return { lat: Number(d.y), lng: Number(d.x) };
    } catch(e){ WHY.error++; await sleep(500); }
  }
  return null;
}

async function main(){
  const items = JSON.parse(readFileSync('seoul-more.json', 'utf8'));
  console.log(`\n새 가게 ${items.length}곳의 좌표를 받습니다…\n`);

  const out = [];
  let ok = 0, fail = 0;
  for (let i = 0; i < items.length; i++){
    const it = items[i];
    let co = null;
    for (const a of it.cands){
      co = await geocode(a);
      if (co) break;
      await sleep(40);
    }
    if (co){
      ok++;
      const n = it.names;
      const i18n = {};
      if (n['ja'])    i18n.ja  = { name: n['ja'] };
      if (n['zh-TW']) i18n.zh  = { name: n['zh-TW'] };
      if (n['zh-CN']) i18n.zhs = { name: n['zh-CN'] };
      out.push({
        // 한국어 이름이 없는 가게라, 실려 있던 언어의 이름을 그대로 쓴다
        name_ko:  n['en'] || n['ja'] || n['zh-TW'] || n['zh-CN'],
        name_en:  n['en'] || '',
        address:  it.cands[0],
        area:     it.area,
        lat:      co.lat,
        lng:      co.lng,
        category: it.cafe ? 'cafe' : 'restaurant',
        subcategory: '',
        source:   'visitseoul',
        i18n:     JSON.stringify(i18n),
      });
    } else fail++;

    if (i % 20 === 0 || i === items.length - 1){
      process.stdout.write(`\r  ${i+1} / ${items.length}   찾음 ${ok} · 못 찾음 ${fail}   `);
    }
    await sleep(80);
  }
  console.log();

  const cols = ['name_ko','name_en','address','area','lat','lng','category','subcategory','source','i18n'];
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  writeFileSync('seoul-more-for-supabase.csv',
    '\uFEFF' + [cols.join(',')].concat(out.map(r => cols.map(c => esc(r[c])).join(','))).join('\n'));

  console.log(`\n  seoul-more-for-supabase.csv  (${out.length}곳)`);
  console.log(`  카카오 응답: 찾음 ${WHY.ok} · 주소를 모름 ${WHY.empty} · 한도 재시도 ${WHY.limit} · 오류 ${WHY.error}`);
  console.log('\n  Supabase → Table Editor → places → Insert → Import data from CSV');
}

main().catch(e => console.error('\n오류:', e.message));