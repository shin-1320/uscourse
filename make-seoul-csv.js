/* ═══════════════════════════════════════════════════════
   비짓서울 CSV → Supabase 업로드용 CSV

   한 번만 돌리면 됩니다. 결과로 나온 CSV 를
   Supabase 화면에서 올리면 끝입니다.
     Table Editor → places → Insert → Import data from CSV

   ── 무엇을 하나 ──────────────────────────────────────
   1. 주소로 언어별 행을 묶습니다
      같은 가게가 언어마다 다른 줄로 흩어져 있는데,
      주소만은 어느 언어 행이든 한국어로 같습니다.
      "통영굴밥"과 "統營牡蠣飯"이 같은 가게임을 이걸로 압니다.

   2. 주소를 좌표로 바꿉니다 (카카오 지도)
      좌표가 없으면 거리순 목록에 올릴 수 없습니다.

   3. 주소에서 구 이름을 뽑습니다
      화면의 지역 칩과 맞아야 하므로 한글 그대로 둡니다.

   ── 준비 ─────────────────────────────────────────────
   .env 에 카카오 REST API 키를 넣으세요.
     KAKAO_REST_KEY=발급받은키

   ── 실행 ─────────────────────────────────────────────
     node make-seoul-csv.js 서울시_관광_음식.csv

   6,531 행이지만 주소로 묶으면 실제 가게는 그보다 적습니다.
   카카오는 하루 30만 건까지 무료라 한 번에 끝납니다.
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY){
  console.error('.env 에 KAKAO_REST_KEY 가 없습니다.');
  console.error('developers.kakao.com → 내 애플리케이션 → 앱 키 → REST API 키');
  process.exit(1);
}

const FILE = process.argv[2];
if (!FILE){
  console.error('CSV 파일을 지정하세요.');
  console.error('  node make-seoul-csv.js 서울시_관광_음식.json   (권장)');
  process.exit(1);
}

const SEOUL_GU = ['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구',
  '강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구','구로구',
  '금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구'];

/* 영어 주소에서 구를 찾기 위한 대응표.
   비짓서울 데이터는 언어별로 주소도 번역되어 있어,
   영어 행만 있는 곳은 "Gangnam-gu" 처럼 로마자로만 적혀 있다. */
const GU_EN = [
  ['종로구','Jongno'],   ['중구','Jung-gu'],     ['용산구','Yongsan'],
  ['성동구','Seongdong'], ['광진구','Gwangjin'],  ['동대문구','Dongdaemun'],
  ['중랑구','Jungnang'],  ['성북구','Seongbuk'],  ['강북구','Gangbuk'],
  ['도봉구','Dobong'],    ['노원구','Nowon'],     ['은평구','Eunpyeong'],
  ['서대문구','Seodaemun'],['마포구','Mapo'],     ['양천구','Yangcheon'],
  ['강서구','Gangseo'],   ['구로구','Guro'],      ['금천구','Geumcheon'],
  ['영등포구','Yeongdeungpo'], ['동작구','Dongjak'], ['관악구','Gwanak'],
  ['서초구','Seocho'],    ['강남구','Gangnam'],   ['송파구','Songpa'],
  ['강동구','Gangdong'],
];

