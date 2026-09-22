/* ═══════════════════════════════════════════════════════
   카카오 업종 분류 채우기

   auto-curate.js 는 대표메뉴(subcategory)를 보고
   "국밥이니 혼자 가능", "낙곱새니 Hot" 을 판단합니다.
   그런데 서울 데이터는 대표메뉴가 거의 비어 있어 판단할 근거가 없습니다.

   카카오 지도는 가게마다 업종 분류를 갖고 있습니다.
     음식점 > 한식 > 해장국
     음식점 > 분식
     음식점 > 한식 > 육류,고기 > 삼겹살
   이걸 받아 대표메뉴가 빈 칸에 넣으면, auto-curate 가 서울도
   부산처럼 묶음으로 처리할 수 있습니다.

   ── 무엇을 하나 ──────────────────────────────────────
   1. Supabase 에서 대표메뉴가 빈 음식점·카페를 읽습니다 (읽기만)
   2. 카카오에서 같은 자리(300m 안)의 같은 이름 가게를 찾습니다
   3. 업종 분류를 SQL 로 만듭니다 — DB 는 직접 건드리지 않습니다

   이름이 비슷하지 않으면 넣지 않습니다. 같은 건물의 다른 가게가
   걸리는 일을 막기 위해서입니다.

   ── 준비 ─────────────────────────────────────────────
   .env 에 이미 있는 값을 씁니다
     KAKAO_REST_KEY, SUPABASE_URL, SUPABASE_ANON_KEY

   ── 실행 ─────────────────────────────────────────────
     node make-kakao-category.js
   결과: kakao-category-01.sql, 02.sql … (300줄씩)
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const KEY = process.env.KAKAO_REST_KEY;
if (!KEY){ console.error('.env 에 KAKAO_REST_KEY 가 없습니다.'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sq = v => String(v).replace(/'/g, "''");

/* 이름 비교용 — 지점명·괄호·공백을 떼고 본다 */
const core = s => (s || '')
  .replace(/\([^)]*\)/g, '')
  .replace(/(본점|직영점|분점|[가-힣A-Za-z0-9]+점)$/, '')
  .replace(/[\s·\-_.,&'’]/g, '')
  .toLowerCase();

/* 두 글자씩 쪼개 겹치는 정도 (0~1) */
function similar(a, b){
  a = core(a); b = core(b);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const bi = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++){ const k = s.slice(i, i+2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = bi(a), B = bi(b);
  let hit = 0; for (const [k, n] of A) hit += Math.min(n, B.get(k) || 0);
  return (2 * hit) / (Math.max(a.length - 1, 1) + Math.max(b.length - 1, 1));
}

const WHY = { found:0, noMatch:0, notSimilar:0, limit:0, error:0 };

async function lookup(p){
  const q = `https://dapi.kakao.com/v2/local/search/keyword.json`
    + `?query=${encodeURIComponent(p.name_ko)}`
    + `&x=${p.lng}&y=${p.lat}&radius=300&sort=distance&size=5`;

  for (let attempt = 0; attempt < 4; attempt++){
    try {
      const res = await fetch(q, { headers: { Authorization: 'KakaoAK ' + KEY } });
      if (res.status === 401 || res.status === 403){
        console.error('\n카카오가 요청을 거부했습니다:', (await res.text()).slice(0, 160));
        process.exit(1);
      }
      if (res.status === 429){ WHY.limit++; await sleep(1000 * (attempt + 1)); continue; }
      if (!res.ok){ WHY.error++; return null; }

      const docs = (await res.json()).documents || [];
      if (!docs.length){ WHY.noMatch++; return null; }

      // 이름이 가장 비슷한 것. 0.5 미만이면 다른 가게로 본다.
      let best = null;
      for (const d of docs){
        const s = similar(p.name_ko, d.place_name);
        if (!best || s > best.s) best = { s, d };
      }
      if (!best || best.s < 0.5){ WHY.notSimilar++; return null; }

      WHY.found++;
      // "음식점 > 한식 > 해장국" → "한식 · 해장국"
      const parts = (best.d.category_name || '').split('>').map(x => x.trim()).filter(Boolean);
      return parts.slice(1).join(' · ') || null;
    } catch(e){
      WHY.error++; await sleep(500);
    }
  }
  return null;
}

async function main(){
  // 대표메뉴가 빈 음식점·카페 — 1,000줄씩 나눠 읽는다
  let rows = [];
  for (let from = 0; ; from += 1000){
    const { data, error } = await sb.from('places')
      .select('id, name_ko, lat, lng, category, subcategory, area')
      .in('category', ['restaurant', 'cafe'])
      .not('lat', 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error){ console.error(error.message); return; }
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  const todo = rows.filter(p => !p.subcategory || !String(p.subcategory).trim());
  console.log(`\n음식점·카페 ${rows.length}곳 중 대표메뉴가 빈 곳 ${todo.length}곳\n`);

  const sql = [];
  for (let i = 0; i < todo.length; i++){
    const p = todo[i];
    const cat = await lookup(p);
    if (cat){
      sql.push(`update places set subcategory = '${sq(cat)}' where id = '${p.id}' `
        + `and (subcategory is null or subcategory = '');   -- ${p.name_ko}`);
    }
    if (i % 20 === 0 || i === todo.length - 1){
      process.stdout.write(`\r  ${i+1} / ${todo.length}   찾음 ${WHY.found}   `);
    }
    await sleep(80);   // 카카오 초당 제한을 넉넉히 피한다
  }
  console.log();

  // 300줄씩 나눠 저장 — 한 번에 붙여넣으면 SQL Editor 에서 잘린다
  const files = [];
  for (let k = 0; k < sql.length; k += 300){
    const name = `kakao-category-${String(files.length + 1).padStart(2, '0')}.sql`;
    writeFileSync(name,
`-- 카카오 업종 분류 ${files.length + 1}번째 묶음
-- 대표메뉴가 빈 곳만 채웁니다. 이미 있는 곳은 건드리지 않습니다.

${sql.slice(k, k + 300).join('\n')}
`);
    files.push(name);
  }

  console.log('\n  카카오 응답');
  console.log(`    찾음 ${WHY.found} · 주변에 없음 ${WHY.noMatch} · 이름이 달라 제외 ${WHY.notSimilar}`
    + ` · 한도 재시도 ${WHY.limit} · 오류 ${WHY.error}`);
  console.log(`\n  ${files.length}개 파일`);
  files.forEach(f => console.log('   ', f));
  console.log('\n  하나씩 Supabase → SQL Editor 에 붙여넣고 실행하세요.');
  console.log('  그다음: node auto-curate.js');
}

main().catch(e => console.error('\n오류:', e.message));