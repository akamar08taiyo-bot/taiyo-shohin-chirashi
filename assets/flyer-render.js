// データ駆動チラシレンダラー。data/pages.json（ページ構成）と data/products.json（掲載商品）から
// A4ページ（794x1123px）を組み立てる。1ファイルにHTMLを増殖させないための共通部品。
// 参照: design_handoff_flier/README.md §5-6（デザイントークン・ページ構成の実測値）

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const TSS_SHOW_CODES_KEY = 'tss_chirashi_showCodes_v1';
const TSS_SHOW_PRICE_KEY = 'tss_chirashi_showPrice_v1';

function tssLoadBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === '1';
}
function tssSaveBool(key, val) {
  localStorage.setItem(key, val ? '1' : '0');
}

async function renderFlyer(flyerKey, mountId) {
  const [pagesData, productsData, priceRows] = await Promise.all([
    fetch('./data/pages.json').then(r => r.json()),
    fetch('./data/products.json').then(r => r.json()),
    fetch('./data/price-rows.json').then(r => r.json()),
  ]);

  const flyer = pagesData.flyers.find(f => f.key === flyerKey);
  if (!flyer) {
    document.getElementById(mountId).textContent = 'チラシデータが見つかりません: ' + flyerKey;
    return;
  }

  const priceByCode = new Map(priceRows.map(r => [r.code, r]));
  const { prices: savedPrices, qtys: savedQtys } = tssLoadPrices();

  // 商品を flier+page でグループ化（掲載順を保持）
  const itemsByPage = new Map();
  for (const item of productsData.items) {
    if (item.flier !== flyer.name) continue;
    const arr = itemsByPage.get(item.page) || [];
    arr.push(item);
    itemsByPage.set(item.page, arr);
  }

  let showCodes = tssLoadBool(TSS_SHOW_CODES_KEY, true);
  let showPrice = tssLoadBool(TSS_SHOW_PRICE_KEY, false);

  const mount = document.getElementById(mountId);

  function cardHTML(item, idx, tokens) {
    const priceRow = priceByCode.get(item.code);
    let priceHTML = '';
    if (showPrice && priceRow) {
      const priceInput = tssNum(savedPrices[item.code]);
      const qty = savedQtys[item.code] != null ? tssNum(savedQtys[item.code]) : priceRow.baseQty;
      const unit = tssCalcUnitPrice(priceInput, qty, priceRow.kind);
      priceHTML = `<div class="tss-card-price"><span class="amount">${priceInput != null ? '￥' + Math.round(priceInput).toLocaleString('ja-JP') : '￥　　　　'}</span><span class="unit">${escapeHTML(tssUnitLabel(priceRow.kind))} ${unit != null ? tssFmtYen(unit) : '￥　　'}</span></div>`;
    }
    const nameLines = escapeHTML(item.name).replace(/\s*[／･・]\s*$/, '');
    return `
      <article class="tss-card">
        <div class="tss-card-photo" style="height:${tokens.photoHeight}px">
          <img src="./images/${item.image.replace(/^\.\/images\//, '')}" alt="${escapeHTML(item.name)}" loading="lazy" />
        </div>
        <div class="tss-card-body">
          <div class="tss-card-maker">${escapeHTML(item.maker)}</div>
          <h2 class="tss-card-name" style="min-height:${tokens.cardTitleMinHeight}px;font-size:${tokens.cardTitleFontSize}px">${nameLines}</h2>
          <div class="tss-card-tags">
            <span class="tss-tag-spec">${escapeHTML(item.spec)}</span>
            <span class="tss-tag-cat">${escapeHTML(item.tag)}</span>
          </div>
          <p class="tss-card-desc" style="min-height:${tokens.descMinHeight}px;font-size:${tokens.descFontSize}px">${escapeHTML(item.desc)}</p>
          ${showCodes ? `<div class="tss-card-code">${escapeHTML(item.code)}</div>` : ''}
          ${priceHTML}
        </div>
      </article>`;
  }

  function pageHTML(page, tokens, pageIndex) {
    const items = itemsByPage.get(page.pageKey) || [];
    const titleHTML = page.subtitle
      ? `${escapeHTML(page.title)}<br /><span class="tss-subtitle">${escapeHTML(page.subtitle)}</span>`
      : escapeHTML(page.title);
    const sizeBoxHTML = page.sizeBoxTitle
      ? `<div class="tss-sizebox">
           <div class="tss-sizebox-title">${escapeHTML(page.sizeBoxTitle)}</div>
           <div class="tss-sizebox-body">${escapeHTML(page.sizeBoxBody)}</div>
         </div>`
      : '';
    return `
    <section class="page" id="tss-page-${pageIndex}" data-page-label="${escapeHTML(page.pageKey)}">
      <header class="tss-page-header">
        <div class="tss-band">
          <div class="tss-band-label">${escapeHTML(page.categoryLabel)}</div>
          <div class="tss-band-rule"></div>
          <div class="tss-band-aud">施設・病院・事業所さま向け</div>
        </div>
        <div class="tss-title-row">
          <h1>${titleHTML}</h1>
          <p class="tss-lead">${escapeHTML(page.lead)}</p>
        </div>
      </header>
      <div class="tss-grid">
        ${items.map((it, i) => cardHTML(it, i, tokens)).join('')}
      </div>
      ${sizeBoxHTML}
      <p class="tss-note">${escapeHTML(page.note)}</p>
      <footer class="tss-footer">
        <div class="tss-footer-left">
          <div class="tss-footer-office">太陽シルバーサービス㈱　行橋営業所</div>
          <div class="tss-footer-addr">福岡県行橋市大字流末1327番地</div>
          <div class="tss-footer-tel"><span>TEL 0930-26-9640</span><span>FAX 0930-26-9641</span></div>
          <div class="tss-footer-contact">
            <div class="tss-footer-contact-item"><span class="tss-footer-contact-label">担当</span><span class="tss-footer-contact-name">久保</span></div>
            <div class="tss-footer-contact-item"><span class="tss-footer-contact-label">携帯</span><span class="tss-footer-contact-mobile">080-9151-0294</span></div>
          </div>
        </div>
      </footer>
    </section>`;
  }

  function renderAll() {
    mount.innerHTML = flyer.pages.map((p, i) => pageHTML(p, flyer.tokens, i)).join('');
  }

  renderAll();

  // ツールバー・ページジャンプの配線
  const codesToggle = document.getElementById('tss-toggle-codes');
  const priceToggle = document.getElementById('tss-toggle-price');
  if (codesToggle) {
    codesToggle.checked = showCodes;
    codesToggle.addEventListener('change', () => {
      showCodes = codesToggle.checked;
      tssSaveBool(TSS_SHOW_CODES_KEY, showCodes);
      renderAll();
    });
  }
  if (priceToggle) {
    priceToggle.checked = showPrice;
    priceToggle.addEventListener('change', () => {
      showPrice = priceToggle.checked;
      tssSaveBool(TSS_SHOW_PRICE_KEY, showPrice);
      renderAll();
    });
  }

  const printBtn = document.getElementById('tss-print-btn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const jumpNav = document.getElementById('tss-pagejump');
  if (jumpNav) {
    jumpNav.innerHTML = flyer.pages.map((p, i) => `<a href="#tss-page-${i}">${escapeHTML(p.pageKey)}</a>`).join('');
  }
  const titleEl = document.getElementById('tss-flyer-title');
  if (titleEl) titleEl.textContent = flyer.name + '（全' + flyer.pages.length + 'ページ）';
}
