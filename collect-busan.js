/* ═══════════════════════════════════════════════════════
   CoursUs 통합 수집 스크립트 — 부산시 관광 API → Supabase
   (collect-food.js / 이전 collect-busan.js 를 대체)

   수집 대상 (전부 같은 구조, 5개 언어 제공):
     FoodService/getFoodKr            맛집
     FoodieService/getFoodieKr        푸디투어
     AttractionService/getAttractionKr 명소
     ShoppingService/getShoppingKr    쇼핑

   준비:
     .env  (DATA_GO_KR_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY)
     각 API는 공공데이터포털에서 "활용신청" 필요 (자동승인·무료)

   사용법:
     node collect-busan.js                    전체 미리보기 → preview.json
     node collect-busan.js --insert           전체 입력 (신규 수집용)
     node collect-busan.js --i18n-only --insert
        → i18n 컬럼만 갱신. 이미 name_en을 영문명/로마자로 정리한 뒤
          간체(Zhs) 같은 언어를 추가할 때 사용. name_en·뱃지는 보존됨.
     node collect-busan.js --only=food        특정 서비스만
     node collect-busan.js --gugun=부산진구    특정 구만
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const args = process.argv.slice(2);
const DO_INSERT = args.includes('--insert');
const I18N_ONLY = args.includes('--i18n-only');   // i18n 컬럼만 갱신 (name_en 등 보존)
const GUGUN = (args.find(a => a.startsWith('--gugun=')) || '').split('=')[1] || null;
const ONLY  = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;

const sb = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '');

/* ── 수집할 서비스 ───────────────────────────────────
   base: 요청주소에서 언어 접미사(Kr/En/Ja/Zht) 앞까지 전체 경로
   category: 기본 카테고리 / auto: 가게명·메뉴로 카페 자동 분류 */
const SERVICES = [
  { id:'food',       base:'http://apis.data.go.kr/6260000/FoodService/getFood',             category:'restaurant', auto:true  },
  //{ id:'foodietour', base:'http://apis.data.go.kr/6260000/FoodieService/getFoodie',         category:'restaurant', auto:true  },
  { id:'attraction', base:'http://apis.data.go.kr/6260000/AttractionService/getAttraction', category:'attraction', auto:false },
  { id:'shopping',   base:'http://apis.data.go.kr/6260000/ShoppingService/getShopping',     category:'shopping',   auto:false },
];

// 언어별 접미사 — zh=번체(Zht), zhs=간체(Zhs)
const LANG_SUFFIX = { en:'En', ja:'Ja', zh:'Zht', zhs:'Zhs' };

// 요청주소(언어 접미사까지 붙인 전체 URL)로 전 페이지 수집
async function fetchAll(fullBase, suffix){
  const endpoint = fullBase.split('/').pop() + suffix;   // 예: getFoodieKr
  const rows = [];
  let page = 1;
  while (true) {
    const url = `${fullBase}${suffix}?serviceKey=${DATA_GO_KR_KEY}&pageNo=${page}&numOfRows=100&resultType=json`;
    const res = await fetch(url);
    if (!res.ok) {
      // 실패하면 어떤 주소를 불렀는지 그대로 보여줌 (키는 가림)
      throw new Error(`HTTP ${res.status}\n      호출한 주소: ${url.replace(DATA_GO_KR_KEY, '<KEY>')}`);
    }
    const json = await res.json();
    // 응답 최상위 키가 endpoint명인 경우가 표준. 아니면 첫 객체를 사용
    const body = json[endpoint]
      || json.response?.body
      || Object.values(json).find(v => v && typeof v === 'object' && (v.item || v.items))
      || {};
    const items = body.item || body.items?.item || [];
    if (!items.length) break;
    rows.push(...items);
    const total = Number(body.totalCount || 0);
    if (!total || rows.length >= total) break;
    page++;
  }
  return rows;
}

