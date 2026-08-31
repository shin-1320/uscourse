/* ═══════════════════════════════════════════════════════
   CoursUs 영문 표기 변환 v2 — 표준관례 적용
   문체부·한국관광공사 표기 지침과 동일한 방식:
     "고유명사는 로마자 + 종류 명사는 번역"
     예) 충렬사 → Chungnyeolsa Temple  (경복궁 → Gyeongbokgung Palace 방식)
         회동수원지 → Hoedong Reservoir
         봉래산 → Bongnaesan Mountain

   처리 순서 (place마다):
     1) OFFICIAL 사전에 공식 영문명이 있으면 그것 사용
        (지자체 지정 공식명 — 부산시민공원 → Busan Citizens Park 등)
     2) 접미사 규칙: 종류 명사(공원/시장/사/산...)를 떼어 번역하고
        나머지는 로마자 변환
     3) 규칙에 안 걸리면 전체 로마자 (읽을 수는 있게)

   대상: name_en에 한글이 남아있는 모든 장소 (명소·음식점·카페 공통)
        음식점 상호는 대부분 3)로 처리됨 — 상호는 번역하지 않는 게 관례.

   준비:  .env (SUPABASE_URL / SUPABASE_SERVICE_KEY)
   설치:  npm install @supabase/supabase-js dotenv es-hangul
   실행:
     node romanize.js            미리보기 (DB 안 건드림)
     node romanize.js --apply    실제 반영
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { romanize as esRomanize } from 'es-hangul';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const APPLY = process.argv.includes('--apply');

/* ── 1. 공식 영문명 사전 ──────────────────────────────
   지자체·기관이 지정한 공식 표기. 필요할 때 한 줄씩 추가하면 됨. */
const OFFICIAL = {
  '부산시민공원': 'Busan Citizens Park',
  '어린이대공원': 'Busan Children\'s Grand Park',
  '부산어린이대공원': 'Busan Children\'s Grand Park',
  '송상현광장': 'Songsanghyeon Square',
  '초량 이바구길': 'Choryang Ibagu-gil Street',
  '이바구길 사진관': 'Ibagu-gil Photo Studio',
  '영도다리': 'Yeongdodaegyo Bridge',
  '충렬사': 'Chungnyeolsa Shrine',            // 사당이므로 Temple 아닌 Shrine
  '임시수도기념관': 'Provisional Capital Memorial Hall',
  '국립일제강제동원역사관': 'National Memorial Museum of Forced Mobilization',
  '유엔기념공원, 유엔평화기념관': 'UN Memorial Cemetery',
  '부산영화체험박물관/씨네뮤지엄': 'Busan Museum of Movies',
  '중앙공원, 민주공원': 'Jungang Park & Democracy Park',
  '금정산': 'Geumjeongsan Mountain',
  '범어사 성보박물관': 'Beomeosa Temple Museum',
  '동래향교, 기장향교': 'Dongnae Hyanggyo Confucian School',
  '사직야구장': 'Sajik Baseball Stadium',
  '광안리 골방': 'Gwangalli Golbang',
  '을숙도': 'Eulsukdo Island',
  '철새와 함께하는 아름다운 문화의 향연, 을숙도': 'Eulsukdo Island',
  '해운대수목원': 'Haeundae Arboretum',
  '화명수목원': 'Hwamyeong Arboretum',
  '부산도서관': 'Busan Library',
  '영화의 전당': 'Busan Cinema Center',
  '부산현대미술관': 'Museum of Contemporary Art Busan',
  '국립부산국악원': 'Busan National Gugak Center',
  '조선통신사역사관': 'Joseon Tongsinsa History Museum',
  '동아대석당박물관': 'Dong-A University Seokdang Museum',
  '부산해양자연사박물관': 'Busan Marine Natural History Museum',
  '복천박물관, 복천동고분군': 'Bokcheon Museum & Ancient Tombs',
  '40계단, 문화관': '40-Step Culture & Tourism Theme Street',
  '태종대자동차극장': 'Taejongdae Drive-in Theater',
  '구포어린이교통공원': 'Gupo Children\'s Traffic Park',
};

/* ── 2. 접미사 규칙 (표준 표기: 고유명사 로마자 + 종류 번역) ──
   긴 접미사부터 검사해야 함 (해수욕장 > 장). */
/* 각 규칙: [접미사, 영문, 방식]
   'strip' = 접미사를 떼고 고유명사만 로마자 + 번역
             감천문화마을 → Gamcheon Culture Village / 해운대해수욕장 → Haeundae Beach
   'keep'  = 이름 전체를 로마자로 유지 + 종류 붙임 (한 글자 접미사는 떼면 이름이 부서짐)
             범어사 → Beomeosa Temple / 봉래산 → Bongnaesan Mountain (경복궁 방식) */
