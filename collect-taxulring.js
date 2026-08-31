/* ═══════════════════════════════════════════════════════
   CoursUs 택슐랭 수집 — 부산 택시기사 추천 로컬 맛집 48곳
   출처: 공공데이터포털 「부산광역시_택슐랭 선정 식당」
        (10년 이상 경력 택시기사 설문으로 선정 · 원도심 4개 구)

   왜 가치 있나:
     관광 홍보용 목록이 아니라 현지인 기준 맛집이라
     CoursUs가 지향하는 "locals actually eat here"와 맞는다.
     카페 16곳이 포함돼 부족했던 카페 데이터도 채워진다.

   준비:
     .env (SUPABASE_URL / SUPABASE_SERVICE_KEY)
     CSV 파일을 이 스크립트와 같은 폴더에 두기
     npm install csv-parse   (아직 없다면)

   실행:
     node collect-taxulring.js                    미리보기
     node collect-taxulring.js --insert           실제 입력
     node collect-taxulring.js --file=다른이름.csv  파일명 지정
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const args = process.argv.slice(2);
const DO_INSERT = args.includes('--insert');
const FILE_ARG = (args.find(a => a.startsWith('--file=')) || '').split('=')[1];

const MAX_DIST_KM = 0.15;   // 150m 이내 + 이름 비슷 → 같은 가게로 판단

/* 분류 → category 매핑 (카페만 cafe, 나머지는 음식점) */
function toCategory(bunryu){
  return (bunryu || '').includes('카페') ? 'cafe' : 'restaurant';
}

/* 분류 → 영문 요리 종류 (subcategory 앞에 붙여 표시) */
const CUISINE_EN = {
  '한식':'Korean', '중식':'Chinese', '일식':'Japanese',
  '양식':'Western', '분식':'Snack bar', '카페':'Cafe',
};

const norm = s => (s || '').replace(/[\s\-·,()（）]/g, '').toLowerCase();

function distKm(lat1, lng1, lat2, lng2){
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*d/2)**2
    + Math.cos(lat1*d) * Math.cos(lat2*d) * Math.sin((lng2-lng1)*d/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* 아주 단순한 CSV 파서 — 따옴표로 감싼 필드(추천메뉴의 쉼표) 처리 */
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (inQuote){
      if (c === '"'){
        if (text[i+1] === '"'){ field += '"'; i++; }
        else inQuote = false;
      } else field += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

async function main(){
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY){
    console.error('⚠️  .env에 SUPABASE_URL / SUPABASE_SERVICE_KEY 필요'); return;
  }

  // 파일 찾기
  let file = FILE_ARG;
  if (!file){
    const found = readdirSync('.').find(f => f.includes('택슐랭') && f.endsWith('.csv'));
    if (!found){ console.error('⚠️  택슐랭 CSV를 찾을 수 없습니다. --file=파일명.csv 로 지정하세요.'); return; }
    file = found;
  }
  console.log(`파일: ${file}\n`);

  // BOM 제거 후 파싱
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCSV(text);
  const header = rows[0].map(h => h.replace(/^\uFEFF|癤�/g, '').trim());
  const idx = name => header.findIndex(h => h.includes(name));

  const iArea = idx('위치'), iName = idx('식당명'), iCat = idx('분류'),
        iAddr = idx('주소'), iMenu = idx('추천메뉴'), iLat = idx('위도'), iLng = idx('경도');

  const items = rows.slice(1).map(r => ({
    area: r[iArea]?.trim(),
    name: r[iName]?.trim(),
    bunryu: r[iCat]?.trim(),
    addr: r[iAddr]?.trim(),
    menu: r[iMenu]?.trim(),
    lat: Number(r[iLat]),
    lng: Number(r[iLng]),
  })).filter(x => x.name && x.lat && x.lng);

  console.log(`CSV ${items.length}곳 읽음`);
  const byCat = {};
  items.forEach(x => byCat[x.bunryu] = (byCat[x.bunryu] || 0) + 1);
  console.log('분류:', byCat, '\n');

  // 기존 데이터와 중복 확인
  const { data: existing, error } = await sb.from('places')
    .select('id, name_ko, name_en, lat, lng, is_local, subcategory');
  if (error){ console.error(error); return; }

  const fresh = [], dupes = [];
  for (const x of items){
    const hit = (existing || []).find(p => {
      if (!p.lat || !p.lng) return false;
      const near = distKm(x.lat, x.lng, p.lat, p.lng) <= MAX_DIST_KM;
      if (!near) return false;
      const a = norm(x.name), b = norm(p.name_ko);
      return a.includes(b) || b.includes(a) || a === b;
    });
    if (hit) dupes.push({ ...x, existingId: hit.id, existingName: hit.name_ko });
    else fresh.push(x);
  }

  console.log(`신규 ${fresh.length}곳 / 이미 있음 ${dupes.length}곳\n`);
  if (dupes.length){
    console.log('[이미 등록된 곳 — is_local 표시만 갱신]');
    dupes.forEach(d => console.log(`  · ${d.name}  (DB: ${d.existingName})`));
    console.log('');
  }
  console.log('[신규 등록 대상]');
  fresh.forEach(x => console.log(`  + ${x.name}  [${x.bunryu}] ${x.area} — ${x.menu || ''}`));

  const newRows = fresh.map((x, i) => ({
    source:      'taxulring',
    external_id: `${x.area}-${norm(x.name)}`.slice(0, 60),
    name_en:     '',                       // 로마자 변환은 romanize.js가 처리
    name_ko:     x.name,
    category:    toCategory(x.bunryu),
    subcategory: [CUISINE_EN[x.bunryu] || x.bunryu, x.menu].filter(Boolean).join(' · ') || null,
    address:     x.addr || null,
    area:        x.area,
    city:        'Busan',
    lat:         x.lat,
    lng:         x.lng,
    image_url:   null,
    i18n:        {},
    is_local:    true,        // 택시기사 추천 = 현지인 맛집
    solo_ok: null, english_menu: null, foreign_card: null, spice_level: null,
    sort_order:  3,           // 일반 수집(0)보다 위, 큐레이션 완료(10)보다 아래
  }));

  if (!DO_INSERT){
    writeFileSync('preview-taxulring.json', JSON.stringify(newRows, null, 2));
    console.log('\n✅ 미리보기: preview-taxulring.json 저장');
    console.log('   실제 입력:  node collect-taxulring.js --insert');
    return;
  }

  console.log('\n▶ 신규 등록...');
  if (newRows.length){
    const { error: e1 } = await sb.from('places')
      .upsert(newRows, { onConflict: 'source,external_id' });
    if (e1){ console.error('❌', e1.message); return; }
    console.log(`   ${newRows.length}곳 등록 완료`);
  }

  console.log('▶ 기존 등록분에 Local Favorite 표시...');
  let marked = 0;
  for (const d of dupes){
    const { error: e2 } = await sb.from('places')
      .update({ is_local: true }).eq('id', d.existingId);
    if (!e2) marked++;
  }
  console.log(`   ${marked}곳 표시 완료`);

  console.log('\n✅ 완료!');
  console.log('   다음: node romanize.js  →  --apply  (새로 들어온 한글 이름을 영문 표기로)');
}

main().catch(e => console.error('❌', e.message));