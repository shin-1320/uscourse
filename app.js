/* ═══════════════════════════════════════════════════════
   UsCourse 기능 스크립트 (app.js) — v5 최종본
   목차:
     1. 설정 — Supabase 키
     2. 다국어 (i18n) — 번역 사전 · 언어 전환
     3. 익명 본인확인 토큰
     4. 공용 헬퍼
     5. 먹는법 가이드 로드
     6. 장소 로드 · 카드 렌더
     7. 화면 전환 (해시 방식) · 검색
     8. 상세 페이지 (주문표 · OSM 지도 · 네이버 버튼)
     9. 리뷰 — 읽기 · 작성 · 수정 · 삭제 · 신고
    10. 여행자 후기 (홈 하단)
    11. 법적 고지 모달
    12. 시작

   [v5 변경점]
     · 지도: OSM 미니 지도 임베드 + 네이버 버튼(좌표 기반) + 안내 문구
     · 장소 데이터도 다국어 표시 (places.i18n)
     · 해시(#) 네비게이션 — file://에서도 뒤로가기 작동
     · 섹션 중복 정리, 변수명 충돌(t) 제거
   ═══════════════════════════════════════════════════════ */


/* ── 1. 설정 ────────────────────────────────────────── */
const SUPABASE_URL = "https://zygumrggzjwbkihlmpfy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5Z3Vtcmdnemp3YmtpaGxtcGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjY2OTIsImV4cCI6MjA5OTYwMjY5Mn0.9d8i1_W5y008VNtikdejIKA8jvnfay1TZRvdX13DkFE";

/* ── A/B 테스트 ───────────────────────────────────────
   배정은 index.html의 GA 스크립트에서 페이지 로딩 초기에 끝난다
   (화면 깜빡임 방지). 여기서는 그 결과만 가져다 쓴다.

     A — Practical Information형
         "기존 플랫폼에서 찾기 어려운 실용 정보가 가치 있다"
     B — Decision / Curation형
         "정보보다 어디를 갈지 정하는 것이 더 어렵다"

   localStorage 키: coursus_ab_variant (값은 'A' 또는 'B') */
const AB = window.AB || 'A';

const configured = !SUPABASE_URL.includes("YOUR-PROJECT");
if (!configured){ const w = $('cu-config-warn'); if (w) w.style.display = 'block'; }
const sb = configured ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;


/* ── 이벤트 전송 안전장치 ────────────────────────────
   track()은 index.html에서 function 선언으로 정의된다.
   여기서 const/let 으로 같은 이름을 다시 선언하면
   "Identifier 'track' has already been declared" 오류가 나면서
   app.js 전체가 실행되지 않는다. 그래서 window.track 에만 대입한다.

   광고 차단기가 GA를 막거나 로딩 순서가 어긋나 track이 없을 수도 있는데,
   그때 화면 기능까지 멈추면 안 되므로 빈 함수로 채운다. */
if (typeof window.track !== 'function'){
  window.track = function(name, params){
    if (window.CU_DEBUG) console.log('[track:noop] ' + name, params || {});
  };
}

/* ── DOM 조회 헬퍼 ───────────────────────────────────
   getElementById를 곳곳에서 부르면 HTML의 id 하나만 바뀌어도
   여러 군데가 조용히 망가진다. 여기 한 곳에 모아두고,
   없는 요소를 다뤄도 오류가 나지 않게 한다. */
const $ = id => document.getElementById(id);
const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; return !!el; };
const setText = (id, txt)  => { const el = $(id); if (el) el.textContent = txt; return !!el; };

/* ── 2. 다국어 (i18n) ─────────────────────────────────
   UI 문구는 아래 사전에서, 장소 데이터는 places.i18n에서.
   언어 추가법: ① 사전에 언어 블록 추가 ② LANGS에 코드 추가
                ③ LANG_META에 라벨/표시명 추가
                ④ fill-i18n.js의 SERVICES에 해당 TourAPI 서비스 추가
   zh = 중문 번체(대만·홍콩), zhs = 중문 간체(중국 본토·싱가포르) */
const LANGS = ['en', 'ja', 'zh', 'zhs'];

// 버튼에 보일 짧은 라벨과 메뉴에 보일 현지 표기
const LANG_META = {
  en:  { label:'EN', name:'English' },
  ja:  { label:'JA', name:'日本語' },
  zh:  { label:'繁', name:'中文（繁體）' },
  zhs: { label:'简', name:'中文（简体）' },
};

