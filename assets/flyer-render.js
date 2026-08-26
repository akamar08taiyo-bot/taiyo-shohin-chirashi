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
const TSS_COMPOSITION_KEY = 'tss_chirashi_composition_v1';

function tssLoadBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === '1';
}
function tssSaveBool(key, val) {
  localStorage.setItem(key, val ? '1' : '0');
}

// 掲載商品の差し替え（おすすめ構成からの上書き）。
// 形状: { [flierKey]: { [pageKey]: [code, code, code, code] } }
function tssLoadComposition() {
  try {
    const raw = localStorage.getItem(TSS_COMPOSITION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function tssSaveComposition(comp) {
  try { localStorage.setItem(TSS_COMPOSITION_KEY, JSON.stringify(comp)); } catch (e) {}
}

async function renderFlyer(flyerKey, mountId) {
  const [pagesData, productsData, priceRows] = await Promise.all([
    fetch('./data/pages.json').then(r => r.json()),
    fetch('./data/products.json').then(r => r.json()),
    fetch('./data/price-rows.json').then(r => r.json()),
  ]);

  const office = tssLoadOffice();
  document.title = document.title.replace(/太陽シルバーサービス\s*\S*営業所$/, '太陽シルバーサービス ' + office.name);

  const flyer = pagesData.flyers.find(f => f.key === flyerKey);
  if (!flyer) {
    document.getElementById(mountId).textContent = 'チラシデータが見つかりません: ' + flyerKey;
    return;
  }

  // products.json と price-rows.json は id（安定した連番）で対応させる。
  // code は「JAN 未確認」等の重複値を持つ商品が複数あり、code をキーにすると
  // 別商品の行を誤って参照するため使わない。
  const priceRowById = new Map(priceRows.map(r => [r.id, r]));
  const priceByCode = new Map(productsData.items.map(it => [it, priceRowById.get(it.id)]));
  const { prices: savedPrices, qtys: savedQtys, margins: savedMargins, sellPrices: savedSellPrices, units: savedUnits, bases: savedBases } = tssLoadPrices();
  const itemById = new Map(productsData.items.map(it => [it.id, it]));

  // おすすめ構成（flier+page でグループ化、掲載順を保持）
  const defaultItemsByPage = new Map();
  for (const item of productsData.items) {
    if (item.flier !== flyer.name) continue;
    const arr = defaultItemsByPage.get(item.page) || [];
    arr.push(item);
    defaultItemsByPage.set(item.page, arr);
  }

  let showCodes = tssLoadBool(TSS_SHOW_CODES_KEY, true);
  let showPrice = tssLoadBool(TSS_SHOW_PRICE_KEY, false);
  let editMode = false;
  let quoteMode = false;
  let quoteCart = tssLoadQuoteCart();
  let composition = tssLoadComposition();
  let pickerTarget = null; // { pageKey, slotIndex } while picker is open

  const mount = document.getElementById(mountId);

  function pageComposition(pageKey) {
    composition[flyer.key] = composition[flyer.key] || {};
    return composition[flyer.key][pageKey] || null;
  }
  function itemsForPage(pageKey) {
    const override = pageComposition(pageKey);
    if (!override) return defaultItemsByPage.get(pageKey) || [];
    return override.map(id => itemById.get(id)).filter(Boolean);
  }
  function setSlot(pageKey, slotIndex, id) {
    const current = pageComposition(pageKey) || (defaultItemsByPage.get(pageKey) || []).map(it => it.id);
    const next = current.slice();
    next[slotIndex] = id;
    composition[flyer.key] = composition[flyer.key] || {};
    composition[flyer.key][pageKey] = next;
    tssSaveComposition(composition);
  }
  function resetPage(pageKey) {
    if (composition[flyer.key]) delete composition[flyer.key][pageKey];
    tssSaveComposition(composition);
  }

  function cardHTML(item, idx, tokens, pageKey) {
    const priceRow = priceByCode.get(item);
    let priceHTML = '';
    if (showPrice && priceRow) {
      // 販売金額 = 仕入価格 ／ (1 - 利益率)。金額を直接入力していればそちらを優先（price-calc.html と同じ規約）
      const cost = tssNum(savedPrices[item.id]);
      const margin = tssNum(savedMargins[item.id]) ?? TSS_DEFAULT_MARGIN;
      const sellOverride = tssNum(savedSellPrices[item.id]);
      const sell = sellOverride != null ? sellOverride : (cost != null ? tssSellFromMargin(cost, margin) : null);
      const qty = savedQtys[item.id] != null ? tssNum(savedQtys[item.id]) : priceRow.baseQty;
      const kind = savedUnits[item.id] || priceRow.kind;
      const basis = tssNum(savedBases[item.id]) ?? tssDefaultBasis(kind);
      const unit = tssCalcUnitPrice(sell, qty, kind, basis);
      const perMeterHTML = priceRow.metersPerRoll
        ? `<span class="unit-sub">1mあたり ${tssFmtYen(tssCalcPerMeterPrice(sell, qty, priceRow.metersPerRoll))}</span>`
        : '';
      priceHTML = `<div class="tss-card-price"><span class="amount">${sell != null ? '￥' + Math.round(sell).toLocaleString('ja-JP') : '￥　　　　'}</span><span class="unit">${escapeHTML(tssUnitLabel(kind, basis))} ${unit != null ? tssFmtYen(unit) : '￥　　'}</span>${perMeterHTML}</div>`;
    }
    const nameLines = escapeHTML(item.name).replace(/\s*[／･・]\s*$/, '');
    const editBtn = editMode
      ? `<button type="button" class="tss-card-editbtn" data-page-key="${escapeHTML(pageKey)}" data-slot="${idx}">商品を変更</button>`
      : '';
    const quoteChk = quoteMode
      ? `<label class="tss-card-quotechk"><input type="checkbox" data-id="${item.id}" ${quoteCart[item.id] != null ? 'checked' : ''} />見積に追加</label>`
      : '';
    return `
      <article class="tss-card">
        ${editBtn}
        ${quoteChk}
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
    const items = itemsForPage(page.pageKey);
    const isCustom = !!pageComposition(page.pageKey);
    const titleHTML = page.subtitle
      ? `${escapeHTML(page.title)}<br /><span class="tss-subtitle">${escapeHTML(page.subtitle)}</span>`
      : escapeHTML(page.title);
    const sizeBoxHTML = page.sizeBoxTitle
      ? `<div class="tss-sizebox">
           <div class="tss-sizebox-title">${escapeHTML(page.sizeBoxTitle)}</div>
           <div class="tss-sizebox-body">${escapeHTML(page.sizeBoxBody)}</div>
         </div>`
      : '';
    const editBar = editMode
      ? `<div class="tss-page-editbar">編集モード${isCustom ? '・この ページはカスタム構成です' : '・おすすめ構成'}
           ${isCustom ? `<button type="button" class="tss-reset-btn" data-page-key="${escapeHTML(page.pageKey)}">おすすめ構成に戻す</button>` : ''}
         </div>`
      : '';
    return `
    <div class="tss-page-wrap">
      ${editBar}
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
        ${items.map((it, i) => cardHTML(it, i, tokens, page.pageKey)).join('')}
      </div>
      ${sizeBoxHTML}
      <p class="tss-note">${escapeHTML(page.note)}</p>
      <footer class="tss-footer">
        <div class="tss-footer-left">
          <div class="tss-footer-office">太陽シルバーサービス㈱　${escapeHTML(office.name)}</div>
          <div class="tss-footer-addr">${escapeHTML(office.address)}</div>
          <div class="tss-footer-tel"><span>TEL ${escapeHTML(office.tel)}</span><span>FAX ${escapeHTML(office.fax)}</span></div>
          <div class="tss-footer-contact">
            <div class="tss-footer-contact-item"><span class="tss-footer-contact-label">${office.contactName ? '担当' : '所長'}</span><span class="tss-footer-contact-name">${escapeHTML(office.contactName || office.manager)}</span></div>
            ${office.mobile ? `<div class="tss-footer-contact-item"><span class="tss-footer-contact-label">携帯</span><span class="tss-footer-contact-mobile">${escapeHTML(office.mobile)}</span></div>` : ''}
          </div>
        </div>
      </footer>
      </section>
    </div>`;
  }

  function renderAll() {
    mount.innerHTML = flyer.pages.map((p, i) => pageHTML(p, flyer.tokens, i)).join('');
  }

  // ---- 商品差し替えピッカー ----
  const picker = document.createElement('div');
  picker.className = 'tss-picker-backdrop';
  picker.innerHTML = `
    <div class="tss-picker">
      <div class="tss-picker-head">
        <div class="tss-picker-title">商品を差し替え</div>
        <button type="button" class="tss-picker-close">閉じる</button>
      </div>
      <div class="tss-picker-filters">
        <input type="text" class="tss-picker-search" placeholder="商品名・メーカーで検索" />
        <select class="tss-picker-page"><option value="">場所（分類）: すべて</option></select>
        <select class="tss-picker-maker"><option value="">メーカー: すべて</option></select>
      </div>
      <div class="tss-picker-list"></div>
    </div>`;
  document.body.appendChild(picker);

  const allPages = Array.from(new Set(productsData.items.map(it => it.page))).sort();
  const allMakers = Array.from(new Set(productsData.items.map(it => it.maker)));
  const pageSelect = picker.querySelector('.tss-picker-page');
  const makerSelect = picker.querySelector('.tss-picker-maker');
  allPages.forEach(p => pageSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`));
  allMakers.forEach(m => makerSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`));

  function renderPickerList() {
    const q = picker.querySelector('.tss-picker-search').value.trim();
    const pageFilter = pageSelect.value;
    const makerFilter = makerSelect.value;
    const list = productsData.items.filter(it => {
      if (pageFilter && it.page !== pageFilter) return false;
      if (makerFilter && it.maker !== makerFilter) return false;
      if (q && !(it.name.includes(q) || it.maker.includes(q))) return false;
      return true;
    });
    const listEl = picker.querySelector('.tss-picker-list');
    if (!list.length) {
      listEl.innerHTML = '<div class="tss-picker-empty">該当する商品がありません</div>';
      return;
    }
    listEl.innerHTML = list.map(it => `
      <button type="button" class="tss-picker-item" data-id="${it.id}">
        <img src="./images/${it.image.replace(/^\.\/images\//, '')}" alt="" loading="lazy" />
        <span class="tss-picker-item-info">
          <span class="tss-picker-item-name">${escapeHTML(it.name)}</span>
          <span class="tss-picker-item-meta">${escapeHTML(it.maker)} ／ ${escapeHTML(it.spec)} ／ ${escapeHTML(it.page)}</span>
        </span>
      </button>`).join('');
  }

  function openPicker(pageKey, slotIndex) {
    pickerTarget = { pageKey, slotIndex };
    picker.querySelector('.tss-picker-search').value = '';
    pageSelect.value = '';
    makerSelect.value = '';
    renderPickerList();
    picker.classList.add('is-open');
  }
  function closePicker() {
    picker.classList.remove('is-open');
    pickerTarget = null;
  }
  picker.querySelector('.tss-picker-close').addEventListener('click', closePicker);
  picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
  picker.querySelector('.tss-picker-search').addEventListener('input', renderPickerList);
  pageSelect.addEventListener('change', renderPickerList);
  makerSelect.addEventListener('change', renderPickerList);
  picker.querySelector('.tss-picker-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.tss-picker-item');
    if (!btn || !pickerTarget) return;
    setSlot(pickerTarget.pageKey, pickerTarget.slotIndex, Number(btn.dataset.id));
    closePicker();
    renderAll();
  });

  // カードの「商品を変更」ボタン・ページの「おすすめ構成に戻す」は再描画後も
  // 消えないよう mount への委譲イベントで拾う
  mount.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.tss-card-editbtn');
    if (editBtn) {
      openPicker(editBtn.dataset.pageKey, Number(editBtn.dataset.slot));
      return;
    }
    const resetBtn = e.target.closest('.tss-reset-btn');
    if (resetBtn) {
      resetPage(resetBtn.dataset.pageKey);
      renderAll();
    }
  });

  mount.addEventListener('change', (e) => {
    const chk = e.target.closest('.tss-card-quotechk input');
    if (!chk) return;
    const id = Number(chk.dataset.id);
    if (chk.checked) {
      quoteCart[id] = quoteCart[id] || 1;
    } else {
      delete quoteCart[id];
    }
    tssSaveQuoteCart(quoteCart);
    updateQuoteBadge();
  });

  renderAll();

  // 商品データの取得後にページが組み立てられるため、URLにページ内リンク（#tss-page-N）が
  // 付いていてもブラウザの自動スクロールには間に合わない。描画完了後に手動でスクロールする。
  if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView();
  }

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

  const editToggle = document.getElementById('tss-toggle-edit');
  if (editToggle) {
    editToggle.checked = editMode;
    editToggle.addEventListener('change', () => {
      editMode = editToggle.checked;
      renderAll();
    });
  }

  const quoteToggle = document.getElementById('tss-toggle-quote');
  if (quoteToggle) {
    quoteToggle.checked = quoteMode;
    quoteToggle.addEventListener('change', () => {
      quoteMode = quoteToggle.checked;
      renderAll();
    });
  }
  function updateQuoteBadge() {
    const badge = document.getElementById('tss-quote-badge');
    if (!badge) return;
    const n = tssQuoteCartCount(quoteCart);
    badge.textContent = '見積を見る（' + n + '）';
    badge.classList.toggle('has-items', n > 0);
  }
  updateQuoteBadge();

  const printBtn = document.getElementById('tss-print-btn');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const jumpNav = document.getElementById('tss-pagejump');
  if (jumpNav) {
    jumpNav.innerHTML = flyer.pages.map((p, i) => `<a href="#tss-page-${i}">${escapeHTML(p.pageKey)}</a>`).join('');
  }
  const titleEl = document.getElementById('tss-flyer-title');
  if (titleEl) titleEl.textContent = flyer.name + '（全' + flyer.pages.length + 'ページ）';
}
