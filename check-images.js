/**
 * 부산시 관광 API가 이미지를 어떤 필드로 주는지 확인한다.
 *
 * 지금 DB에는 _ttiel 로 끝나는 썸네일이 들어가 있는데,
 * 그건 목록용으로 미리 잘린 사진이라 접시가 잘려 보인다.
 * 원본은 _wufrotr 처럼 다른 접미사에 번호도 다르므로,
 * 문자열 치환으로는 못 고치고 API에서 다시 받아야 한다.
 *
 * 실행:
 *   node check-images.js
 */

import 'dotenv/config';

const KEY = process.env.BUSAN_API_KEY;
if (!KEY) { console.error('BUSAN_API_KEY 가 .env 에 없습니다.'); process.exit(1); }

const URL_BASE = 'https://apis.data.go.kr/6260000/FoodService/getFoodKr';

async function main(){
  // 인증키는 이미 인코딩된 값이므로 URLSearchParams 를 쓰지 않고 직접 조립한다
  // (URLSearchParams 를 쓰면 %2B 가 %252B 로 이중 인코딩된다)
  const url = `${URL_BASE}?serviceKey=${KEY}&pageNo=1&numOfRows=3&resultType=json`;

  const res = await fetch(url);
  const text = await res.text();

  let json;
  try { json = JSON.parse(text); }
  catch(e){
    console.error('JSON 이 아닙니다. 응답 앞부분:');
    console.error(text.slice(0, 400));
    return;
  }

  const items = json?.getFoodKr?.item || [];
  if (!items.length){ console.error('결과가 비어 있습니다.'); return; }

  console.log(`\n총 ${items.length}건 중 첫 건의 모든 필드\n`);

  const first = items[0];
  console.log('상호:', first.MAIN_TITLE);
  console.log();

  // 이미지로 보이는 필드만 추려서 보여준다
  console.log('── 이미지 관련 필드 ────────────────────────');
  let found = false;
  for (const [k, v] of Object.entries(first)){
    if (/IMG|IMAGE|PHOTO|THUMB/i.test(k)){
      found = true;
      console.log(`  ${k}`);
      console.log(`    ${v || '(비어 있음)'}`);
    }
  }
  if (!found) console.log('  (이미지 필드가 없습니다)');

  console.log('\n── 전체 필드 이름 ──────────────────────────');
  console.log(Object.keys(first).join(', '));

  console.log('\n── 판단 ────────────────────────────────────');
  const normal = first.MAIN_IMG_NORMAL || '';
  const thumb  = first.MAIN_IMG_THUMB  || '';
  if (normal && !/_ttiel$/.test(normal)){
    console.log('  MAIN_IMG_NORMAL 이 원본으로 보입니다. 그대로 쓰면 됩니다.');
  } else if (normal) {
    console.log('  MAIN_IMG_NORMAL 도 _ttiel(썸네일)입니다.');
    console.log('  → API 가 원본을 주지 않는 것일 수 있습니다.');
    console.log('  → 다른 필드나 상세 조회(UC_SEQ 기반)를 확인해야 합니다.');
  }
  if (thumb) console.log(`  MAIN_IMG_THUMB: ${thumb}`);
}

main().catch(e => console.error(e));