const SUFFIX_RULES = [
  ['해수욕장', 'Beach', 'strip'],
  ['자연휴양림', 'Recreational Forest', 'strip'],
  ['생태공원', 'Eco Park', 'strip'],
  ['수변공원', 'Waterfront Park', 'strip'],
  ['해안산책로', 'Coastal Walk', 'strip'],
  ['전망대', 'Observatory', 'strip'],
  ['전시관', 'Exhibition Hall', 'strip'],
  ['기념관', 'Memorial Hall', 'strip'],
  ['박물관', 'Museum', 'strip'],
  ['미술관', 'Art Museum', 'strip'],
  ['도서관', 'Library', 'strip'],
  ['문화마을', 'Culture Village', 'strip'],
  ['벽화마을', 'Mural Village', 'strip'],
  ['문화거리', 'Culture Street', 'strip'],
  ['수원지', 'Reservoir', 'strip'],
  ['수목원', 'Arboretum', 'strip'],
  ['식물원', 'Botanical Garden', 'strip'],
  ['해수풀', 'Seawater Pool', 'strip'],
  ['야구장', 'Baseball Stadium', 'strip'],
  ['공원', 'Park', 'strip'],
  ['시장', 'Market', 'strip'],
  ['마을', 'Village', 'strip'],
  ['계곡', 'Valley', 'keep'],        // 용소계곡 → Yongso Valley? 계곡명은 짧아 keep이 안전
  ['성당', 'Cathedral', 'strip'],
  ['향교', 'Confucian School', 'strip'],
  ['등대', 'Lighthouse', 'strip'],
  ['대교', 'Bridge', 'keep'],        // 광안대교 → Gwangandaegyo Bridge (공식)
  ['다리', 'Bridge', 'strip'],
  ['항구', 'Port', 'strip'],
  ['포구', 'Port', 'strip'],
  ['광장', 'Square', 'strip'],
  ['해변', 'Beach', 'strip'],
  ['사찰', 'Temple', 'strip'],
  ['온천', 'Hot Springs', 'strip'],
  ['정사', 'Temple', 'keep'],        // 내원정사 → Naewonjeongsa Temple
  ['암자', 'Hermitage', 'keep'],
  ['숲길', 'Forest Trail', 'strip'],
  ['둘레길', 'Trail', 'strip'],
  ['산책로', 'Walking Trail', 'strip'],
  ['거리', 'Street', 'strip'],
  ['골목', 'Alley', 'strip'],
  ['동굴', 'Cave', 'keep'],
  ['성지', 'Shrine', 'strip'],
  ['서원', 'Confucian Academy', 'keep'],   // 안락서원 → Allakseowon Confucian Academy
  ['숲', 'Forest', 'strip'],
  ['섬', 'Island', 'keep'],          // 동백섬 → Dongbaekseom Island (공식)
  ['산', 'Mountain', 'keep'],        // 봉래산 → Bongnaesan Mountain (공식)
  ['사', 'Temple', 'keep'],          // 범어사 → Beomeosa Temple (공식)
];

/* ── 2.5. 음차 되돌리기 사전 ──────────────────────────
   카페·베이커리 상호는 영어 단어를 한글로 적은 경우가 많다.
   "에어리커피"를 Eeorikeopi로 쓰면 아무도 못 읽으므로,
   흔한 외래어는 원래 스펠링으로 복원한다. (긴 것부터 검사) */
const LOANWORD = [
  ['베이커리', 'Bakery'], ['로스터리', 'Roastery'], ['로스터스', 'Roasters'],
  ['커피하우스', 'Coffee House'], ['커피', 'Coffee'], ['카페', 'Cafe'],
  ['디저트', 'Dessert'], ['브런치', 'Brunch'], ['비스트로', 'Bistro'],
  ['라운지', 'Lounge'], ['가든', 'Garden'], ['하우스', 'House'],
  ['빌리지', 'Village'], ['스튜디오', 'Studio'], ['팩토리', 'Factory'],
  ['키친', 'Kitchen'], ['테이블', 'Table'], ['플레이스', 'Place'],
  ['스토어', 'Store'], ['마켓', 'Market'], ['클럽', 'Club'],
  ['베이크', 'Bake'], ['케이크', 'Cake'], ['도넛', 'Donut'], ['와플', 'Waffle'],
  ['피자', 'Pizza'], ['파스타', 'Pasta'], ['스테이크', 'Steak'], ['버거', 'Burger'],
  ['치킨', 'Chicken'], ['샌드위치', 'Sandwich'], ['샐러드', 'Salad'],
  ['본점', ''], ['직영점', ''],           // 지점 표기는 생략(혼란만 줌)
];