const I18N = {
  en: {
    nav_home:'Home', nav_explore:'Explore', nav_about:'About',
    // ── A/B 랜딩 문구 ────────────────────────────────
    // A: Practical Information형 — 실용 정보를 앞세운다
    hero_title_a:'Explore Korea<br>without the <em>guesswork.</em>',
    hero_lead_a:'Find restaurants, cafes and attractions with the practical details travelers actually need.',
    hero_points_a:'Solo dining|Spice levels|Foreign cards|English menus',
    hero_cta_a:'Explore Busan',
    // B: Decision / Curation형 — 선택을 줄여준다
    hero_title_b:'Not sure where to go<br>in <em>Busan?</em>',
    hero_lead_b:'Find places that fit your trip — without hours of searching.',
    hero_points_b:'Food|Cafes|Attractions|Shopping',
    hero_cta_b:'Find a place',

    hero_title:'Explore Korea<br>without the <em>guesswork.</em>',
    hero_lead:'Know before you go: solo dining, spice levels, payment methods, local menus in your language, and tips from travelers.',
    search_ph:'Search for restaurants, cafes, places...', search_btn:'Search',
    pop_label:'Popular searches:',
    feat1_t:'Solo Friendly', feat1_d:'Find places where you can eat alone comfortably.',
    feat2_t:'Spice Guide', feat2_d:'See how spicy dishes really are before you order.',
    feat3_t:'Foreign Card', feat3_d:'Check if foreign cards are accepted before you go.',
    feat4_t:'Local Menu Help', feat4_d:'Know if English or your language is available.',
    feat5_t:'How to Eat', feat5_d:'Step-by-step guides to eating Korean food like a local.',
    sec_popular:'🔥 Popular places near you', view_all:'View all →',
    banner_title:'Know before you <em>walk in.</em>',
    stat_places:'Places', stat_reviews:'Reviews', stat_area:'City',
    tests_title:'What travelers are saying',
    all_places:'All places', back_home:'‹ Home',
    browse_theme:'BROWSE BY THEME', walk_route:'WALK A ROUTE', your_situation:'OR TELL US YOUR SITUATION',
    th_local:'Local favorites', th_cafe:'Cafes', th_market:'Markets', th_nature:'Nature', th_pick:'Must-visit',
    si_solo:'Eating alone', si_mild:'Not spicy', si_card:'Card only', si_menu:'Foreign menu',
    co_halfday:'Half day', co_fullday:'Full day', n_stops:'{n} stops',
    view_list:'List', view_map:'Map', see_details:'See details',
    map_missing:'{n} places are not on the map yet — no location saved. Use the list to find them.',
    area_all:'All areas', load_more:'Show more ({n} left)',
    cat_all:'All', cat_restaurant:'🍜 Food', cat_cafe:'☕ Cafe', cat_attraction:'🏛️ Attractions', cat_nature:'🏔️ Nature',
    about_title:'About UsCourse',
    about_text:'UsCourse helps travelers explore Korea without the guesswork — showing whether a place welcomes solo diners, accepts foreign cards, has menus in your language, how spicy the food really is, and how locals actually eat each dish. Data is curated from public sources and enriched by traveler reviews.',
    link_privacy:'Privacy Policy', link_terms:'Terms', link_data:'Data Sources',
    back_explore:'‹ Back to Explore',
    lbl_price:'💰 Price', lbl_fee:'💰 Entry', lbl_spice:'🌶 Spice', lbl_hours:'🕐 Hours', lbl_addr:'📍 Address',
    open_naver:'🗺 Open in Naver Map',
    map_note:'Google Maps has no walking or driving directions in Korea. Naver Map is what locals use.',
    reviews_title:'Traveler reviews', write_review:'✍️ Write a review',
    most_mentioned:'Most mentioned',
    how_was:'How was it?', tap_tags:'(tap tags)',
    comment_ph:'Optional comment (max 500 chars)', country_ph:'Where are you from? (optional)',
    post_review:'Post review',
    anon_note:'Anonymous. You can edit or delete your review later from this browser.',
    no_reviews:'No reviews yet — be the first! 🎉', loading_reviews:'Loading reviews…',
    from:'from', you:'You', edit:'Edit', del:'Delete', report:'🚩 Report', reported:'Reported',
    confirm_delete:'Delete this review?',
    confirm_report:'Report this review as inappropriate or spam?',
    msg_pick:'Pick a tag or write a comment first.',
    msg_links:'Please remove links from your comment.',
    msg_posting:'Posting…', msg_rate:'Please wait a few minutes before posting again.',
    msg_fail:'Could not save. Try again.',
    edit_hint:'Editing your review — tap tags and rewrite, then post.',
    badge_solo:'👤 Solo OK', badge_menu:'🔤 English menu', badge_card:'💳 Foreign card',
    dishes_title:'POPULAR DISHES', protip:'GOOD TO KNOW',
    which_one:'WHICH ONE IS FOR YOU?',
    lv_easy:'Beginner friendly', lv_local:'Local favorite', lv_adventurous:'Adventurous', slip_open:'tap to open',
    expect_title:'WHAT TO EXPECT', getting_there:'GETTING THERE',
    exp_order:'What to order', exp_spice:'Spice level', exp_solo:'Solo dining',
    exp_pay:'Payment', exp_menu:'Menu language', exp_hours:'Hours',
    val_solo_ok:'Solo friendly', val_solo_no:'Better with company',
    val_card_ok:'Foreign cards accepted', val_card_no:'Cash only',
    val_menu_ok:'Foreign language menu available', val_menu_no:'Korean menu only',
    slip_eyebrow:'HOW LOCALS EAT IT',
    basics_title:'Korean dining basics', basics_open:'tap to open',
    share_btn:'🔗 Share this place', share_done:'Link copied ✓', share_copy:'Copy this link:',
    allergy_title:'⚠️ Common allergens in this dish',
    allergy_warn:'This is general information about the dish, not a guarantee about this restaurant. If you have a serious allergy, always confirm with the staff before ordering.',
    allergy_ask:'How to ask the staff →',
    allergy_show:'Show this screen to the staff.',
    n_places:'{n} places', n_results:'{n} results for "{q}"',
    no_match:'Nothing matches these filters.', clear_filters:'Clear filters',
    empty_places:'No places yet.', connect_sb:'Connect Supabase to load data.',
  },
  ja: {
    nav_home:'ホーム', nav_explore:'探す', nav_about:'紹介',
    hero_title_a:'韓国を、<br><em>迷わず楽しむ。</em>',
    hero_lead_a:'旅行者が本当に必要とする実用情報つきで、レストラン・カフェ・観光スポットを探せます。',
    hero_points_a:'一人ごはん|辛さレベル|海外カード|外国語メニュー',
    hero_cta_a:'釜山を見る',
    hero_title_b:'釜山、<br><em>どこへ行こう？</em>',
    hero_lead_b:'長い検索はもう不要。旅のスタイルに合う場所が見つかります。',
    hero_points_b:'グルメ|カフェ|観光|ショッピング',
    hero_cta_b:'場所を探す',

    hero_title:'韓国を、<br><em>迷わず楽しむ。</em>',
    hero_lead:'一人ごはん・辛さレベル・海外カード・外国語メニュー。行く前に知りたい情報と旅行者のクチコミ。',
    search_ph:'レストラン・カフェ・スポットを検索...', search_btn:'検索',
    pop_label:'人気の検索：',
    feat1_t:'おひとりさまOK', feat1_d:'一人でも入りやすいお店がわかる。',
    feat2_t:'辛さガイド', feat2_d:'注文前に本当の辛さをチェック。',
    feat3_t:'海外カード', feat3_d:'海外発行カードが使えるか事前に確認。',
    feat4_t:'外国語メニュー', feat4_d:'英語・日本語メニューの有無がわかる。',
    feat5_t:'食べ方ガイド', feat5_d:'地元流の食べ方をステップで紹介。',
    sec_popular:'🔥 人気スポット', view_all:'すべて見る →',
    banner_title:'入る前に、<br><em>知っておく。</em>',
    stat_places:'スポット', stat_reviews:'レビュー', stat_area:'都市',
    tests_title:'旅行者の声',
    all_places:'すべての場所', back_home:'‹ ホーム',
    browse_theme:'テーマから探す', walk_route:'コースを歩く', your_situation:'条件から探す',
    th_local:'地元で人気', th_cafe:'カフェ', th_market:'市場', th_nature:'自然', th_pick:'必見スポット',
    si_solo:'一人ごはん', si_mild:'辛くない', si_card:'カード可', si_menu:'外国語メニュー',
    co_halfday:'半日', co_fullday:'一日', n_stops:'{n}スポット',
    view_list:'リスト', view_map:'地図', see_details:'詳しく見る',
    map_missing:'{n}件は位置情報がなく地図に表示できません。リストからご覧ください。',
    area_all:'すべての地域', load_more:'もっと見る（残り{n}件）',
    cat_all:'すべて', cat_restaurant:'🍜 グルメ', cat_cafe:'☕ カフェ', cat_attraction:'🏛️ 観光', cat_nature:'🏔️ 自然',
    about_title:'UsCourseについて',
    about_text:'UsCourseは、韓国旅行の「わからない」をなくすサービスです。一人でも入りやすいか、海外カードが使えるか、外国語メニューがあるか、どれくらい辛いか、そして地元の人はどう食べるのか。公共データと旅行者のレビューをもとに情報をお届けします。',
    link_privacy:'プライバシーポリシー', link_terms:'利用規約', link_data:'データ出典',
    back_explore:'‹ 探すに戻る',
    lbl_price:'💰 価格', lbl_fee:'💰 入場料', lbl_spice:'🌶 辛さ', lbl_hours:'🕐 営業時間', lbl_addr:'📍 住所',
    open_naver:'🗺 Naverマップで開く',
    map_note:'韓国ではGoogleマップの徒歩・車ルート案内が使えません。Naverマップが現地の標準です。',
    reviews_title:'旅行者レビュー', write_review:'✍️ レビューを書く',
    most_mentioned:'よく言及されるタグ',
    how_was:'どうでしたか？', tap_tags:'（タグをタップ）',
    comment_ph:'コメント（任意・500字まで）', country_ph:'どこから来ましたか？（任意）',
    post_review:'投稿する',
    anon_note:'匿名投稿。あとでこのブラウザから編集・削除できます。',
    no_reviews:'まだレビューがありません — 最初の一人になろう！🎉', loading_reviews:'レビューを読み込み中…',
    from:'from', you:'あなた', edit:'編集', del:'削除', report:'🚩 報告', reported:'報告済み',
    confirm_delete:'このレビューを削除しますか？',
    confirm_report:'このレビューを不適切・スパムとして報告しますか？',
    msg_pick:'タグを選ぶかコメントを書いてください。',
    msg_links:'コメントからリンクを削除してください。',
    msg_posting:'投稿中…', msg_rate:'数分おいてから再投稿してください。',
    msg_fail:'保存できませんでした。もう一度お試しください。',
    edit_hint:'レビューを編集中 — タグを選び直して投稿してください。',
    badge_solo:'👤 一人OK', badge_menu:'🔤 外国語メニュー', badge_card:'💳 海外カード',
    dishes_title:'看板メニュー', protip:'知っておくと安心',
    which_one:'どれを選ぶ？',
    lv_easy:'はじめての方に', lv_local:'地元で人気', lv_adventurous:'チャレンジ向け', slip_open:'タップで開く',
    expect_title:'行く前に', getting_there:'行き方',
    exp_order:'おすすめ', exp_spice:'辛さ', exp_solo:'おひとりさま',
    exp_pay:'支払い', exp_menu:'メニュー言語', exp_hours:'営業時間',
    val_solo_ok:'一人でも入りやすい', val_solo_no:'複数人向け',
    val_card_ok:'海外カード利用可', val_card_no:'現金のみ',
    val_menu_ok:'外国語メニューあり', val_menu_no:'韓国語メニューのみ',
    slip_eyebrow:'地元の食べ方',
    basics_title:'韓国の食堂の基本', basics_open:'タップで開く',
    share_btn:'🔗 このお店をシェア', share_done:'リンクをコピーしました ✓', share_copy:'このリンクをコピー：',
    allergy_title:'⚠️ この料理に入りやすい原材料',
    allergy_warn:'料理一般の情報であり、この店を保証するものではありません。重いアレルギーがある方は必ず注文前にお店へご確認ください。',
    allergy_ask:'店員さんへの聞き方 →',
    allergy_show:'この画面を店員さんに見せてください。',
    n_places:'{n}件', n_results:'「{q}」の検索結果 {n}件',
    no_match:'条件に合う場所がありません。', clear_filters:'条件を解除する',
    empty_places:'まだ場所がありません。', connect_sb:'Supabase接続後に表示されます。',
  },
  zh: {
    nav_home:'首頁', nav_explore:'探索', nav_about:'關於',
    hero_title_a:'玩韓國，<br><em>不用再用猜的。</em>',
    hero_lead_a:'餐廳、咖啡廳、景點，附上旅客真正需要的實用資訊。',
    hero_points_a:'一人用餐|辣度|海外卡|外語菜單',
    hero_cta_a:'看看釜山',
    hero_title_b:'釜山，<br><em>不知道去哪裡？</em>',
    hero_lead_b:'不用花好幾小時查資料，找到適合這趟旅行的地方。',
    hero_points_b:'美食|咖啡廳|景點|購物',
    hero_cta_b:'找地方',

    hero_title:'玩韓國，<br><em>不用再用猜的。</em>',
    hero_lead:'出發前先知道：一人用餐、辣度、海外卡付款、外語菜單，還有旅客的在地情報。',
    search_ph:'搜尋餐廳、咖啡廳、景點...', search_btn:'搜尋',
    pop_label:'熱門搜尋：',
    feat1_t:'一人友善', feat1_d:'找到可以自在獨自用餐的店家。',
    feat2_t:'辣度指南', feat2_d:'點餐前先知道到底有多辣。',
    feat3_t:'海外卡支付', feat3_d:'先確認是否收海外信用卡。',
    feat4_t:'外語菜單', feat4_d:'英文／中文菜單有無一目了然。',
    feat5_t:'怎麼吃', feat5_d:'跟著在地人步驟吃懂韓國美食。',
    sec_popular:'🔥 附近人氣地點', view_all:'查看全部 →',
    banner_title:'進門前，<br><em>先知道。</em>',
    stat_places:'地點', stat_reviews:'評論', stat_area:'城市',
    tests_title:'旅客怎麼說',
    all_places:'全部地點', back_home:'‹ 首頁',
    browse_theme:'依主題瀏覽', walk_route:'走一條路線', your_situation:'或告訴我們你的情況',
    th_local:'在地人最愛', th_cafe:'咖啡廳', th_market:'市場', th_nature:'自然', th_pick:'必訪景點',
    si_solo:'一人用餐', si_mild:'不辣', si_card:'可刷卡', si_menu:'有外語菜單',
    co_halfday:'半天', co_fullday:'一整天', n_stops:'{n} 個站點',
    view_list:'清單', view_map:'地圖', see_details:'查看詳情',
    map_missing:'有 {n} 個地點尚無座標，無法顯示在地圖上，請用清單瀏覽。',
    area_all:'全部地區', load_more:'顯示更多（還有 {n} 筆）',
    cat_all:'全部', cat_restaurant:'🍜 美食', cat_cafe:'☕ 咖啡', cat_attraction:'🏛️ 景點', cat_nature:'🏔️ 自然',
    about_title:'關於 UsCourse',
    about_text:'UsCourse 幫助旅客不再靠猜探索韓國——一人用餐是否自在、是否收海外卡、有無外語菜單、食物到底多辣，以及在地人怎麼吃每道料理。資料來自公開來源，並由旅客評論持續補充。',
    link_privacy:'隱私權政策', link_terms:'服務條款', link_data:'資料來源',
    back_explore:'‹ 返回探索',
    lbl_price:'💰 價格', lbl_fee:'💰 門票', lbl_spice:'🌶 辣度', lbl_hours:'🕐 營業時間', lbl_addr:'📍 地址',
    open_naver:'🗺 用 Naver 地圖開啟',
    map_note:'在韓國，Google 地圖無法提供步行與駕車導航。當地人都用 Naver 地圖。',
    reviews_title:'旅客評論', write_review:'✍️ 撰寫評論',
    most_mentioned:'最常提到',
    how_was:'這裡如何？', tap_tags:'（點選標籤）',
    comment_ph:'留言（選填，最多 500 字）', country_ph:'你來自哪裡？（選填）',
    post_review:'送出評論',
    anon_note:'匿名發布。之後可在此瀏覽器編輯或刪除。',
    no_reviews:'還沒有評論——當第一個吧！🎉', loading_reviews:'載入評論中…',
    from:'from', you:'你', edit:'編輯', del:'刪除', report:'🚩 檢舉', reported:'已檢舉',
    confirm_delete:'確定刪除這則評論？',
    confirm_report:'將這則評論檢舉為不當或垃圾內容？',
    msg_pick:'請先選標籤或寫留言。',
    msg_links:'請移除留言中的連結。',
    msg_posting:'發布中…', msg_rate:'請稍候幾分鐘再發布。',
    msg_fail:'儲存失敗，請再試一次。',
    edit_hint:'正在編輯你的評論——選好標籤並重寫後送出。',
    badge_solo:'👤 一人友善', badge_menu:'🔤 外語菜單', badge_card:'💳 海外卡',
    dishes_title:'招牌菜', protip:'先知道會更安心',
    which_one:'該點哪一種？',
    lv_easy:'初次推薦', lv_local:'在地人最愛', lv_adventurous:'挑戰口味', slip_open:'點擊展開',
    expect_title:'出發前先知道', getting_there:'怎麼去',
    exp_order:'推薦點什麼', exp_spice:'辣度', exp_solo:'一人用餐',
    exp_pay:'付款', exp_menu:'菜單語言', exp_hours:'營業時間',
    val_solo_ok:'一人也自在', val_solo_no:'適合多人同行',
    val_card_ok:'可用海外卡', val_card_no:'僅收現金',
    val_menu_ok:'有外語菜單', val_menu_no:'只有韓文菜單',
    slip_eyebrow:'在地人這樣吃',
    basics_title:'韓國餐廳基本常識', basics_open:'點擊展開',
    share_btn:'🔗 分享這家店', share_done:'已複製連結 ✓', share_copy:'複製此連結：',
    allergy_title:'⚠️ 這道菜常見的過敏原',
    allergy_warn:'這是關於料理的一般資訊，並非對本店的保證。若有嚴重過敏，點餐前請務必向店家確認。',
    allergy_ask:'如何詢問店員 →',
    allergy_show:'請把這個畫面拿給店員看。',
    n_places:'{n} 個地點', n_results:'「{q}」的 {n} 筆結果',
    no_match:'沒有符合條件的地點。', clear_filters:'清除篩選',
    empty_places:'尚無地點。', connect_sb:'連接 Supabase 後顯示。',
  },
  zhs: {
    nav_home:'首页', nav_explore:'探索', nav_about:'关于',
    hero_title_a:'玩韩国，<br><em>不用再靠猜。</em>',
    hero_lead_a:'餐厅、咖啡馆、景点，附上旅客真正需要的实用信息。',
    hero_points_a:'一人用餐|辣度|境外卡|外语菜单',
    hero_cta_a:'看看釜山',
    hero_title_b:'釜山，<br><em>不知道去哪里？</em>',
    hero_lead_b:'不用花好几小时查资料，找到适合这趟旅行的地方。',
    hero_points_b:'美食|咖啡馆|景点|购物',
    hero_cta_b:'找地方',

    hero_title:'玩韩国，<br><em>不用再靠猜。</em>',
    hero_lead:'出发前先知道：一人用餐、辣度、境外卡支付、外语菜单，还有旅客的在地情报。',
    search_ph:'搜索餐厅、咖啡馆、景点...', search_btn:'搜索',
    pop_label:'热门搜索：',
    feat1_t:'一人友好', feat1_d:'找到可以自在独自用餐的店家。',
    feat2_t:'辣度指南', feat2_d:'点餐前先知道到底有多辣。',
    feat3_t:'境外卡支付', feat3_d:'提前确认是否收境外银行卡。',
    feat4_t:'外语菜单', feat4_d:'英文／中文菜单有无一目了然。',
    feat5_t:'怎么吃', feat5_d:'跟着当地人步骤吃懂韩国美食。',
    sec_popular:'🔥 附近人气地点', view_all:'查看全部 →',
    banner_title:'进门前，<br><em>先知道。</em>',
    stat_places:'地点', stat_reviews:'评价', stat_area:'城市',
    tests_title:'旅客怎么说',
    all_places:'全部地点', back_home:'‹ 首页',
    browse_theme:'按主题浏览', walk_route:'走一条路线', your_situation:'或告诉我们你的情况',
    th_local:'当地人最爱', th_cafe:'咖啡馆', th_market:'市场', th_nature:'自然', th_pick:'必访景点',
    si_solo:'一人用餐', si_mild:'不辣', si_card:'可刷卡', si_menu:'有外语菜单',
    co_halfday:'半天', co_fullday:'一整天', n_stops:'{n} 个站点',
    view_list:'列表', view_map:'地图', see_details:'查看详情',
    map_missing:'有 {n} 个地点尚无坐标，无法显示在地图上，请用列表浏览。',
    area_all:'全部地区', load_more:'显示更多（还有 {n} 条）',
    cat_all:'全部', cat_restaurant:'🍜 美食', cat_cafe:'☕ 咖啡', cat_attraction:'🏛️ 景点', cat_nature:'🏔️ 自然',
    about_title:'关于 UsCourse',
    about_text:'UsCourse 帮助旅客不再靠猜探索韩国——一人用餐是否自在、是否收境外卡、有无外语菜单、食物到底多辣，以及当地人怎么吃每道料理。资料来自公开来源，并由旅客评价持续补充。',
    link_privacy:'隐私政策', link_terms:'服务条款', link_data:'数据来源',
    back_explore:'‹ 返回探索',
    lbl_price:'💰 价格', lbl_fee:'💰 门票', lbl_spice:'🌶 辣度', lbl_hours:'🕐 营业时间', lbl_addr:'📍 地址',
    open_naver:'🗺 用 Naver 地图打开',
    map_note:'在韩国，谷歌地图无法提供步行与驾车导航。当地人都用 Naver 地图。',
    reviews_title:'旅客评价', write_review:'✍️ 撰写评价',
    most_mentioned:'最常提到',
    how_was:'这里如何？', tap_tags:'（点选标签）',
    comment_ph:'留言（选填，最多 500 字）', country_ph:'你来自哪里？（选填）',
    post_review:'提交评价',
    anon_note:'匿名发布。之后可在此浏览器编辑或删除。',
    no_reviews:'还没有评价——来当第一个吧！🎉', loading_reviews:'加载评价中…',
    from:'from', you:'你', edit:'编辑', del:'删除', report:'🚩 举报', reported:'已举报',
    confirm_delete:'确定删除这条评价？',
    confirm_report:'将这条评价举报为不当或垃圾内容？',
    msg_pick:'请先选标签或写留言。',
    msg_links:'请移除留言中的链接。',
    msg_posting:'发布中…', msg_rate:'请稍候几分钟再发布。',
    msg_fail:'保存失败，请再试一次。',
    edit_hint:'正在编辑你的评价——选好标签并重写后提交。',
    badge_solo:'👤 一人友好', badge_menu:'🔤 外语菜单', badge_card:'💳 境外卡',
    dishes_title:'招牌菜', protip:'先知道会更安心',
    which_one:'该点哪一种？',
    lv_easy:'初次推荐', lv_local:'当地人最爱', lv_adventurous:'挑战口味', slip_open:'点击展开',
    expect_title:'出发前先知道', getting_there:'怎么去',
    exp_order:'推荐点什么', exp_spice:'辣度', exp_solo:'一人用餐',
    exp_pay:'付款', exp_menu:'菜单语言', exp_hours:'营业时间',
    val_solo_ok:'一人也自在', val_solo_no:'适合多人同行',
    val_card_ok:'可用海外卡', val_card_no:'仅收现金',
    val_menu_ok:'有外语菜单', val_menu_no:'只有韩文菜单',
    slip_eyebrow:'当地人这样吃',
    basics_title:'韩国餐厅基本常识', basics_open:'点击展开',
    share_btn:'🔗 分享这家店', share_done:'已复制链接 ✓', share_copy:'复制此链接：',
    allergy_title:'⚠️ 这道菜常见的过敏原',
    allergy_warn:'这是关于菜品的一般信息，并非对本店的保证。若有严重过敏，点餐前请务必向店家确认。',
    allergy_ask:'如何询问店员 →',
    allergy_show:'请把这个画面拿给店员看。',
    n_places:'{n} 个地点', n_results:'「{q}」的 {n} 条结果',
    no_match:'没有符合条件的地点。', clear_filters:'清除筛选',
    empty_places:'暂无地点。', connect_sb:'连接 Supabase 后显示。',
  },
};

