/* ═══════════════════════════════════════════════════════
   큐레이션 자동화

   ── 왜 묶음인가 ──────────────────────────────────────
   263곳을 한 곳씩 판단하면 263번 결정해야 합니다.
   그런데 실제 판단은 "국밥집은 혼자 가도 된다" 한 번으로 끝납니다.

   그래서 음식 종류로 묶어 제안합니다.
     국밥류 85곳 — 혼자 가도 되나요?  → 예 → 85곳이 한 번에 채워짐
   열 번쯤 판단하면 대부분이 정리됩니다.

   ── 무엇을 자동으로 하고 무엇을 묻나 ─────────────────
   자동   먹는 법, 매운맛 — 메뉴 이름이 곧 답입니다
   묶음   혼밥 — 음식 종류로 판단합니다
   안 함  해외 카드, 외국어 메뉴 — 가게에 가봐야 압니다

   ── 사용 ─────────────────────────────────────────────
     node auto-curate.js                  전체 미리보기
     node auto-curate.js --area=해운대구    한 지역만
     node auto-curate.js --apply          먹는법·매운맛 SQL 생성
     node auto-curate.js --solo=1,3,5     그 묶음을 혼밥 가능으로
     node auto-curate.js --nosolo=2,7     그 묶음을 혼밥 불가로

   지역과 무관하게 동작하므로 새 지역을 넣은 뒤 그대로 쓰면 됩니다.
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const arg = (name) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
};
const AREA   = arg('area');
const APPLY  = process.argv.includes('--apply');
const SOLO   = (arg('solo')   || '').split(',').filter(Boolean).map(Number);
const NOSOLO = (arg('nosolo') || '').split(',').filter(Boolean).map(Number);

/* ── 먹는 법 ──────────────────────────────────────────
   대표메뉴나 상호에 이 말이 있으면 그 가이드를 붙인다.
   긴 말을 먼저 둬야 "순대국밥"이 "국밥"으로 잘못 잡히지 않는다. */
const GUIDE_WORDS = [
  ['sundae-gukbap', ['순대국밥','순댓국밥','순대국','순댓국','피순대']],
  ['dwaeji-gukbap', ['돼지국밥','돼지국','내장국밥','섞어국밥','수육국밥','따로국밥']],
  ['suyuk-baekban', ['수육백반','수육정식','수육']],
  ['milmyeon',      ['밀면']],
  ['gomjangeo',     ['꼼장어','곰장어','먹장어','붕장어','아나고']],
  ['hoe',           ['회센터','횟집','물회','생선회','활어회','모듬회','자연산회']],
  ['eomuk',         ['어묵','오뎅']],
  ['ssiat-hotteok', ['씨앗호떡','호떡']],
  ['samgyeopsal',   ['삼겹살','목살','갈매기살','오겹살','생고기','돼지구이','항정살']],
];

/* ── 매운맛 ───────────────────────────────────────────
   외국인 기준으로 세 단계. 고추 개수로 한눈에 보이게 한다.

     🌶️🌶️🌶️ Hot     이름부터 매운 것. 조절해도 맵다.
     🌶️🌶️ Medium    대개 맵지만 덜 맵게 해달라고 할 수 있다.
     🌶️ Mild        기본은 안 맵다. 다대기만 빼면 확실하다.

   한국인이 "안 맵다"고 하는 김치찌개도 외국인에게는 Medium 이다.
   기준은 매운 음식에 익숙하지 않은 사람에게 맞춘다.

   Mild 를 따로 두는 이유 — 표시가 없으면 "안 매운 것"인지
   "확인하지 않은 것"인지 구분되지 않는다. 명시하는 편이 낫다. */
/* 고추 모양은 코드에 직접 쓰지 않고 만들어 붙인다.
   파일을 주고받는 과정에서 이모지가 사라져
   "spice_level = " 처럼 값이 빈 SQL 이 생기는 일이 있었다. */
