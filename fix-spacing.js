/**
 * 로마자 상호에 띄어쓰기를 넣는다.
 *
 * 부산시 API가 "쌍둥이돼지국밥"을 "Ssangdungidwaejigukbap"처럼
 * 통째로 붙여서 준다. 40자짜리 한 덩어리는 읽을 수가 없다.
 *
 * 한글 형태소를 분석하는 게 정확하지만 도구가 필요하고,
 * 고유명사(상호 앞부분)는 어차피 못 나눈다.
 * 대신 음식·업종 이름은 반복되므로, 그 말들 앞에서 띄운다.
 * 158곳 중 대부분이 이 패턴이다.
 *
 * 실행:
 *   node fix-spacing.js            미리보기만
 *   node fix-spacing.js --apply    실제 반영
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

/* 띄울 지점이 되는 말들.
   긴 것을 먼저 둬야 한다 — "gukbap"보다 "dwaejigukbap"이 먼저 걸려야
   "Dwaeji Gukbap"으로 두 번 나뉜다. */
const WORDS = [
  // 업종·접미
  'jeonmunjeom', 'bonjeom', 'jikyeongjeom', 'sindosijeom', 'bonga', 'bonkwan',

  // 국물·탕
  'dwaejigukbap', 'jaecheopguk', 'samgyetang', 'haemultang', 'eotangguksu',
  'gukbap', 'bokguk', 'kalguksu', 'guksu', 'jeongol', 'jjigae', 'tang',

  // 면 — 'myeon' 단독은 빼둔다.
  // "사계절냉면(...jeollaengmyeon)"처럼 앞 글자와 붙어 변형된 경우
  // 'myeon'만 떨어져 나가 "…jeollaeng Myeon"이 되기 때문이다.
  'naengmyeon', 'laengmyeon', 'raengmyeon', 'milmyeon',

  // 고기·해산물
  'dwaejigalbi', 'amsogalbi', 'galbi', 'bulgogi', 'sutbul', 'gopchang',
  'sundae', 'suyuk', 'bossam', 'jokbal', 'yukjeon', 'yukoe',
  'nakji', 'jjukkumi', 'gajami', 'jeonbok', 'haemul', 'mulhoe',
  'hoetjip', 'chobap', 'galchi',

  // 조리·형태
  'jjim', 'gui', 'bokkeum', 'syabeusyabeu', 'kkakdugi',

  // 장소·기타
  'sikdang', 'siktang', 'jip', 'chon', 'danji', 'senteo', 'yeonguso',
  'teibeul', 'beuritji',
];

// 긴 단어 우선
WORDS.sort((a, b) => b.length - a.length);

/** 앞 글자를 대문자로 */
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * 붙어 있는 한 덩어리를 사전에 있는 말 앞에서 자른다.
 * 재귀로 뒤쪽도 계속 나눈다.
 */
function split(token, depth = 0){
  if (depth > 6 || token.length < 6) return [token];

  const lower = token.toLowerCase();
  for (const w of WORDS){
    const at = lower.lastIndexOf(w);
    // 맨 앞에서 걸리면 자를 게 없다. 앞부분이 3자 이상 남아야 의미가 있다.
    if (at >= 3 && at + w.length === lower.length){
      return [...split(token.slice(0, at), depth + 1), cap(token.slice(at))];
    }
  }
  // 끝에서 못 찾으면 중간에서도 찾아본다.
  // "Bugwangdwaejigukbapjeonmunjeom"처럼 뒤에 다른 말이 더 붙은 경우다.
  for (const w of WORDS){
    const at = lower.indexOf(w);
    if (at >= 3){
      const head = token.slice(0, at);
      const rest = token.slice(at + w.length);
      const mid  = cap(token.slice(at, at + w.length));
      return rest
        ? [...split(head, depth + 1), mid, ...split(cap(rest), depth + 1)]
        : [...split(head, depth + 1), mid];
    }
  }
  return [token];
}

function respace(name){
  if (!name) return name;
  // 이미 띄어져 있으면 각 덩어리만 다시 본다
  return name.split(/\s+/).flatMap(t => split(t)).join(' ');
}

async function main(){
  const { data, error } = await sb.from('places')
    .select('id, name_ko, name_en')
    .not('name_en', 'is', null);

  if (error){ console.error(error.message); return; }

  const changes = [];
  for (const p of data){
    const next = respace(p.name_en);
    if (next !== p.name_en) changes.push({ ...p, next });
  }

  console.log(`\n전체 ${data.length}곳 중 ${changes.length}곳이 바뀝니다.\n`);
  changes.slice(0, 60).forEach(c => {
    console.log(`  ${c.name_ko}`);
    console.log(`    ${c.name_en}`);
    console.log(`  → ${c.next}\n`);
  });
  if (changes.length > 60) console.log(`  … 외 ${changes.length - 60}곳\n`);

  if (!APPLY){
    console.log('미리보기입니다. 반영하려면 --apply 를 붙여 다시 실행하세요.');
    return;
  }

  let done = 0;
  for (const c of changes){
    const { error: e } = await sb.from('places')
      .update({ name_en: c.next }).eq('id', c.id);
    if (e) console.error(`  실패: ${c.name_ko} — ${e.message}`);
    else done++;
  }
  console.log(`\n${done}곳 반영 완료.`);
}

main().catch(e => console.error(e));