/* 카페로 볼 만한 말. 없으면 음식점으로 둡니다. */
const CAFE_WORDS = ['카페','커피','coffee','cafe','베이커리','bakery','디저트','dessert',
                    '티하우스','찻집','로스터','roaster','브런치','brunch'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 이 CSV 는 cp949 로 저장되어 있어 중국어 번체·간체 일부가
   파일 안에서 이미 깨져 있습니다 (TAETEA旗?店 처럼).
   물음표가 섞인 이름은 쓰지 않습니다.
   잘못된 이름을 보여주는 것보다 없는 편이 낫습니다. */
const usable = (v) => (v && !/[?\uFFFD]/.test(v)) ? v : null;

/* ── CSV 읽기 ─────────────────────────────────────────
   따옴표 안의 쉼표와 줄바꿈을 지켜야 하므로 직접 훑습니다. */
function parseCSV(text){
  const rows = [];
  let row = [], cell = '', inQuote = false;

  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (inQuote){
      if (c === '"'){
        if (text[i+1] === '"'){ cell += '"'; i++; }
        else inQuote = false;
      } else cell += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ','){ row.push(cell); cell = ''; }
      else if (c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows;
}

/* 이 파일은 cp949 입니다. Node 에는 내장 디코더가 없으므로
   TextDecoder 의 euc-kr 을 씁니다 (cp949 를 포함합니다). */
function readKorean(path){
  const buf = readFileSync(path);
  // BOM 이 있으면 utf-8 입니다
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF){
    return buf.toString('utf8').slice(1);
  }
  try {
    return new TextDecoder('euc-kr').decode(buf);
  } catch(e){
    return buf.toString('utf8');
  }
}

/* ── 좌표 ─────────────────────────────────────────────
   도로명주소를 먼저 시도하고, 실패하면 지번주소로 다시 봅니다. */
const WHY = { ok:0, empty:0, limit:0, error:0 };   // 실패 원인 집계

async function geocode(addr){
  const clean = (addr || '')
    .replace(/^\d{5}\s*/, '')          // 우편번호 제거
    .replace(/\([^)]*\)/g, ' ')        // 괄호 안 설명 제거
    .replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  /* 너무 빨리 부르면 카카오가 거절한다(429).
     예전에는 이것도 "못 찾음"으로 세서 원인을 알 수 없었다.
     거절되면 잠시 쉬고 최대 세 번 다시 부른다. */
  for (let attempt = 0; attempt < 4; attempt++){
    try {
      const res = await fetch(
        'https://dapi.kakao.com/v2/local/search/address.json?query=' + encodeURIComponent(clean),
        { headers: { Authorization: 'KakaoAK ' + KEY } });

      if (res.status === 401 || res.status === 403){
        const t = await res.text();
        console.error('\n카카오가 요청을 거부했습니다:', t.slice(0, 160));
        console.error('카카오맵(지도/로컬) 활성화와 REST API 키를 확인하세요.');
        process.exit(1);
      }
      if (res.status === 429){
        WHY.limit++;
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!res.ok){ WHY.error++; return null; }

      const j = await res.json();
      const d = j.documents && j.documents[0];
      if (!d){ WHY.empty++; return null; }
      WHY.ok++;
      return { lat: Number(d.y), lng: Number(d.x) };
    } catch(e){
      WHY.error++;
      await sleep(500);
    }
  }
  return null;
}