/* 첫 방문이면 브라우저 언어로 자동 선택, 이후엔 저장된 선택을 따름.
   (요즘 표준 방식 — 강제로 언어를 고르게 하지 않고, 틀렸으면 직접 바꾸게 한다) */
function detectLang(){
  const saved = localStorage.getItem('cu_lang');
  if (saved && LANGS.includes(saved)) return saved;
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('zh')){
    // zh-TW / zh-HK / zh-MO / zh-Hant → 번체, 그 외(zh-CN, zh-SG, zh-Hans) → 간체
    return /(tw|hk|mo|hant)/.test(nav) ? 'zh' : 'zhs';
  }
  return 'en';
}

let LANG = detectLang();
window.LANG = LANG;   // 공통 파라미터(language)에서 사용
if (!LANGS.includes(LANG)) LANG = 'en';

// UI 문구 조회 (없으면 영어 폴백)
function t(key){ return (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key; }

// 장소 필드를 현재 언어로 (없으면 영어 데이터로 폴백)
// 주의: 부산시 API는 일/중문판에서도 상호명을 한글로 주는 경우가 많음.
//       그때는 한글을 그대로 보여주지 않고 영문 표기(name_en)로 대체한다.
function pf(p, field){
  const loc = p.i18n && p.i18n[LANG];
  const v = loc && loc[field];
  if (v && !(field === 'name' && /[가-힣]/.test(v))) return v;
  if (field === 'name') return p.name;
  if (field === 'menu') return p.cat;
  if (field === 'hours') return p.hours;
  if (field === 'address') return p.address;
  return '';
}

/* 히어로에 A/B 문구를 적용한다 (언어 전환 시에도 다시 불린다) */
function applyHero(){
  const suffix = '_' + AB.toLowerCase();
  const set = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = t(key + suffix);
  };
  // A/B로 달라지는 것은 헤드라인과 서브헤드라인뿐이다.
  // 검색 버튼 문구는 'Search'로 고정(data-i18n="search_btn").
  set('hero-title', 'hero_title');
  set('hero-lead',  'hero_lead');
}

/* 인기 검색어 칩 — 검색으로 집계한다 */
function popSearch(term){
  const box = $('home-search'); if (box) box.value = term;
  doSearch('popular_tag');
}

