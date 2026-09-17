/* ═══════════════════════════════════════════════════════
   검색용 페이지 생성

   왜 따로 만드나
     지금 서비스는 한 페이지 안에서 화면이 바뀌는 구조라
     주소가 하나뿐이고, 내용도 자바스크립트로 나중에 채워집니다.
     검색엔진은 조건마다 다른 주소가 있어야 각각 색인하고,
     처음 읽을 때 본문이 있어야 내용을 이해합니다.

     그래서 조건별로 주소를 나누고, 가게 목록을 HTML 안에
     미리 넣어 둔 페이지를 만듭니다.

   만드는 것
     /guide/solo-dining-busan.html      혼자 먹을 수 있는 곳
     /guide/english-menu-busan.html     외국어 메뉴가 있는 곳
     /guide/korean-food-spice.html      맵기 안내
     /guide/how-to-eat-<음식>.html      음식별 먹는 법 (9종)
     /sitemap.xml  /robots.txt

   실행
     node build-seo.js
   ═══════════════════════════════════════════════════════ */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';

const SITE = process.env.SITE_URL || 'https://uscourse.vercel.app';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const AREA = {
  '해운대구':'Haeundae', '수영구':'Gwangalli', '부산진구':'Seomyeon',
  '중구':'Nampo', '동구':'Choryang', '서구':'Songdo', '남구':'Gwangan',
  '사하구':'Gamcheon', '영도구':'Yeongdo', '금정구':'Geumjeong',
  '동래구':'Dongnae', '북구':'Buk', '연제구':'Yeonje',
  '사상구':'Sasang', '강서구':'Gangseo', '기장군':'Gijang',
};
const areaOf = a => AREA[a] || a || 'Busan';

/* ── 공통 틀 ─────────────────────────────────────────────
   검색 결과에 뜨는 것은 title 과 description 이므로
   이 둘에 실제로 검색되는 말을 넣습니다. */
function page({ slug, title, desc, h1, lead, body, faq = [], updated }) {
  const url = `${SITE}/guide/${slug}.html`;

  // 검색 결과에 질문·답변이 함께 뜨도록 구조화 데이터를 넣는다
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: desc,
    inLanguage: 'en',
    dateModified: updated,
    mainEntityOfPage: url,
    publisher: { '@type': 'Organization', name: 'Near me' },
  };
  const faqld = faq.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  } : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">

<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">

<link rel="icon" type="image/png" sizes="192x192" href="../icon-192.png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">

<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
${faqld ? `<script type="application/ld+json">${JSON.stringify(faqld)}</script>` : ''}