/* ── 실행 ─────────────────────────────────────────── */
async function main(){
  console.log(`\n${FILE} 을 읽습니다…`);

  /* ── 원본 읽기 ─────────────────────────────────────
     JSON 을 권합니다. CSV 는 cp949 로 저장되어 중국어 일부가
     파일 안에서 이미 깨져 있는데(TAETEA旗?店), JSON 은 UTF-8 이라
     모든 언어가 온전합니다. 둘 다 같은 형태로 바꿔 씁니다. */
  let recs = [];

  if (FILE.toLowerCase().endsWith('.json')){
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    const data = j.DATA || j.data || (Array.isArray(j) ? j : []);
    recs = data.map(x => ({
      lang:  (x.lang_code_id    || x.LANG_CODE_ID    || '').trim(),
      name:  (x.post_sj         || x.POST_SJ         || '').trim(),
      addr:  (x.address         || x.ADDRESS         || '').trim(),
      naddr: (x.new_address     || x.NEW_ADDRESS     || '').trim(),
      menu:  (x.fd_reprsnt_menu || x.FD_REPRSNT_MENU || '').trim(),
      time:  (x.cmmn_use_time   || x.CMMN_USE_TIME   || '').trim(),
      url:   (x.post_url        || x.POST_URL        || '').trim(),
    }));
  } else {
    const rows = parseCSV(readKorean(FILE));
    const head = rows[0].map(h => h.trim());
    const idx = (name) => head.findIndex(h => h.includes(name));
    const C = { lang:idx('언어'), name:idx('상호'), addr:idx('주소'), naddr:idx('신주소'),
                menu:idx('대표메뉴'), time:idx('운영시간'), url:idx('콘텐츠URL') };
    if (C.name < 0 || C.addr < 0){
      console.error('상호명 또는 주소 열을 찾지 못했습니다.');
      return;
    }
    const at = (r, i) => (i >= 0 && r[i] ? r[i].trim() : '');
    recs = rows.slice(1).filter(r => r && r.length > 3).map(r => ({
      lang: at(r,C.lang), name: at(r,C.name), addr: at(r,C.addr), naddr: at(r,C.naddr),
      menu: at(r,C.menu), time: at(r,C.time), url: at(r,C.url),
    }));
  }

  /* 콘텐츠 URL 로 묶습니다.
     같은 가게가 언어마다 다른 줄로 흩어져 있는데,
     URL 안에 같은 식별자가 들어 있습니다.

       korean.visitseoul.net/restaurants/2024-tygulbap/KOPog3m2l
       tchinese.visitseoul.net/restaurants/2024-tygulbap/TCPog3m2l

     주소로 묶어 봤더니 표기가 조금씩 달라 대부분 따로 놀았습니다. */
  const slugOf = (u) => {
    const m = (u || '').match(/\/restaurants\/([^/]+)\/([A-Z]{2})(\w+)/);
    return m ? m[1] + '|' + m[3] : null;
  };

  const byAddr = new Map();
  for (const r of recs){
    if (!r.name) continue;
    const key = slugOf(r.url) || ('addr:' + r.addr.replace(/\s+/g, ''));
    if (!byAddr.has(key)) byAddr.set(key, { addr:'', langs:{}, naddr:{}, menu:'', time:'' });

    const g = byAddr.get(key);
    g.langs[r.lang] = r.name;
    // 한국어 행의 주소를 기준으로 — 좌표 변환이 정확합니다
    if (r.lang === 'ko' && r.addr) g.addr = r.addr;
    if (!g.addr && r.addr) g.addr = r.addr;
    if (r.naddr) g.naddr[r.lang] = r.naddr;
    if (r.menu && !g.menu) g.menu = r.menu;
    if (r.time && !g.time) g.time = r.time;
  }

  /* 한국어판 행이 있는 가게만 씁니다.
     그 행은 주소가 전부 한국어라 카카오가 확실히 알아듣습니다.
     다른 언어판에만 실린 가게는 주소도 그 언어로만 있어 좌표를 구할 수 없습니다.
     대신 한국어판 가게에는 같은 가게의 일본어·중국어 이름을 붙여 둡니다. */
  const all = [...byAddr.values()];
  const places = all.filter(p => p.langs['ko'] && /[가-힣]/.test(p.addr || ''));
  console.log(`  한국어판이 있는 가게만 씁니다: ${places.length} / ${all.length}`);
  console.log(`  ${recs.length} 행 → 가게 ${places.length} 곳`);

  const langCount = {};
  places.forEach(p => {
    const n = Object.keys(p.langs).length;
    langCount[n] = (langCount[n] || 0) + 1;
  });
  console.log('  언어 수별 분포:',
    Object.entries(langCount).sort().map(([k,v]) => `${k}개=${v}`).join(' · '));

  /* 좌표 붙이기 */
  console.log('\n좌표를 받아옵니다…');
  const out = [];
  let ok = 0, fail = 0, skipped = 0;

  for (let i = 0; i < places.length; i++){
    const p = places[i];

    // 도로명주소(한국어)가 있으면 그쪽이 더 정확합니다
    // 한국어 주소만 쓴다 — 도로명 먼저, 안 되면 지번
    const hasKo = (v) => /[가-힣]/.test(v || '');
    const cands = [p.naddr['ko'], p.addr].filter(hasKo);

    let co = null;
    for (const a of cands){
      co = await geocode(a);
      if (co) break;
      await sleep(30);
    }

    if (co) ok++; else if (cands.length) fail++;

    /* 구 이름 — 한국어 주소에서 찾는다.
       영어 행만 있는 곳은 지번주소도 영어라 못 찾으므로,
       한국어 도로명주소와 영어 표기까지 함께 본다.
       (Gangnam-gu → 강남구) */
    const hay = [p.addr, ...Object.values(p.naddr)].filter(Boolean).join(' ');
    let gu = SEOUL_GU.find(g => hay.includes(g)) || null;
    if (!gu){
      const low = hay.toLowerCase();
      const en = GU_EN.find(([, e]) => low.includes(e.toLowerCase()));
      if (en) gu = en[0];
    }
    const nameKo = p.langs['ko'] || '';
    const nameEn = p.langs['en'] || '';
    const all = (nameKo + ' ' + nameEn).toLowerCase();
    const isCafe = CAFE_WORDS.some(w => all.includes(w));

    /* 한국어 이름이 없는 곳이 많다. 영어판만 등록된 가게들이다.
       지도 검색에 한국어 이름이 유용하지만, 없다고 버릴 이유는 없다.
       영어 이름이라도 있으면 넣는다. */
    if (co && gu && (nameKo || nameEn)){
      out.push({
        name_ko:   nameKo || nameEn,
        name_en:   nameEn || null,
        address:   (p.naddr['en'] || p.naddr['ko'] || p.addr).replace(/^\d{5}\s*/, ''),
        area:      gu,
        lat:       co.lat,
        lng:       co.lng,
        category:  isCafe ? 'cafe' : 'restaurant',
        subcategory: p.menu || null,
        source:    'visitseoul',
        i18n: JSON.stringify({
          ja:  usable(p.langs['ja'])    ? { name: p.langs['ja'] }    : undefined,
          zh:  usable(p.langs['zh-TW']) ? { name: p.langs['zh-TW'] } : undefined,
          zhs: usable(p.langs['zh-CN']) ? { name: p.langs['zh-CN'] } : undefined,
        }),
      });
    }

    if (i % 25 === 0 || i === places.length - 1){
      process.stdout.write(`\r  ${i+1} / ${places.length}   찾음 ${ok} · 못 찾음 ${fail}   `);
    }
    await sleep(80);   // 카카오 초당 제한을 넉넉히 피합니다
  }
  console.log();

  /* CSV 로 저장 — Supabase 의 Import 화면에서 바로 올릴 수 있습니다 */
  const cols = ['name_ko','name_en','address','area','lat','lng',
                'category','subcategory','source','i18n'];
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const csv = [cols.join(',')]
    .concat(out.map(r => cols.map(c => esc(r[c])).join(',')))
    .join('\n');

  writeFileSync('seoul-for-supabase.csv', '\uFEFF' + csv);

  const cafes = out.filter(r => r.category === 'cafe').length;
  console.log(`\n  seoul-for-supabase.csv  (${out.length}곳)`);
  console.log(`    카페 ${cafes} · 음식점 ${out.length - cafes}`);

  const byGu = {};
  out.forEach(r => { byGu[r.area] = (byGu[r.area] || 0) + 1; });
  console.log('\n  구별');
  Object.entries(byGu).sort((a,b) => b[1]-a[1]).slice(0, 10)
    .forEach(([g,n]) => console.log(`    ${g.padEnd(10)} ${n}`));

  console.log('\n  카카오 응답');
  console.log(`    찾음 ${WHY.ok} · 주소를 모름 ${WHY.empty} · 한도 초과 후 재시도 ${WHY.limit} · 기타 오류 ${WHY.error}`);

  console.log('\n다음 단계');
  console.log('  Supabase → Table Editor → places → Insert → Import data from CSV');
  console.log('  올린 뒤: node auto-curate.js --area=종로구');
}

main().catch(e => console.error('\n오류:', e.message));