// data-i18n 붙은 요소 전부 현재 언어로 교체
function applyLang(){
  document.querySelectorAll('[data-i18n]').forEach(el => el.innerHTML = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  const lbl = document.getElementById('lang-label');
  if (lbl) lbl.textContent = (LANG_META[LANG] || {}).label || LANG.toUpperCase();
  document.documentElement.lang =
    LANG === 'zh' ? 'zh-Hant' : LANG === 'zhs' ? 'zh-Hans' : LANG;
  renderLangMenu();
  applyHero();
}

// 드롭다운 목록 그리기 (현재 언어에 체크 표시)
function renderLangMenu(){
  const box = document.getElementById('lang-menu');
  if (!box) return;
  box.innerHTML = LANGS.map(l => {
    const m = LANG_META[l] || { name: l };
    return `<div class="cu-langitem${l === LANG ? ' on' : ''}" data-lang="${esc(l)}">
      <span>${m.name}</span>${l === LANG ? '<span class="ck">✓</span>' : ''}</div>`;
  }).join('');
}

function toggleLangMenu(e){
  if (e) e.stopPropagation();          // 바깥 클릭 닫기와 충돌 방지
  document.getElementById('lang-menu')?.classList.toggle('on');
}

// 메뉴 밖을 클릭하면 닫기
document.addEventListener('click', () => {
  document.getElementById('lang-menu')?.classList.remove('on');
});

function setLang(l){
  if (!LANGS.includes(l)) return;
  LANG = l; window.LANG = l; localStorage.setItem('cu_lang', l);
  document.getElementById('lang-menu')?.classList.remove('on');
  applyLang();
  if (PLACES.length){
    setHTML('home-grid', homePicks().map(cardHTML).join('') || empty());
    renderCuration();
    applyFilters(false);
  }
  if (currentPlace && $('view-detail')?.classList.contains('on')){
    renderDetail(currentPlace.id);
  }
  track('lang_change', { lang: l });
}


/* ── 3. 익명 본인확인 토큰 ────────────────────────────
   브라우저마다 비밀 토큰 1개를 만들어 localStorage에 보관.
   리뷰 작성 시 토큰의 "해시"만 DB에 저장하고,
   수정/삭제할 때 원본 토큰을 제시해 본인임을 증명합니다. */
function myToken(){
  let tk = localStorage.getItem('cu_token');
  if (!tk) { tk = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('cu_token', tk); }
  return tk;
}
async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/* 내가 쓴 리뷰 id 목록.
   Supabase가 uuid를 문자열로 주지만, 저장·비교 과정에서 타입이 섞이면
   "내 리뷰인데 수정 버튼이 안 보이는" 문제가 생긴다. 항상 문자열로 맞춘다. */
const idStr = v => (v === null || v === undefined) ? '' : String(v);

function myReviewIds(){
  try {
    const raw = JSON.parse(localStorage.getItem('cu_myreviews') || '[]');
    return Array.isArray(raw) ? raw.map(idStr).filter(Boolean) : [];
  } catch(e){ return []; }
}
function addMyReview(id){
  const key = idStr(id);
  if (!key) return;
  const a = myReviewIds();
  if (!a.includes(key)) a.push(key);
  try { localStorage.setItem('cu_myreviews', JSON.stringify(a)); } catch(e){}
}
function removeMyReview(id){
  const key = idStr(id);
  try { localStorage.setItem('cu_myreviews', JSON.stringify(myReviewIds().filter(x => x !== key))); } catch(e){}
}
function reportedIds(){
  try {
    const raw = JSON.parse(localStorage.getItem('cu_reported') || '[]');
    return Array.isArray(raw) ? raw.map(idStr).filter(Boolean) : [];
  } catch(e){ return []; }
}
function addReported(id){
  const key = idStr(id);
  if (!key) return;
  const a = reportedIds();
  if (!a.includes(key)) a.push(key);
  try { localStorage.setItem('cu_reported', JSON.stringify(a)); } catch(e){}
}


/* ── 4. 공용 헬퍼 ───────────────────────────────────── */
// 사용자/외부 데이터를 화면에 넣기 전 반드시 통과 (XSS 방지)
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function timeAgo(iso){
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return Math.max(1, Math.floor(s/60)) + ' min ago';
  if (s < 86400) return Math.floor(s/3600) + ' hours ago';
  if (s < 86400*30) return Math.floor(s/86400) + ' days ago';
  return new Date(iso).toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'});
}
// 뱃지 색: g(초록) b(파랑) p(보라) a(주황) r(빨강) — styles.css 색 변수 사용
const COL = { g:['--g-bg','--g-fg'], b:['--b-bg','--b-fg'], p:['--p-bg','--p-fg'], a:['--a-bg','--a-fg'], r:['--r-bg','--r-fg'] };
function ico(pair){
  const c = COL[pair[0]] || COL.p;
  return `<span class="cu-ico" style="background:var(${c[0]});color:var(${c[1]});border-radius:99px;padding:4px 10px;font-size:12px;font-weight:600;display:inline-block;width:auto;height:auto">${esc(pair[1])}</span>`;
}
// 카테고리별 폴백 이모지 (이미지 없는 장소에 표시)
const CAT_EMOJI = { restaurant:'🍜', cafe:'☕', attraction:'🏛️', shopping:'🛍️', nature:'🏔️' };

// 기능 뱃지 목록 — 렌더 시점에 현재 언어로 생성 (카테고리별로 다름)
function iconsFor(p){
  const icons = [];
  const isFood = p.category === 'restaurant' || p.category === 'cafe';
  if (isFood && p.solo)  icons.push(['g', t('badge_solo')]);
  if (isFood && p.eng)   icons.push(['b', t('badge_menu')]);
  if (p.card)            icons.push(['a', t('badge_card')]);   // 카드는 쇼핑도 유효
  if (isFood && p.spice) icons.push(['r', '🌶 ' + p.spice]);
  (p.extra || []).forEach(s => {
    const i = s.indexOf('|');
    icons.push(i >= 0 ? [s.slice(0,i), s.slice(i+1)] : ['p', s]);
  });
  return icons;
}


/* ── 5. 먹는법 가이드 로드 ────────────────────────────
   food_guides 테이블을 시작 시 한 번 불러와 메모리에 보관 */
let GUIDES = {};

async function loadGuides(){
  if (!sb) return;
  const { data, error } = await sb.from('food_guides').select('*');
  if (error){ console.error(error); return; }
  (data || []).forEach(g => GUIDES[g.key] = g);
}


/* ── 5.5. 큐레이션 진입점 ─────────────────────────────
   홈에서 "어디부터 볼까"에 답하는 영역.
   테마·코스·상황 세 층으로 나누고, 개수는 실제 DB에서 센다.
   비어 있는 테마는 자동으로 숨겨 빈 화면으로 가는 일이 없게 한다. */

// 테마 — [키, 아이콘, 이름 키, 조건]
const THEMES = [
  { key:'local',   icon:'🏅', name:'th_local',   test: p => p.local },
  { key:'cafe',    icon:'☕', name:'th_cafe',    test: p => p.category === 'cafe' },
  { key:'market',  icon:'🛍️', name:'th_market',  test: p => /시장|market/i.test((p.ko || '') + (p.name || '')) },
  { key:'nature',  icon:'🏔️', name:'th_nature',  test: p => p.category === 'nature' },
  { key:'pick',    icon:'⭐', name:'th_pick',    test: p => (p.sort || 0) >= 10 },
];

// 상황 — 확인된 뱃지로 거른다 (미확인은 제외)
const SITUATIONS = [
  { key:'solo',  icon:'👤', name:'si_solo',  test: p => p.solo },
  { key:'mild',  icon:'🌶', name:'si_mild',  test: p => /mild/i.test(p.spice || '') },
  { key:'card',  icon:'💳', name:'si_card',  test: p => p.card },
  { key:'menu',  icon:'🔤', name:'si_menu',  test: p => p.eng },
];

/* 코스 — courses 테이블에서 읽어온다.
   코스를 추가할 때는 SQL로 insert 하면 되고, 이 파일은 고치지 않아도 된다.
   테이블이 아직 없으면 빈 배열로 두고 코스 영역만 숨긴다. */
let COURSES = [];

async function loadCourses(){
  if (!sb) return;
  try {
    const { data, error } = await sb.from('courses')
      .select('key, icon, title_en, title_ko, summary_en, duration, stops, i18n, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: false });
    if (error) throw error;
    COURSES = (data || []).map(c => ({
      key:     c.key,
      icon:    c.icon || '📍',
      title:   c.title_en,
      titleKo: c.title_ko || '',
      summary: c.summary_en || '',
      dur:     c.duration === 'full' ? 'co_fullday' : 'co_halfday',
      stops:   c.stops || [],
      i18n:    c.i18n || {},
    }));
  } catch(e){
    // 테이블이 없거나 조회에 실패해도 사이트는 계속 동작해야 한다
    console.warn('코스를 불러오지 못했습니다:', e.message);
    COURSES = [];
  }
}

/* 코스 제목·설명을 현재 언어로 */
function cf(c, field){
  const loc = c.i18n && c.i18n[LANG];
  if (loc && loc[field]) return loc[field];
  return field === 'title' ? c.title : c.summary;
}

let curTheme = null, curSituation = null;

function renderCuration(){
  // 테마 — 장소가 있는 것만 보여준다
  const themeBox = document.getElementById('cu-themes');
  if (themeBox){
    themeBox.innerHTML = THEMES.map(th => {
      const n = PLACES.filter(th.test).length;
      if (!n) return '';
      return `<div class="cu-theme${curTheme === th.key ? ' on' : ''}" data-theme="${esc(th.key)}">
        <div class="cu-theme-ic">${th.icon}</div>
        <div class="cu-theme-nm">${t(th.name)}</div>
        <div class="cu-theme-n">${t('n_places').replace('{n}', n)}</div>
      </div>`;
    }).join('');
  }

  // 코스
  const courseBox = document.getElementById('cu-courses');
  if (courseBox){
    courseBox.innerHTML = COURSES.map(c => `
      <div class="cu-course" data-course="${esc(c.key)}">
        <div class="cu-course-ic">${esc(c.icon)}</div>
        <div>
          <div class="cu-course-tt">${esc(cf(c, 'title'))}</div>
          <div class="cu-course-ds">${esc(cf(c, 'summary'))}</div>
          <div class="cu-course-tags">
            <span>${t(c.dur)}</span>
            <span>${t('n_stops').replace('{n}', (c.stops || []).length)}</span>
          </div>
        </div>
      </div>`).join('');
  }

  // 코스가 없으면 그 구역 제목까지 숨긴다
  const courseLabel = courseBox && courseBox.previousElementSibling;
  if (courseLabel && courseLabel.classList.contains('cu-curate-lb')){
    const show = COURSES.length > 0;
    courseLabel.style.display = show ? '' : 'none';
    courseBox.style.display   = show ? '' : 'none';
  }

  // 상황
  const sitBox = document.getElementById('cu-situations');
  if (sitBox){
    sitBox.innerHTML = SITUATIONS.map(si => {
      const n = PLACES.filter(si.test).length;
      if (!n) return '';
      return `<span class="cu-situation${curSituation === si.key ? ' on' : ''}" data-situation="${esc(si.key)}">
        ${si.icon} ${t(si.name)}</span>`;
    }).join('');
  }
}

/* 테마 클릭 — Explore로 이동해 그 조건만 보여준다 */
function pickTheme(key){
  const th = THEMES.find(x => x.key === key); if (!th) return;
  track('badge_click', { badge_name: 'theme_' + key });
  curTheme = key; curSituation = null;
  curQuery = ''; curCat = 'all'; curArea = 'all';
  document.querySelectorAll('#cu-filters .cu-poptag').forEach((x, i) => x.classList.toggle('act', i === 0));
  applyFilters();
  go('explore');
}

function pickSituation(key){
  const si = SITUATIONS.find(x => x.key === key); if (!si) return;
  track('badge_click', { badge_name: 'situation_' + key });
  curSituation = key; curTheme = null;
  curQuery = ''; curCat = 'all'; curArea = 'all';
  document.querySelectorAll('#cu-filters .cu-poptag').forEach((x, i) => x.classList.toggle('act', i === 0));
  applyFilters();
  go('explore');
}

/* 코스 클릭 — 코스에 속한 장소만 보여준다 */
function openCourse(key){
  const c = COURSES.find(x => x.key === key); if (!c) return;
  track('badge_click', { badge_name: 'course_' + key });
  curTheme = 'course:' + key; curSituation = null;
  curQuery = ''; curCat = 'all'; curArea = 'all';
  applyFilters();
  go('explore');
}

/* 현재 선택된 테마·상황을 목록에 적용 */
function curationFilter(list){
  if (curSituation){
    const si = SITUATIONS.find(x => x.key === curSituation);
    if (si) return list.filter(si.test);
  }
  if (curTheme && curTheme.startsWith('course:')){
    const c = COURSES.find(x => 'course:' + x.key === curTheme);
    if (c){
      const norm = s => (s || '').replace(/\s/g, '');
      return list.filter(p => c.stops.some(st => norm(p.ko).includes(norm(st)) || norm(st).includes(norm(p.ko))));
    }
  }
  if (curTheme){
    const th = THEMES.find(x => x.key === curTheme);
    if (th) return list.filter(th.test);
  }
  return list;
}

/* ── 6. 장소 로드 · 카드 렌더 ───────────────────────── */
let PLACES = [];

function rowToPlace(r){
  return {
    id: r.id, name: r.name_en, ko: r.name_ko || '', cat: r.subcategory || r.category,
    category: r.category,
    sort: r.sort_order || 0,
    emoji: CAT_EMOJI[r.category] || '📍',
    img: r.image_url || '', local: !!r.is_local,
    area: r.area || '', city: r.city || 'Busan', price: r.price_level || '₩',
    solo: !!r.solo_ok, eng: !!r.english_menu, card: !!r.foreign_card,
    // null(미확인)과 false(확인했는데 아님)를 구분한다
    soloSet: r.solo_ok !== null && r.solo_ok !== undefined,
    engSet:  r.english_menu !== null && r.english_menu !== undefined,
    cardSet: r.foreign_card !== null && r.foreign_card !== undefined,
    spice: r.spice_level || '', hours: r.hours || '', address: r.address || '',
    extra: r.extra_badges || [],
    recLangs: r.rec_langs || [],
    foodKey: r.food_guide_key || '',
    i18n: r.i18n || {},
    lat: r.lat, lng: r.lng,
    // 좌표가 있으면 핀으로 정확히, 없으면 한글 상호 + 부산으로 검색
    mapNaver: (r.lat && r.lng)
      ? `https://map.naver.com/p/search/${encodeURIComponent(r.name_ko || r.name_en)}?c=${r.lng},${r.lat},17,0,0,0,dh`
      : 'https://map.naver.com/p/search/' + encodeURIComponent((r.name_ko || r.name_en) + ' 부산'),
  };
}

async function loadPlaces(){
  if (!sb){
    const m = `<div class="cu-empty" style="grid-column:1/-1;color:var(--muted);padding:30px 0">${t('connect_sb')}</div>`;
    setHTML('home-grid', m);
    setHTML('explore-grid', m);
    return;
  }
  const { data, error } = await sb.from('places').select('*')
    .order('sort_order', { ascending:false })
    .order('created_at', { ascending:false });
  if (error){ console.error(error); return; }
  PLACES = (data || []).map(rowToPlace);

  await loadCourses();                 // 코스는 DB에서 (courses 테이블)
  setHTML('home-grid', homePicks().map(cardHTML).join('') || empty());
  renderCuration();
  applyFilters();
  setText('stat-places', PLACES.length);

  const { count } = await sb.from('reviews_public').select('*', { count:'exact', head:true });
  setText('stat-reviews', count || 0);

  // #place/{id} 로 바로 들어온 경우, 데이터가 준비된 지금 다시 그린다
  const h = location.hash.slice(1);
  if (h.startsWith('place/')) render(h);

  loadTestimonials();
}
function empty(){ return `<div class="cu-empty" style="grid-column:1/-1;color:var(--muted);padding:30px 0">${t('empty_places')}</div>`; }

/* 필터 때문에 결과가 0건일 때 — 왜 비었는지 알려주고 해제 버튼을 준다 */
function emptyFiltered(){
  const chips = [];
  if (curQuery) chips.push(`"${esc(curQuery)}"`);
  if (curArea !== 'all') chips.push(esc(areaLabel(curArea)));
  return `<div class="cu-empty" style="grid-column:1/-1;color:var(--muted);padding:34px 0;text-align:center">
    <div style="font-size:14px;color:var(--ink);margin-bottom:6px">${t('no_match')}</div>
    ${chips.length ? `<div style="font-size:12.5px;margin-bottom:14px">${chips.join(' · ')}</div>` : ''}
    <button class="cu-morebtn" onclick="clearFilters()">${t('clear_filters')}</button>
  </div>`;
}

/* 검색어·지역 필터를 모두 해제하고 현재 카테고리 전체를 다시 보여준다 */
function clearFilters(){
  curQuery = ''; curArea = 'all'; curTheme = null; curSituation = null;
  const box = document.getElementById('home-search');
  if (box) box.value = '';
  applyFilters();
}

/* 홈에 노출할 4곳 — 현재 언어로 추천된 곳을 앞에 두고 나머지로 채운다.
   (Explore에서는 걸러내지 않는다. 추천 순서를 바꾸는 것과 숨기는 것은 다르다) */
function homePicks(n = 4){
  const rec  = byPhotoFirst(PLACES.filter(p => (p.recLangs || []).includes(LANG)));
  const rest = byPhotoFirst(PLACES.filter(p => !(p.recLangs || []).includes(LANG)));
  return [...rec, ...rest].slice(0, n);
}

/* 사진이 없는 장소의 대체 이미지 — 카테고리별 색을 달리해 밋밋함을 줄인다.
   (사진이 없다고 숨기지 않는다. 주소·좌표·뱃지는 그대로 쓸모가 있기 때문) */
const CAT_FALLBACK = {
  restaurant: 'linear-gradient(150deg,#fde8d6,#fbd9bd)',
  cafe:       'linear-gradient(150deg,#efe9fb,#e2d8f7)',
  attraction: 'linear-gradient(150deg,#e6f0fb,#d3e4f7)',
  nature:     'linear-gradient(150deg,#e8f3e4,#d6ebd0)',
  shopping:   'linear-gradient(150deg,#fde6e0,#fbd5cb)',
};

function cardHTML(p, i){
  const hasImg = !!p.img;
  const bg = hasImg
    ? `background-image:url('${esc(p.img)}');background-size:cover;background-position:center;`
    : `background:${CAT_FALLBACK[p.category] || CAT_FALLBACK.attraction};`;
  const face = hasImg ? '' : `<span style="font-size:44px;opacity:.5">${p.emoji}</span>`;
  const tag  = p.local ? '<span class="cu-ctag local">Local Favorite</span>' : '';
  // 카드는 "이름 + 사진 + 구조화된 정보"만. 긴 설명·메뉴 나열은 상세 페이지로 넘긴다.
  const icons = iconsFor(p).slice(0, 4).map(ico).join('');
  return `<div class="cu-card" data-place="${esc(p.id)}" data-pos="${(i || 0) + 1}">
    <div class="cu-cimg" style="${bg}">${face}${tag}<span class="cu-heart">♡</span></div>
    <div class="cu-cbody">
      <div class="cu-cname">${esc(pf(p,'name'))}</div>
      ${p.ko ? `<div class="cu-cko">${esc(p.ko)}</div>` : ''}
      <div class="cu-icons" style="display:flex;flex-wrap:wrap;gap:5px">${icons}</div>
      <div class="cu-cfoot"><span>${esc(areaLabel(p.area))}</span></div>
    </div></div>`;
}

/* 정렬: 사진 있는 곳을 앞으로 (숨기지 않고 순서만 조정) */
function byPhotoFirst(list){
  return [...list].sort((a, b) => (b.img ? 1 : 0) - (a.img ? 1 : 0));
}

function renderExplore(list, q){
  // 사진 있는 곳을 앞에 (숨기지는 않음 — 사진 없어도 주소·지도·뱃지는 유용하다)
  const sorted = byPhotoFirst(list);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (curPage > pages) curPage = pages;
  const from = (curPage - 1) * PAGE_SIZE;
  const shown = sorted.slice(from, from + PAGE_SIZE);

  if (mapView){ renderMap(sorted); }

  const isFiltered = !!curQuery || curArea !== 'all' || curCat !== 'all';
  setHTML('explore-grid',
    shown.map((p, i) => cardHTML(p, from + i)).join('') || (isFiltered ? emptyFiltered() : empty()));

  setText('explore-count', q
    ? t('n_results').replace('{n}', list.length).replace('{q}', q)
    : t('n_places').replace('{n}', list.length));

  // 페이지 버튼 — 자리가 없으면 그리드 뒤에 만들어 붙인다
  let more = document.getElementById('cu-more');
  if (!more){
    const grid = document.getElementById('explore-grid');
    more = document.createElement('div');
    more.id = 'cu-more';
    more.className = 'cu-more';
    grid.parentNode.insertBefore(more, grid.nextSibling);
  }
  more.innerHTML = pages > 1 ? pagerHTML(pages) : '';
}

/* 페이지 버튼 — 현재 쪽 주변만 보여줘서 버튼이 길어지지 않게 한다 */
function pagerHTML(pages){
  const btn = (label, page, cls = '') =>
    `<button class="cu-page ${cls}" ${page ? `data-page="${page}"` : 'disabled'}>${label}</button>`;

  const nums = [];
  const around = 1;                        // 현재 쪽 좌우로 몇 개까지
  for (let i = 1; i <= pages; i++){
    if (i === 1 || i === pages || Math.abs(i - curPage) <= around) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }

  return `<div class="cu-pager">
    ${btn('‹', curPage > 1 ? curPage - 1 : 0)}
    ${nums.map(n => n === '…'
        ? '<span class="cu-page-dots">…</span>'
        : btn(n, n, n === curPage ? 'on' : '')).join('')}
    ${btn('›', curPage < pages ? curPage + 1 : 0)}
  </div>`;
}

/* 쪽 이동 — 목록 맨 위로 올려서 항상 같은 위치에서 시작하게 한다 */
function goPage(n){
  curPage = n;
  applyFilters(false);
  const bar = document.getElementById('cu-filters') || document.getElementById('explore-grid');
  if (bar) window.scrollTo({ top: bar.offsetTop - 80, behavior: 'smooth' });
  track('page_change', { page: n });
}


/* ── 6.5. 지도 보기 ───────────────────────────────────
   Explore를 목록 대신 지도로 볼 수 있게 한다.
   필터(카테고리·지역·검색·테마)는 그대로 적용되고, 보는 방식만 바뀐다.

   Leaflet + OpenStreetMap을 쓴다. API 키가 필요 없고 무료다.
   좌표가 없는 장소는 지도에 올릴 수 없으므로 몇 곳이 빠졌는지 알려준다. */

let mapView = false;      // false = 목록, true = 지도
let leafletMap = null;
let markerLayer = null;

const CAT_PIN = {
  restaurant: { c:'#ff5a36', e:'🍜' },
  cafe:       { c:'#6d4ec1', e:'☕' },
  attraction: { c:'#2563a8', e:'🏛️' },
  nature:     { c:'#3b7d3b', e:'🏔️' },
  shopping:   { c:'#d2492c', e:'🛍️' },
};

function setView(v){
  mapView = (v === 'map');
  document.querySelectorAll('.cu-vt').forEach(b =>
    b.classList.toggle('act', b.dataset.view === v));

  const grid = $('explore-grid'), map = $('cu-map'),
        more = $('cu-more'), note = $('cu-mapnote'), areas = $('cu-areas');
  if (grid) grid.style.display = mapView ? 'none' : '';
  if (more) more.style.display = mapView ? 'none' : '';
  if (map)  map.style.display  = mapView ? 'block' : 'none';
  if (note) note.style.display = mapView ? 'block' : 'none';
  if (areas) areas.style.display = '';          // 지역 필터는 양쪽에서 쓴다

  track('view_toggle', { view: v });
  if (mapView) applyFilters(false);
}

/* 현재 필터 결과를 지도에 그린다 */
function renderMap(list){
  if (!mapView || typeof L === 'undefined') return;

  const withCoords = list.filter(p => p.lat && p.lng);
  const missing = list.length - withCoords.length;

  // 지도 최초 생성
  if (!leafletMap){
    leafletMap = L.map('cu-map', { scrollWheelZoom: false })
      .setView([35.1379, 129.0556], 12);          // 부산 중심
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(leafletMap);
    // 클릭하면 휠 줌이 켜지도록 — 페이지 스크롤을 방해하지 않기 위함
    leafletMap.on('click', () => leafletMap.scrollWheelZoom.enable());
    leafletMap.on('mouseout', () => leafletMap.scrollWheelZoom.disable());
  }

  if (markerLayer) leafletMap.removeLayer(markerLayer);
  markerLayer = (typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false })
    : L.layerGroup();

  withCoords.forEach(p => {
    const meta = CAT_PIN[p.category] || CAT_PIN.attraction;
    const icon = L.divIcon({
      className: 'cu-pin',
      html: `<span style="--pin:${meta.c}">${meta.e}</span>`,
      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
    });
    const badges = iconsFor(p).slice(0, 3)
      .map(([c, l]) => `<span class="pb pb-${c}">${esc(l)}</span>`).join('');

    L.marker([p.lat, p.lng], { icon })
      .bindPopup(`<div class="cu-pop-in">
        <div class="nm">${esc(pf(p, 'name'))}</div>
        ${p.ko ? `<div class="ko">${esc(p.ko)}</div>` : ''}
        ${badges ? `<div class="bs">${badges}</div>` : ''}
        <a href="#place/${esc(p.id)}">${t('see_details')} →</a>
      </div>`)
      .addTo(markerLayer);
  });

  markerLayer.addTo(leafletMap);

  // 결과가 있으면 그 범위로 화면을 맞춘다
  if (withCoords.length){
    const b = L.latLngBounds(withCoords.map(p => [p.lat, p.lng]));
    leafletMap.fitBounds(b, { padding: [40, 40], maxZoom: 15 });
  }
  setTimeout(() => leafletMap.invalidateSize(), 60);

  // 좌표가 없어 지도에 못 올린 곳을 숨기지 않고 알려준다
  setHTML('cu-mapnote', missing
    ? `<div class="cu-mapnote">${t('map_missing').replace('{n}', missing)}</div>`
    : '');
}

/* ── 7. 화면 전환 (해시 방식) · 검색 ─────────────────
   주소 뒤 #home / #explore 를 바꾸는 방식이라
   브라우저 뒤로가기가 어디서든(file:// 포함) 작동.
   장소는 #place/{id} 형태 → 링크 하나로 특정 가게를 공유할 수 있음 */
function render(v){
  // 측정: 랜딩 방문 (세션당 한 번만)
  if ((v === 'home' || v === '') && !window.__landingSent){
    window.__landingSent = true;
    track('landing_view', {});
  }
  // 장소 딥링크: #place/{id}
  if (v.startsWith('place/')){
    const id = v.slice(6);
    if (!PLACES.length) return;          // 아직 로딩 중이면 로드 후 다시 호출됨
    renderDetail(id);
    return;
  }
  if (!document.getElementById('view-' + v)) v = 'home';
  document.querySelectorAll('.cu-view').forEach(x => x.classList.remove('on'));
  document.getElementById('view-' + v).classList.add('on');
  ['home','explore','about'].forEach(n => document.getElementById('nav-' + n)?.classList.toggle('act', n === v));
  window.scrollTo({ top:0, behavior:'smooth' });
  track('page_view_internal', { view: v });
}

function go(v){
  if (location.hash === '#' + v) render(v);
  else location.hash = v;
}

window.addEventListener('hashchange', () => render(location.hash.slice(1) || 'home'));

function doSearch(source){
  const q = ($('home-search')?.value || '').trim();
  curQuery = q;
  curCat = 'all'; curArea = 'all';
  curTheme = null; curSituation = null;
  document.querySelectorAll('#cu-filters .cu-poptag').forEach((x, i) => x.classList.toggle('act', i === 0));
  applyFilters();

  /* 검색창이 CTA 역할을 겸한다.
     빈 채로 눌렀다 = 헤드라인을 읽고 둘러보러 온 것 → explore_click
     검색어를 넣었다 = 원래 찾던 것이 있는 것       → search
     같은 버튼이지만 행동이 다르므로 이벤트를 나눈다. */
  if (!q && source !== 'popular_tag'){
    track('explore_click', { button_name: 'hero_search_empty', search_source: source || 'button' });
  } else {
    track('search', {
      search_term:   q,
      result_count:  baseList().length,
      search_source: source || 'button'
    });
  }

  go('explore');
}

function clearSearch(){
  { const b = $('home-search'); if (b) b.value = ''; }
  curQuery = ''; curCat = 'all'; curArea = 'all';
  document.querySelectorAll('#cu-filters .cu-poptag').forEach((x, i) => x.classList.toggle('act', i === 0));
  applyFilters();
  go('home');
}

// Explore 카테고리 필터 (all / restaurant / cafe / attraction / shopping)
/* ── Explore 필터 상태 ────────────────────────────────
   카테고리 · 지역 · 검색어가 함께 적용되고,
   결과가 많으면 PAGE_SIZE씩 끊어서 보여준다(더 보기). */
let curCat = 'all', curArea = 'all', curQuery = '', curPage = 1;
const PAGE_SIZE = 30;

/* 지역명 표시 — 외국인이 알아볼 수 있게 대표 지명으로 */
const AREA_LABEL = {
  '해운대구':'Haeundae', '수영구':'Gwangalli', '부산진구':'Seomyeon',
  '중구':'Nampo · Jagalchi', '동구':'Choryang', '서구':'Songdo',
  '남구':'Gwangan · UN Park', '사하구':'Gamcheon · Dadaepo', '영도구':'Yeongdo',
  '금정구':'Geumjeong', '동래구':'Dongnae', '북구':'Buk', '연제구':'Yeonje',
  '사상구':'Sasang', '강서구':'Gangseo', '기장군':'Gijang',
  // DB에 영문·별칭으로 들어간 값도 같은 라벨로 모은다
  'Seomyeon':'Seomyeon', '서면':'Seomyeon',
  'Haeundae':'Haeundae', '해운대':'Haeundae',
  'Gwangalli':'Gwangalli', '광안리':'Gwangalli',
  'Nampo':'Nampo · Jagalchi', '남포동':'Nampo · Jagalchi',
};
const areaLabel = a => AREA_LABEL[a] || a;

function filterCat(cat, el){
  curCat = cat;
  document.querySelectorAll('#cu-filters .cu-poptag').forEach(x => x.classList.remove('act'));
  if (el) el.classList.add('act');
  curArea = 'all';        // 카테고리를 바꾸면 지역은 초기화
  curQuery = '';          // 검색어도 해제 (검색 결과 안에서 또 거르면 0건이 되기 쉽다)
  curTheme = null; curSituation = null;   // 테마·상황 선택도 해제
  const box = document.getElementById('home-search');
  if (box) box.value = '';
  applyFilters();
  track('filter_category', { category: cat });
}

function filterArea(area){
  curArea = area;
  applyFilters();
  track('filter_area', { area });
}

/* 검색어까지 반영한 전체 후보 */
function baseList(){
  if (!curQuery) return PLACES;
  const lower = curQuery.toLowerCase();
  return PLACES.filter(p => [p.name, p.ko, p.cat, p.area, p.city,
      ...Object.values(p.i18n || {}).flatMap(x => x ? [x.name, x.menu] : [])]
      .join(' ').toLowerCase().includes(lower));
}

/* 지역 칩 그리기 — 현재 카테고리에 실제로 있는 지역만, 많은 순으로 */
function renderAreaChips(list){
  // index.html에 자리가 없으면 카테고리 필터 바로 아래에 만들어 붙인다
  let box = document.getElementById('cu-areas');
  if (!box){
    const grid = document.getElementById('explore-grid');
    if (!grid) return;
    box = document.createElement('div');
    box.id = 'cu-areas';
    box.className = 'cu-areas';
    grid.parentNode.insertBefore(box, grid);
  }
  /* 같은 곳인데 DB에 '부산진구'와 'Seomyeon'처럼 다른 값으로 들어가 있으면
     칩이 두 개로 보인다. 표시 라벨 기준으로 묶어 하나로 합친다. */
  const byLabel = {};
  list.forEach(p => {
    if (!p.area) return;
    const label = areaLabel(p.area);
    if (!byLabel[label]) byLabel[label] = { label, n: 0, values: [] };
    byLabel[label].n++;
    if (!byLabel[label].values.includes(p.area)) byLabel[label].values.push(p.area);
  });
  const areas = Object.values(byLabel).sort((a, b) => b.n - a.n);

  if (areas.length <= 1){ box.innerHTML = ''; return; }   // 나눌 게 없으면 숨김

  box.innerHTML =
    `<span class="cu-area${curArea === 'all' ? ' act' : ''}" data-area="all">
       ${t('area_all')}</span>` +
    areas.map(g =>
      `<span class="cu-area${curArea === g.label ? ' act' : ''}" data-area="${esc(g.label)}">
         ${esc(g.label)}</span>`).join('');
}

/* 카테고리 + 지역 + 검색을 모두 적용해 다시 그린다 */
function applyFilters(reset = true){
  if (reset) curPage = 1;

  const base = curationFilter(baseList());          // 테마·코스·상황 먼저 적용
  const byCat = curCat === 'all' ? base : base.filter(p => p.category === curCat);
  renderAreaChips(byCat);

  const list = curArea === 'all' ? byCat : byCat.filter(p => areaLabel(p.area) === curArea);
  renderExplore(list, curQuery || null);
}



/* ── 8. 상세 페이지 ─────────────────────────────────── */
let currentPlace = null, selectedTags = new Set(), editingReviewId = null;

function infoItem(label, val){
  return `<div class="cu-dinfoitem" style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px">
    <div style="font-size:11px;color:var(--faint);margin-bottom:4px">${label}</div>
    <div style="font-size:14px;font-weight:600;color:var(--ink)">${esc(val || '—')}</div></div>`;
}

// 카테고리에 맞는 정보 항목만 표시 (명소에 매운맛 X, 값 없으면 항목 자체를 뺌)
/* Getting there — 지도 + 주소 + 네이버 버튼을 한 덩어리로 */
function gettingThereHTML(p){
  const addr = pf(p, 'address');
  return `<div style="margin-bottom:24px">
    <div class="cu-sec-lb">${t('getting_there')}</div>
    ${mapEmbedHTML(p)}
    ${addr ? `<div style="display:flex;gap:9px;align-items:flex-start;margin:10px 0 12px">
      <span style="font-size:15px">📍</span>
      <div>
        <div style="font-size:13.5px;color:var(--ink);line-height:1.5">${esc(addr)}</div>
        ${p.ko ? `<div style="font-size:12.5px;color:var(--faint);margin-top:2px">${esc(p.ko)}</div>` : ''}
      </div></div>` : ''}
    <a href="${p.mapNaver}" target="_blank" rel="noopener" data-map="${esc(p.id)}"
       style="display:block;text-align:center;background:var(--navy);color:#fff;border-radius:12px;padding:13px;
              font-size:14px;font-weight:600;text-decoration:none">${t('open_naver')}</a>
    <div style="font-size:11.5px;color:var(--faint);text-align:center;margin-top:8px;line-height:1.5">${t('map_note')}</div>
  </div>`;
}


// How-to-Eat 주문표 (food_guide_key 연결 + 가이드에 i18n 있으면 해당 언어로)

/* 알레르기 표준 코드 → 언어별 표시명 */
const ALLERGEN_LABEL = {
  en:  { pork:'Pork', beef:'Beef', chicken:'Chicken', fish:'Fish', shellfish:'Shellfish',
         crustacean:'Shrimp/Crab', egg:'Egg', milk:'Dairy', soy:'Soy', wheat:'Wheat',
         peanut:'Peanut', nuts:'Tree nuts', sesame:'Sesame', buckwheat:'Buckwheat', alcohol:'Alcohol' },
  ja:  { pork:'豚肉', beef:'牛肉', chicken:'鶏肉', fish:'魚', shellfish:'貝類',
         crustacean:'エビ・カニ', egg:'卵', milk:'乳製品', soy:'大豆', wheat:'小麦',
         peanut:'落花生', nuts:'ナッツ', sesame:'ごま', buckwheat:'そば', alcohol:'アルコール' },
  zh:  { pork:'豬肉', beef:'牛肉', chicken:'雞肉', fish:'魚', shellfish:'貝類',
         crustacean:'蝦蟹', egg:'蛋', milk:'乳製品', soy:'大豆', wheat:'小麥',
         peanut:'花生', nuts:'堅果', sesame:'芝麻', buckwheat:'蕎麥', alcohol:'酒精' },
  zhs: { pork:'猪肉', beef:'牛肉', chicken:'鸡肉', fish:'鱼', shellfish:'贝类',
         crustacean:'虾蟹', egg:'蛋', milk:'乳制品', soy:'大豆', wheat:'小麦',
         peanut:'花生', nuts:'坚果', sesame:'芝麻', buckwheat:'荞麦', alcohol:'酒精' },
};

/* 점원에게 보여줄 한국어 문구 — 화면째로 보여주는 용도 */
const ALLERGY_PHRASES = [
  { ko:'저는 음식 알레르기가 있어요.',
    en:'I have a food allergy.', ja:'食物アレルギーがあります。', zh:'我有食物過敏。', zhs:'我有食物过敏。' },
  { ko:'이 음식에 새우나 조개가 들어가나요?',
    en:'Does this contain shrimp or shellfish?', ja:'エビや貝は入っていますか？', zh:'這道菜有蝦或貝類嗎？', zhs:'这道菜有虾或贝类吗？' },
  { ko:'땅콩이나 견과류가 들어가나요?',
    en:'Does this contain peanuts or nuts?', ja:'落花生やナッツは入っていますか？', zh:'這道菜有花生或堅果嗎？', zhs:'这道菜有花生或坚果吗？' },
  { ko:'육수에 멸치나 해산물을 쓰나요?',
    en:'Is the broth made with anchovy or seafood?', ja:'だしに煮干しや魚介を使っていますか？', zh:'湯底有用鯷魚或海鮮嗎？', zhs:'汤底有用鳀鱼或海鲜吗？' },
];

/* 알레르기 안내 — 가게별 보증이 아니라 "이 음식에 흔히 들어가는 것" 안내.
   심각한 알레르기는 반드시 매장에 직접 확인하도록 문구를 함께 표시한다. */
function allergyHTML(p){
  const g = GUIDES[p.foodKey];
  if (!g) return '';
  const list = g.common_allergens || [];
  if (!list.length && !g.allergen_note) return '';

  const labels = ALLERGEN_LABEL[LANG] || ALLERGEN_LABEL.en;
  const chips = list.map(code =>
    `<span style="display:inline-block;background:var(--a-bg);color:var(--a-fg);border-radius:99px;
      padding:5px 11px;font-size:12.5px;font-weight:600;margin:0 6px 6px 0">${esc(labels[code] || code)}</span>`
  ).join('');

  const phrases = ALLERGY_PHRASES.map(ph => `
    <div style="padding:9px 0;border-top:1px dashed var(--line)">
      <div style="font-size:14px;color:var(--ink);font-weight:600">${esc(ph.ko)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(ph[LANG] || ph.en)}</div>
    </div>`).join('');

  return `<div style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:22px">
    <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:9px">${t('allergy_title')}</div>
    ${chips ? `<div style="margin-bottom:8px">${chips}</div>` : ''}
    ${g.allergen_note ? `<div style="font-size:12.5px;color:var(--muted);line-height:1.55;margin-bottom:10px">${esc(g.allergen_note)}</div>` : ''}
    <div style="font-size:11.5px;color:var(--r-fg);background:var(--r-bg);border-radius:8px;padding:8px 10px;line-height:1.5">
      ${t('allergy_warn')}
    </div>
    <details style="margin-top:12px">
      <summary style="font-size:12.5px;font-weight:600;color:var(--navy);cursor:pointer">${t('allergy_ask')}</summary>
      <div style="margin-top:6px">${phrases}</div>
      <div style="font-size:11.5px;color:var(--faint);margin-top:8px">${t('allergy_show')}</div>
    </details>
  </div>`;
}

/* 한식 상식 — 4개 언어. 항목을 늘리려면 각 언어에 같은 개수로 추가할 것 */
const BASICS = {
  en: [
    { icon:'🍽️', title:'Banchan — free side dishes',
      desc:'Small dishes arrive without ordering. They are free, and refills are free too.',
      say:'김치 좀 더 주세요  (More kimchi, please)' },
    { icon:'🍚', title:'Rice may be ordered separately',
      desc:'Soups and rice bowls include rice. At BBQ places you order it yourself (₩1,000–2,000).',
      say:'공기밥 하나 주세요  (One bowl of rice, please)' },
    { icon:'🔔', title:'Press the bell to call staff',
      desc:'Most tables have a call button. No need to raise your hand or wait to be noticed.',
      say:'저기요  (Excuse me)' },
    { icon:'💧', title:'Water is self-service',
      desc:'Cups and a water dispenser are usually near the entrance or in a corner.', say:'' },
    { icon:'🧾', title:'Pay at the counter on your way out',
      desc:'You usually pay at the front desk, not at the table.', say:'계산할게요  (I\'d like to pay)' },
  ],
  ja: [
    { icon:'🍽️', title:'パンチャン（おかず）は無料',
      desc:'注文しなくても小皿が並びます。無料で、おかわりも無料です。',
      say:'김치 좀 더 주세요（キムチをもう少しください）' },
    { icon:'🍚', title:'ごはんは別注文のことも',
      desc:'クッパや丼はごはん込み。焼肉店では別に注文します（1,000〜2,000ウォン）。',
      say:'공기밥 하나 주세요（ごはん一つください）' },
    { icon:'🔔', title:'呼び出しボタンで店員を呼ぶ',
      desc:'テーブルのボタンを押せばOK。手を挙げて待つ必要はありません。',
      say:'저기요（すみません）' },
    { icon:'💧', title:'水はセルフサービス',
      desc:'入口や隅にコップと給水器があります。', say:'' },
    { icon:'🧾', title:'会計は出口のレジで',
      desc:'テーブル会計ではなく、帰るときにレジで払うのが一般的です。',
      say:'계산할게요（お会計お願いします）' },
  ],
  zh: [
    { icon:'🍽️', title:'小菜（반찬）免費',
      desc:'不用點也會上一堆小菜，免費，續加也免費。',
      say:'김치 좀 더 주세요（請再給我一些泡菜）' },
    { icon:'🍚', title:'白飯有時要另外點',
      desc:'湯飯、蓋飯已含白飯；烤肉店要自己加點（約 1,000–2,000 韓元）。',
      say:'공기밥 하나 주세요（請給我一碗飯）' },
    { icon:'🔔', title:'按桌上的鈴叫店員',
      desc:'大部分餐桌都有服務鈴，不必舉手等人注意。',
      say:'저기요（不好意思）' },
    { icon:'💧', title:'水要自己拿',
      desc:'杯子和飲水機通常在門口或角落。', say:'' },
    { icon:'🧾', title:'離開時到櫃檯結帳',
      desc:'通常不是在桌邊結帳，而是走的時候到前台付款。',
      say:'계산할게요（我要結帳）' },
  ],
  zhs: [
    { icon:'🍽️', title:'小菜（반찬）免费',
      desc:'不用点也会上一堆小菜，免费，续加也免费。',
      say:'김치 좀 더 주세요（请再给我一些泡菜）' },
    { icon:'🍚', title:'米饭有时要另外点',
      desc:'汤饭、盖饭已含米饭；烤肉店要自己加点（约 1,000–2,000 韩元）。',
      say:'공기밥 하나 주세요（请给我一碗饭）' },
    { icon:'🔔', title:'按桌上的铃叫店员',
      desc:'大部分餐桌都有服务铃，不必举手等人注意。',
      say:'저기요（不好意思）' },
    { icon:'💧', title:'水要自己拿',
      desc:'杯子和饮水机通常在门口或角落。', say:'' },
    { icon:'🧾', title:'离开时到柜台结账',
      desc:'通常不是在桌边结账，而是走的时候到前台付款。',
      say:'계산할게요（我要结账）' },
  ],
};

/* 난이도 — 여행자가 "이거 시켜도 되나"를 판단하는 기준 */
const LEVEL_META = {
  easy:        { cls:'easy',  icon:'🟢' },
  local:       { cls:'local', icon:'🟡' },
  adventurous: { cls:'adv',   icon:'🟠' },
};

/* How locals eat it — 3단계 아이콘 + 선택 가이드 + 알아둘 점.
   정보 과부하를 막기 위해 선택 가이드는 선택지가 있는 음식에만 나오고,
   각 블록은 한 가지 역할만 한다. */
function slipHTML(p){
  const g = GUIDES[p.foodKey];
  if (!g || !g.steps || !g.steps.length) return '';
  const loc = g.i18n && g.i18n[LANG];
  const title = (loc && loc.title) || g.title_en;
  const tip = (loc && loc.pro_tip) || g.pro_tip;
  const lv = LEVEL_META[g.level];

  const steps = ((loc && loc.steps) || g.steps).map((raw, i) => {
    const d = raw.indexOf('|');
    const head = (d >= 0 ? raw.slice(0, d) : raw).trim();
    const desc = d >= 0 ? raw.slice(d + 1).trim() : '';
    const m = head.match(/^(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)\s*(.*)$/u);
    return `<div class="cu-step">
      <div class="cu-step-no">STEP ${i + 1}</div>
      <div class="cu-step-ic">${m ? m[1] : '•'}</div>
      <div class="cu-step-tt">${esc(m ? m[2] : head)}</div>
      ${desc ? `<div class="cu-step-ds">${esc(desc)}</div>` : ''}
    </div>`;
  }).join('');

  // 선택 가이드 — '아이콘|이름|한글|설명|난이도'
  const vars = (loc && loc.variants) || g.variants || [];
  const variantsHTML = vars.length ? `
    <div class="cu-vars">
      <div class="cu-vars-hd">${t('which_one')}</div>
      <div class="cu-vars-row">
        ${vars.map(v => {
          const [ic, en, ko, ds, lvl] = v.split('|');
          const L = LEVEL_META[lvl] || LEVEL_META.local;
          return `<div class="cu-var">
            <div class="cu-var-ic">${ic || '•'}</div>
            <div class="cu-var-nm">${esc(en || '')}</div>
            ${ko ? `<div class="cu-var-ko">${esc(ko)}</div>` : ''}
            ${ds ? `<div class="cu-var-ds">${esc(ds)}</div>` : ''}
            <div class="cu-lv cu-lv-${L.cls}">${t('lv_' + (lvl || 'local'))}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  return `<div class="cu-slip-wrap" style="margin-bottom:24px">
    <div class="cu-slip-head2">
      <span class="cu-slip-eyebrow">🥢 ${t('slip_eyebrow')}</span>
      <span class="cu-slip-title">${esc(title)}</span>
      <span class="cu-slip-sub">
        ${g.title_ko ? esc(g.title_ko) : ''}
        ${lv ? `<span class="cu-lv cu-lv-${lv.cls}" style="margin-left:6px">${t('lv_' + g.level)}</span>` : ''}
      </span>
    </div>
    ${variantsHTML}
    <div class="cu-steps">${steps}</div>
    ${tip ? `<div class="cu-protip">
      <div class="cu-protip-hd">💡 ${t('protip')}</div>
      <div class="cu-protip-bd">${esc(tip).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
  </div>`;
}

/* 대표 메뉴 — API가 "메뉴명 (영문 설명), 메뉴명 (영문 설명)" 형태로 준다.
   영문 설명 때문에 길어지는 게 정상이라 길이로 거르지 않는다.
   문장형 소개문("This place serves ...")과 작가 크레딧만 제외한다. */
function looksLikeMenu(raw){
  const t = (raw || '').trim();
  if (!t) return false;
  if (/^(restaurant|cafe|shopping|attraction|nature)$/i.test(t)) return false;
  if (/(photograph|written by|words and photos|travel writer)/i.test(t)) return false;
  if (/^(this place|the |it |located|a |an )/i.test(t)) return false;
  if (/[.]\s+[A-Z]/.test(t) || /[.]$/.test(t)) return false;
  return true;
}

/* 괄호 안의 쉼표는 무시하고 쪼갠다.
   "gomjangeo (hagfish (grilled, salted)), maeuntang" → 2개로 분리 */
function splitDishes(raw){
  const out = [];
  let buf = '', depth = 0;
  for (const ch of raw){
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '\n') && depth === 0){ out.push(buf); buf = ''; }
    else buf += ch;
  }
  out.push(buf);
  return out;
}

function dishList(p){
  let raw = pf(p, 'menu');
  if (!looksLikeMenu(raw)) return [];
  // 가격(￦12,000)을 먼저 통째로 제거해야 쉼표 분리 시 "000" 같은 파편이 안 남는다
  raw = raw.replace(/[￦₩][^\S\n]*[\d][\d,\-–~]*(?:[^\S\n]*[\-–~][^\S\n]*[\d,]+)?/g, ' ');
  // "Korean · 낙곱전골" 처럼 앞에 붙은 요리 분류 제거
  raw = raw.replace(/^(Korean|Chinese|Japanese|Western|Snack bar|Cafe)\s*·\s*/i, '');
  return splitDishes(raw)
    .map(x => x.replace(/^[\-•·\s]+|[\s·]+$/g, '').trim())
    .filter(x => x && x.length >= 2 && x.length <= 110 && /[a-zA-Z가-힣]/.test(x))
    .slice(0, 4);
}

function dishesHTML(p){
  if (p.category === 'attraction' || p.category === 'nature') return '';
  const items = dishList(p);
  if (!items.length) return '';
  const cards = items.map(nm => {
    // "Dwaeji gukbap (pork soup with rice)" → 이름은 굵게, 설명은 작게
    const m = nm.match(/^(.+?)\s*\((.+)\)\s*$/);
    const main = m ? m[1].trim() : nm;
    const gloss = m ? m[2].trim() : '';
    return `<div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;max-width:260px">
      <div style="font-size:13.5px;font-weight:600;color:var(--ink);line-height:1.35">${esc(main)}</div>
      ${gloss ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.4">${esc(gloss)}</div>` : ''}
    </div>`;
  }).join('');
  return `<div style="margin-bottom:24px">
    <div class="cu-sec-lb">${t('dishes_title')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${cards}</div>
  </div>`;
}

/* 한식당인지 판별 — 반찬·공기밥 문화는 한식당에만 해당.
   부산 데이터는 한식이 대부분이라, 명확한 외국 음식만 제외하는 방식이 정확하다.
   (돈까스·우동은 한국에선 반찬이 함께 나오므로 한식으로 취급) */
function isKoreanFood(p){
  if (p.category !== 'restaurant') return false;
  const text = ((p.ko || '') + ' ' + (p.cat || '') + ' ' + (p.name || '')).toLowerCase();
  const foreign = [
    '파스타','피자','스테이크','버거','햄버거','타코','브런치','스테이크',
    '스시','초밥','사시미','라멘','이자카야','규동',
    '짜장','짬뽕','마라','훠궈','딤섬','양꼬치','중화',
    '쌀국수','반미','팟타이','커리','카레','케밥','타이','베트남',
    'pasta','pizza','sushi','ramen','burger','taco','steak','curry','kebab','pho',
  ];
  return !foreign.some(w => text.includes(w));
}

/* 한식 상식 카드 — 한국인에겐 당연해서 아무도 안 알려주는 것들.
   접어두고 필요한 사람만 펼쳐보게 한다. */
function basicsHTML(p){
  if (!isKoreanFood(p)) return '';
  const items = BASICS[LANG] || BASICS.en;
  const rows = items.map(it => `
    <div style="display:flex;gap:11px;padding:11px 0;border-top:1px dashed var(--line)">
      <div style="font-size:19px;line-height:1.2;flex-shrink:0">${it.icon}</div>
      <div>
        <div style="font-size:13.5px;font-weight:600;color:var(--ink)">${esc(it.title)}</div>
        <div style="font-size:12.5px;color:var(--muted);line-height:1.5;margin-top:2px">${esc(it.desc)}</div>
        ${it.say ? `<div style="font-size:12.5px;color:var(--navy);font-weight:600;margin-top:4px">「${esc(it.say)}」</div>` : ''}
      </div>
    </div>`).join('');

  return `<details style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:22px">
    <summary style="font-size:13px;font-weight:700;color:var(--ink);cursor:pointer;list-style:none">
      🥢 ${t('basics_title')}
      <span style="float:right;color:var(--faint);font-weight:400;font-size:12px">${t('basics_open')}</span>
    </summary>
    <div style="margin-top:4px">${rows}</div>
  </details>`;
}

// OSM 미니 지도 (좌표 있는 장소만) — API 키 불필요, 무료
function mapEmbedHTML(p){
  if (!p.lat || !p.lng) return '';
  const d = 0.004;   // 표시 범위 (작을수록 확대)
  const bbox = [p.lng - d, p.lat - d/2, p.lng + d, p.lat + d/2].join(',');
  return `<iframe
    src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat},${p.lng}"
    style="width:100%;height:220px;border:1px solid var(--line);border-radius:14px;margin-bottom:10px"
    loading="lazy" title="Map"></iframe>`;
}

/* 장소 열기 = 주소를 #place/{id}로 바꾼다 (공유 가능한 링크가 됨) */
function openDetail(id, position){
  const p = PLACES.find(x => x.id === id);
  // 측정: 장소 카드 클릭 — 어떤 장소를 몇 번째 자리에서 눌렀는지
  track('place_click', {
    place_id: id,
    place_name: p ? p.name : '',
    category: p ? p.category : '',
    position: position || 0
  });
  if (location.hash === '#place/' + id) renderDetail(id);
  else location.hash = 'place/' + id;
}

/* 현재 장소의 공유 링크 */
function placeURL(id){
  return location.origin + location.pathname + '#place/' + id;
}

/* 공유 — 모바일이면 네이티브 공유 시트(카톡·라인·인스타 등), PC면 링크 복사 */
async function sharePlace(id){
  const p = PLACES.find(x => x.id === id); if (!p) return;
  const url = placeURL(id);
  const title = pf(p, 'name');
  const text = `${title} · UsCourse`;
  track('share', { place_id: id });

  if (navigator.share){
    try { await navigator.share({ title, text, url }); return; } catch(e){ /* 취소 시 무시 */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    const b = document.getElementById('share-btn');
    if (b){ const old = b.textContent; b.textContent = t('share_done');
            setTimeout(() => b.textContent = old, 1600); }
  } catch(e){ prompt(t('share_copy'), url); }
}

function renderDetail(id){
  const p = PLACES.find(x => x.id === id); if (!p) return;
  const samePlace = currentPlace && currentPlace.id === id;
  currentPlace = p;
  if (!samePlace){ selectedTags = new Set(); editingReviewId = null; }
  track('place_view', { place_id:id, place_name:p.name });

  const bg = p.img
    ? `background-image:url('${esc(p.img)}');background-size:cover;background-position:center;`
    : `background:${CAT_FALLBACK[p.category] || CAT_FALLBACK.attraction};`;
  setHTML('detail-body', `
    <span class="cu-back" onclick="go('explore')" style="cursor:pointer;font-size:14px;font-weight:600;color:var(--muted)">${t('back_explore')}</span>
    <div class="cu-dimg" style="${bg}margin:14px 0;border-radius:18px;min-height:180px;display:flex;align-items:center;justify-content:center;position:relative">
      ${p.img ? '' : `<span style="font-size:64px;opacity:.5">${p.emoji}</span>`}${p.local ? '<span class="cu-ctag local" style="position:absolute;top:12px;left:12px">Local Favorite</span>' : ''}
    </div>
    <div class="cu-dname" style="font-size:26px;font-weight:800;color:var(--ink)">${esc(pf(p,'name'))}</div>
    ${p.ko ? `<div class="cu-dko" style="font-size:15px;color:var(--muted);margin-top:2px">${esc(p.ko)}</div>` : ''}
    <div class="cu-dmeta" style="font-size:13px;color:var(--faint);margin:6px 0 12px">${esc(areaLabel(p.area))}${p.city && p.city !== 'Busan' ? ' · ' + esc(p.city) : ' · Busan'}</div>
    <div class="cu-dbadges" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px">${iconsFor(p).map(ico).join('')}</div>

    ${dishesHTML(p)}
    ${(p.category === 'restaurant' || p.category === 'cafe') ? slipHTML(p) : ''}
    ${basicsHTML(p)}
    ${(p.category === 'restaurant' || p.category === 'cafe') ? allergyHTML(p) : ''}
    ${gettingThereHTML(p)}

    <div class="cu-revs">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:18px;font-weight:700;color:var(--ink)">${t('reviews_title')} <span id="rev-count" style="color:var(--faint);font-weight:400">…</span></span>
        <button onclick="toggleForm()" style="background:#fff;border:1px solid var(--line);border-radius:99px;padding:8px 15px;font-size:13px;font-weight:600;cursor:pointer;color:var(--ink)">${t('write_review')}</button>
      </div>
      <div id="tag-summary"></div>
      <div id="wform" style="display:none">${formHTML()}</div>
      <div id="rev-list" style="color:var(--muted);font-size:13px">${t('loading_reviews')}</div>
    </div>

    <div style="border-top:1px solid var(--line);margin-top:26px;padding-top:18px;text-align:center">
      <button id="share-btn" data-share="${esc(p.id)}"
        style="background:#fff;border:1px solid var(--line);border-radius:99px;padding:11px 22px;
               font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;font-family:inherit">
        ${t('share_btn')}
      </button>
    </div>`);

  // 화면 전환 (해시는 이미 #place/{id})
  document.querySelectorAll('.cu-view').forEach(x => x.classList.remove('on'));
  $('view-detail')?.classList.add('on');
  ['home','explore','about'].forEach(n => document.getElementById('nav-' + n)?.classList.remove('act'));
  window.scrollTo({ top:0, behavior:'smooth' });
  // 측정: 상세페이지 진입 — 카드가 관심을 만들었는지
  track('detail_view', { place_id: p.id, place_name: p.name, category: p.category });

  loadReviews(p.id);
}


/* ── 9. 리뷰 ────────────────────────────────────────── */
// 태그는 DB 저장값이라 언어 불문 동일 유지 (언어별로 나누면 집계가 깨짐)
const REVIEW_TAGS = ['🚪 Walked right in','✅ Easy to order','💳 Card worked','😮 Better than expected',
                     '🔄 Going back','🗣️ Staff spoke English','🤝 Foreigner friendly','📸 Instagrammable'];

function formHTML(){
  const chips = REVIEW_TAGS.map(tg =>
    `<span class="cu-rvtag" data-t="${esc(tg)}" onclick="toggleTag(this)"
       style="cursor:pointer;border:1px solid var(--line);border-radius:99px;padding:6px 12px;font-size:12px;background:#fff">${tg}</span>`).join('');
  return `<div class="cu-wform" style="border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px;background:#fff">
    <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--ink)">${t('how_was')} <span style="color:var(--faint);font-weight:400">${t('tap_tags')}</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
    <textarea id="rv-comment" maxlength="500" placeholder="${esc(t('comment_ph'))}"
      style="width:100%;margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:13px;min-height:70px;resize:vertical"></textarea>
    <input id="rv-country" maxlength="30" placeholder="${esc(t('country_ph'))}"
      style="width:100%;margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:13px">
    <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
      <button id="rv-submit" onclick="submitReview()"
        style="background:var(--navy);color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer">${t('post_review')}</button>
      <span id="rv-msg" style="font-size:12px;color:var(--accent)"></span>
    </div>
    <div style="font-size:11px;color:var(--faint);margin-top:8px">${t('anon_note')}</div>
  </div>`;
}

function toggleForm(){
  const f = document.getElementById('wform');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}
function toggleTag(el){
  const tg = el.dataset.t;
  if (selectedTags.has(tg)){ selectedTags.delete(tg); el.style.background = '#fff'; el.style.borderColor = 'var(--line)'; }
  else { selectedTags.add(tg); el.style.background = 'var(--a-bg)'; el.style.borderColor = 'var(--a-fg)'; }
}
function rvMsg(s){ const m = document.getElementById('rv-msg'); if (m) m.textContent = s; }

async function loadReviews(placeId){
  if (!sb){ setText('rev-list', t('connect_sb')); return; }
  const { data, error } = await sb.from('reviews_public').select('*')
    .eq('place_id', placeId).order('created_at', { ascending:false });
  const box = document.getElementById('rev-list');
  const cnt = document.getElementById('rev-count');
  const sum = document.getElementById('tag-summary');
  if (error){ console.error(error); box.textContent = t('msg_fail'); return; }

  if (cnt) cnt.textContent = `(${(data || []).length})`;

  // 홈의 "Traveler reviews" 총계도 함께 갱신 (리뷰 작성·삭제 직후 반영되도록)
  sb.from('reviews_public').select('*', { count:'exact', head:true })
    .then(({ count }) => {
      const el = document.getElementById('stat-reviews');
      if (el) el.textContent = count || 0;
    });

  if (!data || !data.length){
    if (sum) sum.innerHTML = '';
    box.innerHTML = `<div style="padding:16px 0">${t('no_reviews')}</div>`;
    return;
  }

  // "Most mentioned" 태그 통계 (상위 5개)
  const tagCount = {};
  data.forEach(r => (r.tags || []).forEach(tg => tagCount[tg] = (tagCount[tg] || 0) + 1));
  const top = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (sum) sum.innerHTML = top.length
    ? `<div class="cu-mostment">${t('most_mentioned')}</div>
       <div class="cu-tagsummary">
         ${top.map(([tg, n]) => `<span class="cu-stag">${esc(tg)} <b>· ${n}</b></span>`).join('')}
       </div>`
    : '';

  const mine = new Set(myReviewIds()), reported = new Set(reportedIds());
  box.innerHTML = data.map(r => {
    const isMine = mine.has(idStr(r.id));
    const tags = (r.tags || []).map(tg =>
      `<span class="cu-rvtag" style="background:var(--line2);border-radius:99px;padding:4px 10px;font-size:12px">${esc(tg)}</span>`).join('');
    const btns = isMine
      ? `<button data-rev-edit="${esc(r.id)}" style="border:none;background:none;color:var(--muted);font-size:12px;cursor:pointer">${t('edit')}</button>
         <button data-rev-del="${esc(r.id)}" style="border:none;background:none;color:var(--r-fg);font-size:12px;cursor:pointer">${t('del')}</button>`
      : (reported.has(idStr(r.id))
          ? `<span style="color:var(--faint);font-size:12px">${t('reported')}</span>`
          : `<button data-rev-report="${esc(r.id)}" style="border:none;background:none;color:var(--faint);font-size:12px;cursor:pointer">${t('report')}</button>`);
    return `<div class="cu-revitem" style="border-top:1px solid var(--line2);padding:14px 0">
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">${tags}</div>
      ${r.comment ? `<div class="cu-rvcomment" style="font-size:14px;line-height:1.6;color:var(--text)">${esc(r.comment)}</div>` : ''}
      <div class="cu-rvmeta" style="display:flex;gap:10px;align-items:center;font-size:12px;color:var(--faint);margin-top:6px">
        ${r.country ? `<span>${t('from')} ${esc(r.country)}</span><span>·</span>` : ''}<span>${timeAgo(r.created_at)}</span>
        ${isMine ? `<span>·</span><b style="color:var(--navy)">${t('you')}</b>` : ''}
        <span style="margin-left:auto;display:flex;gap:10px">${btns}</span>
      </div></div>`;
  }).join('');
}

async function submitReview(){
  if (!sb) return rvMsg(t('connect_sb'));
  const comment = ($('rv-comment')?.value || '').trim();
  const country = ($('rv-country')?.value || '').trim();
  const tags = [...selectedTags];
  if (!tags.length && !comment) return rvMsg(t('msg_pick'));

  // 링크 스팸 필터: URL 2개 이상 차단
  if ((comment.match(/https?:\/\//gi) || []).length >= 2) return rvMsg(t('msg_links'));

  const btn = document.getElementById('rv-submit');
  btn.disabled = true; rvMsg(t('msg_posting'));
  try {
    if (editingReviewId){
      // 수정: 원본 토큰 제시 → 서버가 해시 대조
      const { data, error } = await sb.rpc('update_review',
        { p_id:editingReviewId, p_token:myToken(), p_tags:tags, p_comment:comment, p_country:country });
      if (error || data === false) throw error || new Error('not allowed');
      track('review_edit', { place_id:currentPlace.id });
    } else {
      // 작성: 토큰의 해시만 전송
      const tokenHash = await sha256(myToken());
      const { data, error } = await sb.rpc('add_review',
        { p_place_id:currentPlace.id, p_tags:tags, p_comment:comment, p_country:country, p_token_hash:tokenHash });
      if (error) throw error;
      if (data) addMyReview(data);
      track('review_post', { place_id:currentPlace.id });
    }
    editingReviewId = null; selectedTags = new Set();
    { const c = $('rv-comment'); if (c) c.value = '';
      const y = $('rv-country'); if (y) y.value = ''; }
    document.getElementById('wform').style.display = 'none';
    loadReviews(currentPlace.id);
  } catch(e){
    console.error(e);
    rvMsg(String(e.message || '').includes('rate') ? t('msg_rate') : t('msg_fail'));
  } finally { btn.disabled = false; }
}

function startEdit(id){
  editingReviewId = id;
  const f = document.getElementById('wform');
  f.style.display = 'block'; f.scrollIntoView({ behavior:'smooth', block:'center' });
  rvMsg(t('edit_hint'));
}

async function deleteReview(id){
  if (!confirm(t('confirm_delete'))) return;
  const { data, error } = await sb.rpc('delete_review', { p_id:id, p_token:myToken() });
  if (error || data === false){ alert(t('msg_fail')); return; }
  removeMyReview(id);
  track('review_delete', { place_id:currentPlace.id });
  loadReviews(currentPlace.id);
}

async function reportReview(id){
  if (reportedIds().includes(id)) return;
  if (!confirm(t('confirm_report'))) return;
  const { error } = await sb.rpc('report_review', { p_id:id });
  if (error){ console.error(error); return; }
  addReported(id);
  track('review_report', {});
  loadReviews(currentPlace.id);
}


/* ── 10. 여행자 후기 (홈 하단) ──────────────────────── */
async function loadTestimonials(){
  if (!sb) return;
  const { data } = await sb.from('reviews_public').select('*')
    .not('comment', 'is', null).order('created_at', { ascending:false }).limit(3);
  if (!data || !data.length) return;
  const nameOf = id => { const p = PLACES.find(x => x.id === id); return p ? pf(p, 'name') : ''; };
  document.getElementById('testgrid').innerHTML = data.map(r => `
    <div class="cu-test" style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px">
      <div style="font-size:14px;line-height:1.6;color:var(--text)">"${esc(r.comment)}"</div>
      <div style="font-size:12px;color:var(--faint);margin-top:10px">
        ${r.country ? esc(r.country) + ' · ' : ''}${esc(nameOf(r.place_id))} · ${timeAgo(r.created_at)}
      </div></div>`).join('');
  document.getElementById('cu-tests').style.display = 'block';
}


/* ── 11. 법적 고지 모달 (법적 문서 — 한국어 유지) ───── */
const MODALS = {
  privacy: `
    <h3 style="margin-bottom:12px">개인정보 처리방침</h3>
    <p style="font-size:13px;line-height:1.8;color:var(--text)">
    UsCourse는 회원가입 없이 이용하는 서비스로, 최소한의 정보만 처리합니다.<br><br>
    <b>1. 수집 항목</b> — 리뷰 작성 시 이용자가 입력한 태그·코멘트·출신 국가(선택), 그리고 본인 리뷰 수정·삭제 확인을 위한 브라우저 생성 토큰의 해시값. 이름, 이메일, 전화번호 등 개인 식별 정보는 수집하지 않습니다.<br><br>
    <b>2. 이용 목적</b> — 리뷰 표시, 본인 리뷰의 수정·삭제 처리, 스팸·악용 방지.<br><br>
    <b>3. 보관 기간</b> — 리뷰는 이용자가 삭제하거나 운영자가 정책 위반으로 삭제할 때까지 보관됩니다.<br><br>
    <b>4. 제3자 제공</b> — 개인정보를 제3자에게 제공하지 않습니다. 다만 서비스 운영을 위해 Supabase(데이터 보관), Google Analytics(익명 방문 통계)를 이용합니다.<br><br>
    <b>5. 이용자 권리</b> — 리뷰 작성에 사용한 브라우저에서 직접 리뷰를 수정·삭제할 수 있습니다. 기타 삭제 요청은 아래 연락처로 문의해 주세요.<br><br>
    <b>문의</b> — [운영자 이메일 주소를 입력하세요]</p>`,
  terms: `
    <h3 style="margin-bottom:12px">이용약관</h3>
    <p style="font-size:13px;line-height:1.8;color:var(--text)">
    <b>1. 서비스 성격</b> — UsCourse가 제공하는 장소 정보(영업시간, 결제수단, 메뉴 등)는 참고용이며, 실제와 다를 수 있습니다. 방문 전 확인을 권장하며, 정보의 정확성에 대해 법적 책임을 지지 않습니다.<br><br>
    <b>2. 리뷰 이용 규칙</b> — 욕설·비방, 허위 사실, 광고·홍보, 개인정보 노출, 저작권 침해 콘텐츠는 금지되며 사전 통보 없이 삭제될 수 있습니다.<br><br>
    <b>3. 신고 및 숨김</b> — 리뷰가 일정 횟수 이상 신고되면 자동으로 숨김 처리되며, 운영자 검토 후 복구 또는 삭제됩니다.<br><br>
    <b>4. 게시물 권리</b> — 이용자가 작성한 리뷰의 저작권은 작성자에게 있으며, 서비스 내 표시 목적으로 이용될 수 있습니다.</p>`,
  data: `
    <h3 style="margin-bottom:12px">데이터 출처</h3>
    <p style="font-size:13px;line-height:1.8;color:var(--text)">
    UsCourse의 장소 기본 정보는 아래 공공데이터를 활용해 구축되었습니다.<br><br>
    · 한국관광공사 TourAPI (한국관광공사 제공)<br>
    · 지방행정 인허가데이터 LOCALDATA (행정안전부 제공)<br>
    · 부산광역시·부산관광공사 부산맛집정보 서비스 (공공데이터포털, 장소 정보·이미지 포함)<br>
    · 지도: © OpenStreetMap contributors (ODbL)<br><br>
    본 저작물은 공공누리 출처표시 조건에 따라 이용하고 있으며, 원 데이터는 각 기관의 사정에 따라 변경될 수 있습니다. 혼밥 가능 여부, 매운맛 정도, 외국 카드 결제 등의 부가 정보는 운영자 큐레이션 및 여행자 리뷰를 바탕으로 합니다.</p>`
};
function openModal(k){
  document.getElementById('modal-content').innerHTML = MODALS[k] || '';
  document.getElementById('modal').classList.add('on');
  track('modal_open', { kind:k });
}
function closeModal(){ document.getElementById('modal').classList.remove('on'); }


/* ── 11.5. 이벤트 위임 ────────────────────────────────
   HTML 문자열에 onclick="fn('값')" 을 끼워 넣으면
   값에 따옴표가 들어갈 때 코드가 깨지거나 주입될 수 있다.
   그래서 data-* 속성에 값을 담고(이스케이프됨), 클릭은 여기서 한 번에 받는다. */
document.addEventListener('click', (e) => {
  const hit = sel => e.target.closest(sel);
  let el;

  if ((el = hit('[data-place]'))){
    openDetail(el.dataset.place, Number(el.dataset.pos) || 0);
  } else if ((el = hit('[data-map]'))){
    const p = PLACES.find(x => x.id === el.dataset.map);
    if (p) track('map_click', {
      place_id: p.id, place_name: p.name, category: p.category, map_type: 'naver'
    });
    // 링크 기본 동작(새 탭 열기)은 막지 않는다
  } else if ((el = hit('[data-share]'))){
    sharePlace(el.dataset.share);
  } else if ((el = hit('[data-area]'))){
    filterArea(el.dataset.area);
  } else if ((el = hit('[data-theme]'))){
    pickTheme(el.dataset.theme);
  } else if ((el = hit('[data-situation]'))){
    pickSituation(el.dataset.situation);
  } else if ((el = hit('[data-course]'))){
    openCourse(el.dataset.course);
  } else if ((el = hit('[data-lang]'))){
    setLang(el.dataset.lang);
  } else if ((el = hit('[data-rev-edit]'))){
    startEdit(el.dataset.revEdit);
  } else if ((el = hit('[data-rev-del]'))){
    deleteReview(el.dataset.revDel);
  } else if ((el = hit('[data-rev-report]'))){
    reportReview(el.dataset.revReport);
  } else if ((el = hit('[data-page]'))){
    goPage(Number(el.dataset.page));
  } else if ((el = hit('.cu-vt'))){
    setView(el.dataset.view);
  }
});


/* ── 12. 시작 ───────────────────────────────────────── */
applyLang();                                // 저장된 언어로 UI 초기화 (히어로 A/B 포함)
render(location.hash.slice(1) || 'home');   // 현재 해시에 맞는 화면 표시
loadGuides().then(loadPlaces);              // 가이드 → 장소 순서로 로드