// 가게명 + 대표메뉴로 카페 판별 (소개글은 오판 유발하므로 제외)
function guessCategory(kr, en, fallback){
  const name = (kr.MAIN_TITLE || '').toLowerCase();
  const menu = [kr.RPRSNTV_MENU, en?.RPRSNTV_MENU].filter(Boolean).join(' ').toLowerCase();
  const text = name + ' ' + menu;

  const foodWords = ['국밥','밀면','냉면','칼국수','해장','곰탕','삼겹','고기','갈비','회','횟집',
    '초밥','스시','장어','곱창','막창','족발','보쌈','찜','탕','찌개','전골','분식','떡볶이',
    '순대','짜장','짬뽕','중화','파스타','피자','스테이크','뷔페','한정식','백반','정식','구이','쌈밥'];
  if (foodWords.some(w => text.includes(w))) return 'restaurant';

  const cafeKo = ['카페','커피','로스터','베이커리','디저트','제과','빙수','아이스크림','도넛','와플','브런치'];
  if (cafeKo.some(w => text.includes(w))) return 'cafe';

  const cafeEn = ['cafe','café','coffee','roasters','roastery','bakery','dessert','patisserie',
    'brunch','gelato','donut','waffle','espresso','latte'];
  const words = text.split(/[^a-z가-힣]+/);
  if (cafeEn.some(w => words.includes(w))) return 'cafe';

  return fallback;
}

function langEntry(r){
  return {
    name:    (r.MAIN_TITLE || r.TITLE || '').trim(),
    menu:    (r.RPRSNTV_MENU || r.SUBTITLE || '').trim(),
    hours:   (r.USAGE_DAY_WEEK_AND_TIME || '').trim(),
    address: (r.ADDR1 || '').trim(),
  };
}

function toPlace(cfg, kr, en, extra){
  const i18n = {};
  for (const [lang, map] of Object.entries(extra)) {
    const r = map[String(kr.UC_SEQ)];
    if (r) i18n[lang] = langEntry(r);
  }
  return {
    source:      'visitbusan-' + cfg.id,
    external_id: String(kr.UC_SEQ),
    name_en:     (en?.MAIN_TITLE || en?.TITLE || kr.MAIN_TITLE || '').trim(),
    name_ko:     (kr.MAIN_TITLE || '').trim(),
    category:    cfg.auto ? guessCategory(kr, en, cfg.category) : cfg.category,
    subcategory: (en?.RPRSNTV_MENU || kr.RPRSNTV_MENU || en?.SUBTITLE || kr.SUBTITLE || '').trim() || null,
    address:     (en?.ADDR1 || kr.ADDR1 || '').trim() || null,
    area:        (kr.GUGUN_NM || '').trim() || null,
    city:        'Busan',
    lat:         kr.LAT ? Number(kr.LAT) : null,
    lng:         kr.LNG ? Number(kr.LNG) : null,
    phone:       (kr.CNTCT_TEL || '').trim() || null,
    hours:       (en?.USAGE_DAY_WEEK_AND_TIME || kr.USAGE_DAY_WEEK_AND_TIME || '').trim() || null,
    image_url:   (kr.MAIN_IMG_NORMAL || '').trim() || null,
    i18n,
    // 큐레이션 필드는 확인 전이므로 null (확인 안 되면 안 찍는다)
    solo_ok: null, english_menu: null, foreign_card: null,
    spice_level: null, is_local: false,
    sort_order: 0,
  };
}