<style>
  :root{--brand:#0300b2;--ink:#0b0d14;--text:#31364a;--muted:#6b7185;
    --faint:#9ba1b2;--line:#e6e8f0;--ok-bg:#e6f5ec;--ok-fg:#17663a;
    --hot-bg:#fff1e6;--hot-fg:#a85a12;--tip-bg:#edecfb}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#fff;color:var(--text);line-height:1.7;
    font-family:'Inter','Noto Sans KR',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:720px;margin:0 auto;padding:0 20px 70px}
  header{padding:22px 0 16px;border-bottom:1px solid var(--line);margin-bottom:28px}
  .brand{font-size:15px;font-weight:800;color:var(--brand);text-decoration:none}
  h1{font-size:30px;font-weight:800;color:var(--ink);letter-spacing:-.6px;
    line-height:1.2;margin:18px 0 12px}
  .lead{font-size:16px;color:var(--muted);margin-bottom:26px}
  h2{font-size:20px;font-weight:800;color:var(--ink);letter-spacing:-.3px;
    margin:34px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
  h3{font-size:16px;font-weight:700;color:var(--ink);margin:22px 0 7px}
  p{font-size:15px;margin-bottom:13px}
  ol,ul{margin:0 0 16px 20px}
  li{font-size:15px;margin-bottom:7px}
  a{color:var(--brand)}

  .place{border:1px solid var(--line);border-radius:13px;padding:14px 16px;margin-bottom:10px}
  .place .n{font-size:16px;font-weight:700;color:var(--ink);line-height:1.3}
  .place .k{font-size:12px;color:var(--faint);margin-top:2px}
  .place .a{font-size:12.5px;color:var(--muted);margin-top:4px}
  .tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
  .t{font-size:12px;font-weight:600;padding:3px 8px;border-radius:7px;
    background:var(--ok-bg);color:var(--ok-fg)}
  .t.hot{background:var(--hot-bg);color:var(--hot-fg)}
  .t.tip{background:var(--tip-bg);color:var(--brand)}

  .cta{display:block;background:var(--brand);color:#fff;text-align:center;
    text-decoration:none;border-radius:12px;padding:15px;font-size:15px;
    font-weight:700;margin:28px 0}
  .say{background:var(--hot-bg);border-left:3px solid var(--hot-fg);
    border-radius:0 10px 10px 0;padding:12px 14px;margin:14px 0}
  .say b{font-family:'Noto Sans KR',sans-serif;font-size:16px}
  .more{display:flex;flex-wrap:wrap;gap:7px;margin:16px 0}
  .more a{font-size:13px;font-weight:600;background:#f1f2f8;color:var(--text);
    border-radius:8px;padding:7px 12px;text-decoration:none}
  footer{border-top:1px solid var(--line);margin-top:40px;padding-top:20px;
    font-size:12.5px;color:var(--faint);line-height:1.8}
</style>
</head>
<body>
<div class="wrap">

<header><a class="brand" href="../">Near me · Busan</a></header>

<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>

${body}

<a class="cta" href="../">Find places near you now →</a>

${faq.length ? `<h2>Common questions</h2>
${faq.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('\n')}` : ''}

<h2>Related</h2>
<div class="more">
  <a href="solo-dining-busan.html">Eating alone in Busan</a>
  <a href="english-menu-busan.html">Restaurants with English menus</a>
  <a href="korean-food-spice.html">How spicy is Korean food</a>
</div>

<footer>
  Last updated ${updated}<br>
  Place data from Busan Metropolitan City and Korea Tourism Organization open data,
  checked in person. Details can change — please confirm at the venue.<br>
  <a href="../legal.html">Privacy, terms &amp; data sources</a>
</footer>

</div>
</body>
</html>`;
}

/* 가게 한 곳을 HTML 로. 검색엔진이 읽을 수 있게 본문에 직접 넣는다. */
function placeCard(p){
  const tags = [];
  if (p.solo_ok === true)      tags.push(['', 'Can eat alone']);
  if (p.foreign_card === true) tags.push(['', 'Foreign cards']);
  if (p.english_menu === true) tags.push(['', 'Foreign menu']);
  if (p.spice_level)           tags.push(['hot', p.spice_level.replace(/🌶️?/g,'').trim()]);
  if (p.food_guide_key)        tags.push(['tip', 'How to eat it']);

  return `<div class="place">
  <div class="n">${esc(p.name_en || p.name_ko)}</div>
  ${p.name_ko ? `<div class="k">${esc(p.name_ko)}</div>` : ''}
  <div class="a">${esc(areaOf(p.area))}${p.address ? ' · ' + esc(p.address) : ''}</div>
  ${tags.length ? `<div class="tags">${tags.map(([c,l]) =>
    `<span class="t ${c}">${esc(l)}</span>`).join('')}</div>` : ''}
</div>`;
}

/* ── 페이지별 내용 ───────────────────────────────────── */

function soloPage(places, updated){
  const list = places.filter(p => p.solo_ok === true).slice(0, 40);
  const byArea = {};
  list.forEach(p => { (byArea[areaOf(p.area)] ||= []).push(p); });

  const body = `
<p>Eating alone is normal in Korea, but not in every restaurant. Some places serve
dishes meant for two or more — Korean barbecue and boiled-pork platters are the usual
ones — and a single diner can be turned away or simply feel out of place.</p>

<p>The dishes that work best alone are the ones served in one bowl:
<strong>gukbap</strong> (rice in soup), <strong>milmyeon</strong> (cold noodles),
<strong>kalguksu</strong> (knife-cut noodles), and most things at a
<strong>bunsik</strong> (snack shop). Counter seating is a good sign.</p>

<h2>Places in Busan where you can eat alone</h2>
<p>${list.length} restaurants and cafés confirmed to serve single diners.</p>

${Object.entries(byArea).map(([area, ps]) => `
<h3>${esc(area)}</h3>
${ps.map(placeCard).join('\n')}`).join('\n')}

<h2>What to say</h2>
<div class="say">
  <p>One person, please. — <b>한 명이요</b> (han myeong-i-yo)</p>
  <p>Can I eat alone? — <b>혼자 먹을 수 있나요?</b> (hon-ja meo-geul su it-na-yo)</p>
</div>`;

  return page({
    slug: 'solo-dining-busan',
    title: 'Eating Alone in Busan — Restaurants That Welcome Solo Diners',
    desc: `${list.length} restaurants in Busan confirmed to serve single diners, by neighbourhood. Plus which Korean dishes work best alone and what to say when you order.`,
    h1: 'Eating alone in Busan',
    lead: 'Which restaurants serve one person, and which dishes are meant to be shared.',
    body, updated,
    faq: [
      { q: 'Is it rude to eat alone in Korea?',
        a: 'No. Solo dining is common, especially at lunch. The difficulty is practical rather than social — some dishes are portioned for two or more, so a single diner cannot order them.' },
      { q: 'Which Korean dishes can I order alone?',
        a: 'Anything served in one bowl. Gukbap, milmyeon, kalguksu, bibimbap and most snack-shop food are all single portions. Korean barbecue and bossam usually start at two servings.' },
      { q: 'How do I ask for a table for one?',
        a: 'Say "한 명이요" (han myeong-i-yo), meaning "one person, please". Holding up one finger works just as well.' },
    ],
  });
}

function menuPage(places, updated){
  const list = places.filter(p => p.english_menu === true).slice(0, 40);
  const byArea = {};
  list.forEach(p => { (byArea[areaOf(p.area)] ||= []).push(p); });

  const body = `
<p>Most restaurants in Busan have Korean-only menus. Some have English, Japanese or
Chinese versions, and a few use photo menus or QR codes that switch language —
but there is no way to tell from outside.</p>

<p>These places have been confirmed to have a menu you can read.</p>

<h2>Restaurants with foreign-language menus</h2>
<p>${list.length} places confirmed, by neighbourhood.</p>

${Object.entries(byArea).map(([area, ps]) => `
<h3>${esc(area)}</h3>
${ps.map(placeCard).join('\n')}`).join('\n')}

<h2>When there is no English menu</h2>
<p>Photo menus are common and usually enough. If the menu is text only, pointing at
what someone else is eating is normal and nobody minds. Papago handles Korean food
names better than Google Translate.</p>

<div class="say">
  <p>Do you have an English menu? — <b>영어 메뉴 있어요?</b> (yeong-eo me-nyu it-eo-yo)</p>
  <p>What do you recommend? — <b>뭐가 맛있어요?</b> (mwo-ga ma-sit-eo-yo)</p>
</div>`;

  return page({
    slug: 'english-menu-busan',
    title: 'Busan Restaurants With English Menus — Confirmed List',
    desc: `${list.length} restaurants in Busan confirmed to have English, Japanese or Chinese menus, sorted by neighbourhood. What to do when there is no translated menu.`,
    h1: 'Restaurants with menus you can read',
    lead: 'Confirmed English, Japanese and Chinese menus in Busan.',
    body, updated,
    faq: [
      { q: 'Do restaurants in Busan have English menus?',
        a: 'Some do, mostly in Haeundae, Nampo and Seomyeon. Smaller neighbourhood restaurants usually have Korean-only menus, though photo menus are common.' },
      { q: 'How do I order without an English menu?',
        a: 'Point at a photo or at what someone nearby is eating. This is normal and staff are used to it. Papago translates Korean food names more accurately than Google Translate.' },
    ],
  });
}

function spicePage(places, guides, updated){
  const spicy = places.filter(p => p.spice_level).slice(0, 25);
  const mild  = places.filter(p => !p.spice_level && p.food_guide_key).slice(0, 15);

  const body = `
<p>"Not spicy" in Korea is calibrated for people who grew up eating gochujang.
A dish described as mild can still be hotter than expected, and the same dish can
differ between shops.</p>

<h2>The thing nobody tells you: dadaegi</h2>
<p>Many soups arrive with <strong>dadaegi</strong> (다대기) already stirred in — a red
chilli paste added at the counter. The same dwaeji-gukbap can be mild in one shop and
properly hot in the next, because of this one step.</p>

<div class="say">
  <p>Please leave out the chilli paste. — <b>다대기 빼주세요</b> (da-dae-gi ppae-ju-se-yo)</p>
  <p>Not spicy, please. — <b>안 맵게 해주세요</b> (an maep-ge hae-ju-se-yo)</p>
  <p>Once it is mixed in, it cannot come out — say this when you order, not after.</p>
</div>

<h2>Korean dishes that are not spicy</h2>
<p>These are safe if you cannot handle heat.</p>
<ul>
  <li><strong>Suyuk / bossam</strong> — boiled pork, served plain</li>
  <li><strong>Kalguksu</strong> — knife-cut noodles in clear broth</li>
  <li><strong>Mul naengmyeon</strong> — cold noodles in chilled broth (the <em>bibim</em> version is spicy)</li>
  <li><strong>Samgyetang</strong> — chicken and ginseng soup</li>
  <li><strong>Eomuk</strong> — fish cake, Busan's own</li>
</ul>

${spicy.length ? `<h2>Places with confirmed spice levels</h2>
<p>Checked in person. Where no level is shown, the dish is not spicy by default.</p>
${spicy.map(placeCard).join('\n')}` : ''}

${mild.length ? `<h2>Mild dishes with eating guides</h2>
${mild.map(placeCard).join('\n')}` : ''}`;

  return page({
    slug: 'korean-food-spice',
    title: 'How Spicy Is Korean Food? — A Guide for Visitors to Busan',
    desc: 'What "mild" actually means in Korea, why the same dish differs between shops, which dishes are safe, and how to ask for less chilli.',
    h1: 'How spicy is Korean food?',
    lead: 'What "not spicy" means here, and how to ask for less.',
    body, updated,
    faq: [
      { q: 'Is all Korean food spicy?',
        a: 'No. Many staples are mild — boiled pork, knife-cut noodles, cold mul naengmyeon, chicken soup and fish cake have no chilli at all. The spicy reputation comes from a handful of well-known dishes.' },
      { q: 'What is dadaegi?',
        a: 'A red chilli paste added to soups at the counter, often before serving. It is why the same dish can be mild in one restaurant and hot in another. Ask for it to be left out when you order.' },
      { q: 'How do I ask for food to be less spicy?',
        a: 'Say "안 맵게 해주세요" (an maep-ge hae-ju-se-yo). For soups, "다대기 빼주세요" (da-dae-gi ppae-ju-se-yo) asks them to leave the chilli paste out. Say it when ordering — it cannot be removed afterwards.' },
    ],
  });
}

function guidePage(g, places, updated){
  const steps = (g.steps || []).slice(0, 3)
    .map(x => (x.split('|')[0] || '').trim()
      .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]+\s*/u, ''));
  const desc = (g.steps || []).slice(0, 3).map(x => (x.split('|')[1] || '').trim());

  const here = places.filter(p => p.food_guide_key === g.key).slice(0, 20);
  const name = g.title_en || g.key;
  const slug = 'how-to-eat-' + g.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  // 안내문에서 실제로 말해야 하는 한국어 문장을 뽑는다
  const full = (g.pro_tip || '').replace(/\s+/g, ' ').trim();
  const m = full.match(/"([^"]*[가-힣][^"]*)"|([가-힣][가-힣\s]{2,}(?:주세요|없어요|있어요))/);
  const say = m ? (m[1] || m[2] || '').trim() : '';

  const body = `
<p>${esc(name)} arrives with a step that changes how it tastes, and most visitors
miss it because nobody thinks to mention it. Get the order wrong and the dish is
fine but flat.</p>

${steps.length ? `<h2>How locals eat it</h2>
<ol>
${steps.map((s, i) => `  <li><strong>${esc(s)}</strong>${desc[i] ? ' — ' + esc(desc[i]) : ''}</li>`).join('\n')}
</ol>` : ''}

${full ? `<h2>Good to know</h2>
<p>${esc(full)}</p>` : ''}

${say ? `<div class="say">
  <p>Say this when you order — not after:</p>
  <p><b>${esc(say)}</b></p>
</div>` : ''}

${here.length ? `<h2>Where to try it in Busan</h2>
<p>${here.length} ${here.length === 1 ? 'place' : 'places'} serving ${esc(name)}, checked in person.</p>
${here.map(placeCard).join('\n')}` : ''}

<h2>Before you walk in</h2>
<p>Whether you can eat alone, whether your card will work, whether there is a menu you
can read — these change from shop to shop and are rarely written down anywhere.
<a href="../">Near me</a> checks them in advance for places across Busan.</p>`;

  return {
    slug,
    html: page({
      slug,
      title: `How to Eat ${name} — Korean Food Guide`,
      desc: `The way ${name} is actually eaten in Korea, step by step${say ? ', and what to say when you order' : ''}. ${here.length ? `${here.length} ${here.length === 1 ? 'place' : 'places'} to try it in Busan.` : ''}`.trim(),
      h1: `How to eat ${name}`,
      lead: 'What locals do without thinking, written down.',
      body, updated,
      faq: [
        ...(steps.length ? [{ q: `How do you eat ${name}?`,
          a: steps.map((s, i) => `${i + 1}. ${s}.`).join(' ') }] : []),
        ...(say ? [{ q: `How do I order ${name} less spicy?`,
          a: `Say "${say}" when you order. Once the chilli is mixed in it cannot be removed.` }] : []),
        ...(here.length ? [{ q: `Where can I eat ${name} in Busan?`,
          a: `${here.slice(0, 3).map(p => p.name_en || p.name_ko).join(', ')}${here.length > 3 ? ` and ${here.length - 3} more` : ''}.` }] : []),
      ],
    }),
  };
}

/* ── 실행 ────────────────────────────────────────────── */
async function main(){
  const updated = new Date().toISOString().slice(0, 10);

  const [pl, gd] = await Promise.all([
    sb.from('places')
      .select('name_en, name_ko, area, address, solo_ok, foreign_card, english_menu, spice_level, food_guide_key')
      .not('lat', 'is', null),
    sb.from('food_guides').select('key, title_en, steps, pro_tip'),
  ]);

  if (pl.error){ console.error('장소 조회 실패:', pl.error.message); return; }

  const places = pl.data || [];
  const guides = gd.data || [];
  console.log(`장소 ${places.length}곳, 가이드 ${guides.length}종\n`);

  mkdirSync('guide', { recursive: true });

  const made = [];
  const write = (slug, html) => {
    writeFileSync(`guide/${slug}.html`, html);
    made.push(slug);
    console.log(`  guide/${slug}.html`);
  };

  write('solo-dining-busan',  soloPage(places, updated));
  write('english-menu-busan', menuPage(places, updated));
  write('korean-food-spice',  spicePage(places, guides, updated));

  guides.forEach(g => {
    const { slug, html } = guidePage(g, places, updated);
    write(slug, html);
  });

  // 사이트맵 — 검색엔진에 주소 목록을 알려준다
  const urls = [
    { loc: `${SITE}/`, pri: '1.0' },
    ...made.map(s => ({ loc: `${SITE}/guide/${s}.html`, pri: '0.8' })),
    { loc: `${SITE}/legal.html`, pri: '0.3' },
  ];
  writeFileSync('sitemap.xml',
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${updated}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>`);

  writeFileSync('robots.txt',
`User-agent: *
Allow: /
Sitemap: ${SITE}/sitemap.xml
`);

  console.log(`\n  sitemap.xml  (${urls.length}개 주소)`);
  console.log('  robots.txt');
  console.log(`\n${made.length}개 페이지를 만들었습니다.`);
  console.log('git add . && git commit -m "add guide pages" && git push 로 올리세요.');
}

main().catch(e => console.error(e));