/* SQL 안에 이모지를 직접 넣지 않는다.
   파일을 주고받는 과정에서 사라져 "spice_level = " 처럼
   값이 빈 문장이 만들어지는 일이 반복됐다.

   대신 SQL 에서 문자 번호로 조립한다. 어느 편집기를 거쳐도
   글자가 깨지지 않고, 결과는 동일하다. */
const CHILI_SQL = "chr(127798) || chr(65039)";      // 🌶️
const LEVEL = {
  hot:    { key:'hot',    sql: `repeat(${CHILI_SQL}, 3) || ' Hot'`,    show:'Hot x3' },
  medium: { key:'medium', sql: `repeat(${CHILI_SQL}, 2) || ' Medium'`, show:'Medium x2' },
  mild:   { key:'mild',   sql: `${CHILI_SQL} || ' Mild'`,              show:'Mild x1' },
};

const SPICE_WORDS = [
  /* 매운 곳만 표시한다. 표시가 없으면 안 맵다는 뜻이다.
     떡볶이·쭈꾸미·낙지는 Hot, 찜닭은 Medium 으로 정했다. */
  [LEVEL.hot,    ['떡볶이','쭈꾸미','주꾸미','낙지','낙곱새','불닭','매운갈비찜','불족발',
                  '아구찜','해물찜','매운탕','닭발','매운족발','불막창','짬뽕','불곱창',
                  '화끈','매운','불맛','땡초','청양','뽈찜']],

  [LEVEL.medium, ['찜닭','비빔냉면','비빔밀면','제육','오징어볶음','순두부','김치찌개',
                  '부대찌개','닭갈비','양념치킨','고추장','비빔국수','열무','알탕',
                  '동태찌개','짜글이','곱창전골','생선조림','갈치조림','고등어조림','갈비찜']],
];

/* ── 혼밥 묶음 ────────────────────────────────────────
   음식 종류로 나눈다. 판단은 종류마다 한 번이면 된다.
   likely 는 권하는 답이지만, 최종 결정은 사람이 한다. */
const SOLO_GROUPS = [
  { name:'국밥·탕류',   likely:true,
    words:['국밥','설렁탕','곰탕','해장국','삼계탕','갈비탕','추어탕','육개장','순대국'] },
  { name:'면류',       likely:true,
    words:['밀면','냉면','칼국수','국수','라면','우동','짜장','짬뽕','소바','쌀국수','중식','중국요리','중화요리','베트남음식'] },
  { name:'분식',       likely:true,
    words:['분식','김밥','떡볶이','튀김','만두','토스트','핫도그'] },
  { name:'덮밥·일식',   likely:true,
    words:['덮밥','돈까스','카레','초밥','스시','회덮밥','규동','오니기리','일식','초밥,롤','돈까스,우동'] },
  { name:'백반·한정식', likely:true,
    words:['백반','정식','비빔밥','쌈밥','도시락'] },
  { name:'카페·빵',    likely:true,
    words:['카페','커피','베이커리','빵','디저트','케이크','브런치','커피전문점','제과,베이커리','디저트카페','간식'] },
  { name:'패스트푸드',  likely:true,
    words:['버거','햄버거','피자','샌드위치','치킨','샐러드','패스트푸드','양식','이탈리안'] },
  { name:'어묵·포장마차', likely:true,
    words:['어묵','오뎅','호떡','붕어빵','포차','노점'] },
  { name:'생선탕·해장',  likely:true,
    words:['복국','대구탕','생태탕','동태탕','재첩국','콩나물국밥','알탕'] },

  { name:'고기구이',    likely:false,
    words:['삼겹살','목살','갈비','숯불','구이','한우','생고기','막창','곱창','대창','육류,고기','육류','고기','닭요리','곱창,막창'] },
  { name:'보쌈·족발',   likely:false,
    words:['보쌈','족발','수육정식'] },
  { name:'전골·찜',     likely:false,
    words:['전골','샤브','찜닭','아구찜','해물찜','조개구이','해물탕','뽈찜'] },
  { name:'볶음류',      likely:true,
    words:['낙곱새','제육','오징어볶음','낙지볶음','쭈꾸미','주꾸미','철판'] },
  { name:'횟집',       likely:false,
    words:['횟집','회센터','활어','모듬회','자연산','해물,생선','회'] },
  { name:'코스요리',    likely:false,
    words:['코스','오마카세','한정식','다이닝','레스토랑'] },
];

