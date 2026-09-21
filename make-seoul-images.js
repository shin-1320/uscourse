/* ═══════════════════════════════════════════════════════
   서울 가게 사진 채우기

   비짓서울 데이터에는 사진 칸이 없습니다.
   대신 가게마다 비짓서울 페이지 주소가 있고, 그 페이지에는
   대표 사진이 걸려 있습니다(og:image). 그 주소만 뽑아옵니다.

   사진 파일을 내려받지 않습니다. 부산과 마찬가지로
   원본 주소를 그대로 걸어 두는 방식입니다.

   결과는 SQL 파일입니다. Supabase SQL Editor 에서 실행하세요.

   실행
     node make-seoul-images.js seoul.json
   ═══════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'fs';

const FILE = process.argv[2];
if (!FILE){
  console.error('JSON 파일을 지정하세요.  node make-seoul-images.js seoul.json');
  process.exit(1);
}

const SEOUL_GU = ['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구',
  '강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구','구로구',
  '금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sq = v => String(v).replace(/'/g, "''");

/* 페이지에서 대표 사진 주소를 찾는다 */
async function ogImage(url){
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return null;
    /* 웹페이지 안에서는 & 가 &amp; 로 적혀 있다. 그대로 넣으면 사진이 안 뜬다. */
    let src = m[1].trim()
      .replace(/&amp;/g, '&').replace(/&#38;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (src.startsWith('//')) src = 'https:' + src;
    // 사이트 로고 같은 공통 이미지는 쓰지 않는다
    if (/logo|default|noimage|no_image/i.test(src)) return null;
    return src;
  } catch(e){
    return null;
  }
}

async function main(){
  const j = JSON.parse(readFileSync(FILE, 'utf8'));
  const data = j.DATA || j.data || (Array.isArray(j) ? j : []);

  /* 업로드한 CSV 와 같은 기준으로 가게를 묶는다 —
     한국어판 행이 있는 가게만. 그래야 이름이 DB 와 맞는다. */
  const slugOf = (u) => {
    const m = (u || '').match(/\/restaurants\/([^/]+)\/([A-Z]{2})(\w+)/);
    return m ? m[1] + '|' + m[3] : null;
  };
  const groups = new Map();
  for (const x of data){
    const name = (x.post_sj || '').trim();
    const url  = (x.post_url || '').trim();
    if (!name) continue;
    const key = slugOf(url) || ('addr:' + (x.address || '').replace(/\s+/g, ''));
    if (!groups.has(key)) groups.set(key, { urls:{}, ko:'', addr:'', naddr:[] });
    const g = groups.get(key);
    g.urls[x.lang_code_id] = url;
    if (x.lang_code_id === 'ko'){ g.ko = name; g.addr = (x.address || '').trim(); }
    if (x.new_address) g.naddr.push(x.new_address);
  }
  const places = [...groups.values()].filter(g => g.ko && /[가-힣]/.test(g.addr));
  console.log(`\n가게 ${places.length}곳의 대표 사진을 찾습니다…\n`);

  const sql = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < places.length; i++){
    const g = places[i];
    const hay = [g.addr, ...g.naddr].join(' ');
    const gu = SEOUL_GU.find(x => hay.includes(x));

    // 한국어 페이지 먼저, 없으면 영어
    let img = await ogImage(g.urls['ko']);
    if (!img && g.urls['en']) img = await ogImage(g.urls['en']);

    if (img && gu){
      ok++;
      sql.push(`update places set image_url = '${sq(img)}' ` +
        `where source = 'visitseoul' and name_ko = '${sq(g.ko)}' and area = '${sq(gu)}' ` +
        `and image_url is null;`);
    } else fail++;

    if (i % 20 === 0 || i === places.length - 1){
      process.stdout.write(`\r  ${i+1} / ${places.length}   찾음 ${ok} · 못 찾음 ${fail}   `);
    }
    await sleep(150);   // 비짓서울에 부담을 주지 않도록 천천히
  }
  console.log();

  /* 한 파일에 다 넣으면 SQL Editor 에 붙여넣다 중간에 잘린다.
     300줄씩 나눠 여러 파일로 저장한다. */
  const CHUNK = 300;
  const files = [];
  for (let k = 0; k < sql.length; k += CHUNK){
    const name = `seoul-images-${String(files.length + 1).padStart(2, '0')}.sql`;
    writeFileSync(name,
`-- 서울 가게 대표 사진 ${files.length + 1}번째 묶음
-- 이미 사진이 있는 곳은 건드리지 않습니다 (image_url is null 조건)

${sql.slice(k, k + CHUNK).join('\n')}
`);
    files.push(name);
  }
  console.log(`\n  ${ok}곳 · ${files.length}개 파일로 나눴습니다`);
  files.forEach(f => console.log('   ', f));
  console.log('\n  하나씩 Supabase → SQL Editor 에 붙여넣고 실행하세요.');
}

main().catch(e => console.error('\n오류:', e.message));