async function collectService(cfg){
  console.log(`\n▶ ${cfg.id}`);
  let krRows;
  try {
    krRows = await fetchAll(cfg.base, 'Kr');
    console.log(`   ✔ 한국어 ${krRows.length}곳`);
  } catch(e) {
    console.log(`   ✖ 실패 — 건너뜁니다: ${e.message}`);
    return [];
  }
  if (!krRows.length) return [];

  const enMap = {};
  try {
    (await fetchAll(cfg.base, 'En')).forEach(r => enMap[String(r.UC_SEQ)] = r);
    console.log(`   ✔ 영어 ${Object.keys(enMap).length}곳`);
  } catch(e) { console.log('   ⚠ 영어 없음 — 한국어명으로 대체'); }

  const extra = {};
  for (const [lang, suffix] of Object.entries(LANG_SUFFIX)) {
    if (lang === 'en') continue;
    try {
      const rows = await fetchAll(cfg.base, suffix);
      if (rows.length) {
        extra[lang] = {};
        rows.forEach(r => extra[lang][String(r.UC_SEQ)] = r);
        console.log(`   ✔ ${lang} ${rows.length}곳`);
      }
    } catch(e) { console.log(`   ⚠ ${lang} 없음 — 영어로 폴백`); }
  }

  return krRows.map(kr => toPlace(cfg, kr, enMap[String(kr.UC_SEQ)], extra));
}

async function main(){
  if (!DATA_GO_KR_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('⚠️  .env에 키 3개를 입력하세요.'); return;
  }

  const targets = ONLY ? SERVICES.filter(s => s.id === ONLY) : SERVICES;
  if (!targets.length) {
    console.error(`⚠️  --only=${ONLY} 에 해당하는 서비스가 없습니다. 사용 가능:`,
      SERVICES.map(s => s.id).join(', '));
    return;
  }

  let all = [];
  for (const cfg of targets) all = all.concat(await collectService(cfg));

  if (GUGUN) {
    all = all.filter(p => (p.area || '').includes(GUGUN));
    console.log(`\n"${GUGUN}" 필터: ${all.length}곳`);
  }

  const byCat = {};
  all.forEach(p => byCat[p.category] = (byCat[p.category] || 0) + 1);
  console.log(`\n총 ${all.length}곳`, byCat);

  if (!DO_INSERT) {
    writeFileSync('preview.json', JSON.stringify(all, null, 2));
    console.log('\n✅ 미리보기: preview.json 저장. 확인 후 --insert 로 실행하세요.');
    if (I18N_ONLY) console.log('   (--i18n-only 모드: 실행 시 i18n 컬럼만 갱신됩니다)');
    return;
  }

  /* ── i18n만 갱신 ────────────────────────────────────
     이미 name_en을 영문명·로마자로 정리해둔 상태에서 전체 upsert를 하면
     API가 주는 한글 상호로 되돌아간다. 그래서 i18n 컬럼만 병합 갱신한다. */
  if (I18N_ONLY) {
    console.log('\n▶ i18n 컬럼만 갱신 (name_en·큐레이션 값 보존)...');
    let done = 0, skipped = 0;
    for (const row of all) {
      // 기존 i18n을 읽어 새 언어만 덮어씀 (있던 언어도 최신값으로)
      const { data: cur } = await sb.from('places')
        .select('id, i18n')
        .eq('source', row.source).eq('external_id', row.external_id)
        .maybeSingle();
      if (!cur) { skipped++; continue; }

      const merged = { ...(cur.i18n || {}) };
      for (const [lang, val] of Object.entries(row.i18n || {})) {
        merged[lang] = { ...(merged[lang] || {}), ...val };
      }
      const { error } = await sb.from('places').update({ i18n: merged }).eq('id', cur.id);
      if (error) { console.error('❌', row.name_ko, error.message); continue; }
      if (++done % 50 === 0) console.log(`   ${done}/${all.length}`);
    }
    console.log(`\n✅ 완료: ${done}곳 갱신, ${skipped}곳은 DB에 없어 건너뜀.`);
    return;
  }

  console.log('\n▶ Supabase upsert...');
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const { error } = await sb.from('places').upsert(chunk, { onConflict: 'source,external_id' });
    if (error) { console.error('❌', error.message); return; }
    console.log(`   ${Math.min(i + 100, all.length)}/${all.length}`);
  }
  console.log('\n✅ 완료! Table Editor에서 확인하세요.');
}

main().catch(e => console.error('❌ 오류:', e.message));