/* 잘못 잡히기 쉬운 것. "김유순대구뽈찜"은 김유순 + 대구뽈찜인데
   "순대"로 읽힌다. 상호에 우연히 든 글자로 엉뚱한 값이 붙는 것을 막는다. */
const TRAPS = [
  { word:'순대', unless:['대구뽈','대구찜','대구탕'] },
  { word:'회',   unless:['회식','회관','회사','교회','민회'] },
  { word:'구이', unless:['조개구이'] },
];

function has(text, words){
  return words.some(w => {
    if (!text.includes(w)) return false;
    const t = TRAPS.find(x => x.word === w);
    return !(t && t.unless.some(u => text.includes(u)));
  });
}

/* 판단에 쓸 글. 메뉴가 비어 있으면 상호만으로 정하지 않는다 —
   근거가 하나뿐이면 틀릴 확률이 올라간다. */
function textOf(p){
  const menu = (p.subcategory || '').trim();
  return menu ? `${menu} ${p.name_ko || ''}` : '';
}

async function main(){
  let q = sb.from('places')
    .select('id, name_ko, name_en, category, subcategory, area, solo_ok, foreign_card, english_menu, spice_level, food_guide_key')
    .in('category', ['restaurant','cafe']);
  if (AREA) q = q.eq('area', AREA);

  const { data, error } = await q;
  if (error){ console.error(error.message); return; }

  const rows = data || [];
  console.log(`\n${AREA ? AREA + ' · ' : ''}음식점·카페 ${rows.length}곳\n`);

  const sql = [];
  const guideHits = [], spiceHits = [];
  const groups = SOLO_GROUPS.map(g => ({ ...g, places: [] }));
  let noText = 0;

  for (const p of rows){
    const text = textOf(p);
    if (!text){ noText++; continue; }

    // ① 먹는 법 — 아직 없을 때만
    if (!p.food_guide_key){
      for (const [key, words] of GUIDE_WORDS){
        if (has(text, words)){
          if (!key || !key.trim()) break;
          guideHits.push({ p, key });
          sql.push(`update places set food_guide_key = '${key}' where id = '${p.id}';   -- ${p.name_ko}`);
          break;
        }
      }
    }

    // ② 매운맛 — 아직 없을 때만, 음식점만
    if (!p.spice_level && p.category === 'restaurant'){
      for (const [level, words] of SPICE_WORDS){
        if (has(text, words)){
          // 값이 비어 있으면 건너뛴다. 빈 SQL 은 실행 자체가 실패한다.
          spiceHits.push({ p, level });
          sql.push(`update places set spice_level = ${level.sql} where id = '${p.id}';   -- ${p.name_ko} · ${level.show}`);
          break;
        }
      }
    }

    // ③ 혼밥 — 묶음에 담기만 한다. 먼저 걸린 묶음 하나에만.
    if (p.solo_ok == null){
      for (const g of groups){
        if (has(text, g.words)){ g.places.push(p); break; }
      }
    }
  }

  // ── 자동으로 채운 것 ────────────────────────────────
  console.log('── 자동으로 채웁니다 ─────────────────────');
  console.log(`  먹는 법  ${guideHits.length}곳`);
  const byGuide = {};
  guideHits.forEach(h => { byGuide[h.key] = (byGuide[h.key] || 0) + 1; });
  Object.entries(byGuide).sort((a,b) => b[1]-a[1])
    .forEach(([k,n]) => console.log(`      ${k.padEnd(16)} ${n}`));

  console.log(`\n  매운맛   ${spiceHits.length}곳`);
  const bySpice = {};
  spiceHits.forEach(h => { bySpice[h.level.show] = (bySpice[h.level.show] || 0) + 1; });
  Object.entries(bySpice).forEach(([k,n]) => console.log(`      ${k.padEnd(16)} ${n}`));

  // ── 혼밥 묶음 ───────────────────────────────────────
  const active = groups.filter(g => g.places.length);
  console.log('\n── 혼밥 — 묶음으로 판단해 주세요 ─────────');
  console.log('  번호를 골라 다시 실행하면 그 묶음이 한 번에 채워집니다.\n');

  active.forEach((g, i) => {
    const n = i + 1;
    const hint = g.likely ? '혼자 가도 될 듯' : '혼자는 어려울 듯';
    console.log(`  [${String(n).padStart(2)}] ${g.name.padEnd(10)} ${String(g.places.length).padStart(4)}곳   ${hint}`);
    console.log(`       ${g.places.slice(0,4).map(p => p.name_ko).join(' · ')}`);
  });

  const likelyNums   = active.map((g,i) => g.likely ? i+1 : null).filter(Boolean);
  const unlikelyNums = active.map((g,i) => !g.likely ? i+1 : null).filter(Boolean);

  console.log('\n  권하는 대로 하려면:');
  console.log(`    node auto-curate.js --apply --solo=${likelyNums.join(',')} --nosolo=${unlikelyNums.join(',')}`);

  // 고른 묶음을 SQL 에 담는다
  let soloN = 0, nosoloN = 0;
  SOLO.forEach(n => {
    const g = active[n-1];
    if (!g) return;
    g.places.forEach(p => {
      sql.push(`update places set solo_ok = true where id = '${p.id}';   -- ${p.name_ko} (${g.name})`);
      soloN++;
    });
  });
  NOSOLO.forEach(n => {
    const g = active[n-1];
    if (!g) return;
    g.places.forEach(p => {
      sql.push(`update places set solo_ok = false where id = '${p.id}';   -- ${p.name_ko} (${g.name})`);
      nosoloN++;
    });
  });
  if (soloN || nosoloN){
    console.log(`\n  고르신 묶음: 혼밥 가능 ${soloN}곳 · 불가 ${nosoloN}곳`);
  }

  // ── 자동화할 수 없는 것 ─────────────────────────────
  const noCard = rows.filter(p => p.foreign_card == null).length;
  const noMenu = rows.filter(p => p.english_menu == null).length;
  const unmatched = groups.reduce((s,g) => s, 0);
  const stillNull = rows.filter(p => p.solo_ok == null).length
    - groups.reduce((s,g) => s + g.places.length, 0);

  console.log('\n── 데이터로는 채울 수 없습니다 ───────────');
  console.log(`  해외 카드 미확인   ${noCard}곳`);
  console.log(`  외국어 메뉴 미확인 ${noMenu}곳`);
  console.log('  가게에 가봐야 아는 것이라, 짐작으로 채우면');
  console.log('  여행자가 계산대 앞에서 곤란해집니다.');
  console.log('  빈칸으로 두고 이용자 제보로 채우는 편이 정직합니다.');

  if (noText || stillNull > 0){
    console.log('\n── 판단할 근거가 없는 곳 ─────────────────');
    if (noText)        console.log(`  대표메뉴가 비어 있음    ${noText}곳`);
    if (stillNull > 0) console.log(`  어느 묶음에도 안 맞음   ${stillNull}곳`);
    console.log('  큐레이션 화면에서 직접 보셔야 합니다.');
  }

  if (!APPLY){
    console.log('\n미리보기입니다. --apply 를 붙이면 SQL 파일을 만듭니다.');
    return;
  }

  writeFileSync('auto-curate.sql',
`-- 자동 큐레이션 — ${new Date().toISOString().slice(0,10)}${AREA ? ` · ${AREA}` : ''}
--
-- 먹는 법 ${guideHits.length}곳 · 매운맛 ${spiceHits.length}곳
-- 혼밥 가능 ${soloN}곳 · 혼밥 불가 ${nosoloN}곳
--
-- 실행 전에 훑어보시고, 이상한 줄은 지우고 돌리세요.

${sql.join('\n')}
`);

  console.log(`\n  auto-curate.sql  (${sql.length}줄)`);
  console.log('  Supabase 에서 실행하세요.');
}

main().catch(e => console.error(e));