/* 이름에서 외래어 부분을 영어로 바꾸고, 나머지 한글만 로마자로 */
function loanAware(ko){
  let out = [], rest = ko;
  // 외래어를 자리표시자로 치환하며 분리
  const parts = [];
  let cursor = ko;
  let guard = 0;
  while (guard++ < 30){
    let hit = null, at = -1;
    for (const [kw, en] of LOANWORD){
      const i = cursor.indexOf(kw);
      if (i >= 0 && (at < 0 || i < at)){ at = i; hit = [kw, en]; }
    }
    if (!hit) break;
    if (at > 0) parts.push({ ko: cursor.slice(0, at) });
    parts.push({ en: hit[1] });
    cursor = cursor.slice(at + hit[0].length);
  }
  if (cursor) parts.push({ ko: cursor });
  if (!parts.some(p => p.en !== undefined)) return null;   // 외래어 없음 → 기본 처리

  return parts
    .map(p => p.en !== undefined ? p.en : roman(p.ko))
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ── 변환 로직 ──────────────────────────────────────── */
const hasHangul = s => /[가-힣]/.test(s || '');

// 로마자 + 단어별 첫 글자 대문자
function roman(ko){
  const r = esRomanize(ko || '');
  return r.replace(/[a-z가-힣0-9]+/gi, w => w.charAt(0).toUpperCase() + w.slice(1)).trim();
}

function convert(nameKo){
  const ko = (nameKo || '').trim();

  // 1) 공식명 사전
  if (OFFICIAL[ko]) return { en: OFFICIAL[ko], how: '공식명' };

  // 2) 접미사 규칙
  for (const [suffix, en, mode] of SUFFIX_RULES){
    if (ko.endsWith(suffix) && ko.length > suffix.length){
      if (mode === 'strip'){
        const stem = ko.slice(0, -suffix.length).trim();
        return { en: `${roman(stem)} ${en}`, how: `규칙(${suffix}→${en})` };
      }
      return { en: `${roman(ko)} ${en}`, how: `규칙(${suffix}→${en})` };
    }
  }

  // 3) 외래어(영어를 한글로 적은 것) 복원 — 에어리커피 → Eeori Coffee
  const loan = loanAware(ko);
  if (loan) return { en: loan, how: '외래어' };

  // 4) 폴백: 전체 로마자
  return { en: roman(ko), how: '로마자' };
}

/* ── 실행 ───────────────────────────────────────────── */
async function main(){
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY){
    console.error('⚠️  .env에 SUPABASE_URL / SUPABASE_SERVICE_KEY 필요'); return;
  }

  const { data, error } = await sb.from('places')
    .select('id, name_en, name_ko, category')
    .order('category');
  if (error){ console.error(error); return; }

  const targets = (data || []).filter(p => hasHangul(p.name_en) && p.name_ko);
  console.log(`한글 name_en: ${targets.length}곳 / 전체 ${data.length}곳\n`);
  if (!targets.length){ console.log('변환할 대상이 없습니다.'); return; }

  const updates = targets.map(p => {
    const { en, how } = convert(p.name_ko);
    return { id: p.id, ko: p.name_ko, to: en, how, cat: p.category };
  });

  // 미리보기: 방식별로 나눠서 출력
  for (const how of ['공식명', '규칙', '외래어', '로마자']){
    const group = updates.filter(u => u.how.startsWith(how));
    if (!group.length) continue;
    console.log(`\n[${how}] ${group.length}곳`);
    group.slice(0, 15).forEach(u => console.log(`  ${u.ko}  →  ${u.to}`));
    if (group.length > 15) console.log(`  ... 외 ${group.length - 15}곳`);
  }

  if (!APPLY){
    console.log('\n미리보기 모드. 반영하려면:  node romanize.js --apply');
    return;
  }

  console.log('\n반영 중...');
  let done = 0;
  for (const u of updates){
    const { error } = await sb.from('places').update({ name_en: u.to }).eq('id', u.id);
    if (error){ console.error('❌', u.ko, error.message); continue; }
    if (++done % 50 === 0) console.log(`   ${done}/${updates.length}`);
  }
  console.log(`\n✅ 완료: ${done}곳 변환. name_ko는 그대로 보존됨.`);
}

main().catch(e => console.error('❌', e.message));