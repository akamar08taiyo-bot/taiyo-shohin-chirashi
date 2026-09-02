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
const TSS_ASK_KEY = 'tss_chirashi_askCheck_v1';
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
    fetch('./data/pages.json?v=20260902-4').then(r => r.json()),
    fetch('./data/products.json?v=20260902-4').then(r => r.json()),
    fetch('./data/price-rows.json?v=20260902-4').then(r => r.json()),
  ]);

  // 担当者はこの端末の設定を優先する（ツールバーから変更でき、次回も同じ内容を使う）。
  let office = tssOfficeWithStaff(tssLoadOffice());
  document.title = document.title.replace(/太陽シルバーサービス\s*\S*営業所$/, '太陽シルバーサービス ' + office.name);

  let flyer = pagesData.flyers.find(f => f.key === flyerKey);
  if (!flyer) {
    document.getElementById(mountId).textContent = 'チラシデータが見つかりません: ' + flyerKey;
    return;
  }

  // 商品数が多いメーカーは、分類ごとに4商品ずつA4ページへ自動分割する。
  // 1ページのカード数を固定することで、印刷時にカード途中で改ページされるのを防ぐ。
  if (flyer.autoPaginate) {
    const autoPages = [];
    for (const template of flyer.pages) {
      const sourceItems = productsData.items.filter(item => item.flier === flyer.name && item.page === template.pageKey);
      const pageCount = Math.max(1, Math.ceil(sourceItems.length / 4));
      for (let i = 0; i < pageCount; i++) {
        const items = sourceItems.slice(i * 4, (i + 1) * 4);
        autoPages.push({
          ...template,
          pageKey: pageCount > 1 ? `${template.pageKey} ${i + 1}/${pageCount}` : template.pageKey,
          productIds: items.map(item => item.id),
        });
      }
    }
    flyer = { ...flyer, pages: autoPages };
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
  for (const page of flyer.pages) {
    if (Array.isArray(page.productIds)) {
      defaultItemsByPage.set(page.pageKey, page.productIds.map(id => itemById.get(id)).filter(Boolean));
    }
  }
  if (!flyer.autoPaginate) {
    for (const item of productsData.items) {
      if (item.flier !== flyer.name) continue;
      const arr = defaultItemsByPage.get(item.page) || [];
      arr.push(item);
      defaultItemsByPage.set(item.page, arr);
    }
  }

  let showCodes = tssLoadBool(TSS_SHOW_CODES_KEY, true);
  let showPrice = tssLoadBool(TSS_SHOW_PRICE_KEY, false);
  let editMode = false;
  let quoteMode = false;
  let askMode = tssLoadBool(TSS_ASK_KEY, false);
  let priceEditMode = false;          // チラシ上で金額を直接編集するモード
  let saveToTable = false;            // 変更を価格表にも保存するか（既定は保存しない）
  let tempSell = tssLoadTempSell();   // このチラシ限りの金額
  const printPages = {};   // { [pageIndex]: false } 印刷しないページだけ記録する
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
      // 価格は、この端末でExcel読込または手入力された場合だけ表示する。
      // 一時価格（このチラシ限り）があればそちらを優先する。
      const sell = tssSellWithTemp(tempSell, savedPrices, savedMargins, savedSellPrices, priceRow, item.id);
      if (sell != null) {
        const qty = savedQtys[item.id] != null ? tssNum(savedQtys[item.id]) : priceRow.baseQty;
        const kind = savedUnits[item.id] || priceRow.kind;
        const basis = tssNum(savedBases[item.id]) ?? tssDefaultBasis(kind);
        const unit = tssCalcUnitPrice(sell, qty, kind, basis);
        const isTemp = tssNum(tempSell[item.id]) != null;
        const perMeterHTML = priceRow.metersPerRoll
          ? `<span class="unit-sub">1mあたり ${tssFmtYen(tssCalcPerMeterPrice(sell, qty, priceRow.metersPerRoll))}</span>`
          : '';
        if (priceEditMode) {
          // 金額と「100mLあたり」を直接書き換えられるようにする。
          // どちらか一方を直せば、もう片方は自動で計算し直す。
          priceHTML = `<div class="tss-card-price is-editing${isTemp ? ' is-temp' : ''}">
              <span class="amount">￥<input type="text" inputmode="decimal" class="tss-price-input" data-field="sell" data-id="${item.id}" value="${Math.round(sell)}" /></span>
              <span class="unit">${escapeHTML(tssUnitLabel(kind, basis))} ￥<input type="text" inputmode="decimal" class="tss-price-input tss-unit-input" data-field="unit" data-id="${item.id}" value="${unit != null ? (unit >= 100 ? Math.round(unit) : unit.toFixed(1)) : ''}" /></span>
              ${perMeterHTML}
            </div>`;
        } else {
          priceHTML = `<div class="tss-card-price${isTemp ? ' is-temp' : ''}"><span class="amount">￥${Math.round(sell).toLocaleString('ja-JP')}</span><span class="unit">${escapeHTML(tssUnitLabel(kind, basis))} ${unit != null ? tssFmtYen(unit) : ''}</span>${perMeterHTML}</div>`;
        }
      }
    }
    const nameLines = escapeHTML(item.name).replace(/\s*[／･・]\s*$/, '');
    const editBtn = editMode
      ? `<button type="button" class="tss-card-editbtn" data-page-key="${escapeHTML(pageKey)}" data-slot="${idx}">商品を変更</button>`
      : '';
    const quoteChk = quoteMode
      ? `<label class="tss-card-quotechk"><input type="checkbox" data-id="${item.id}" ${quoteCart[item.id] != null ? 'checked' : ''} />見積に追加</label>`
      : '';
    // お客様がチラシに直接チェックを付けるための空欄。社内用のチェックと違い印刷にも出す。
    const askChk = askMode ? '<span class="tss-card-askchk" aria-hidden="true"></span>' : '';
    return `
      <article class="tss-card">
        ${editBtn}
        ${quoteChk}
        ${askChk}
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
    // 何ページ目かの表示と、印刷するページの選択。画面だけで、紙には出さない。
    const printChecked = printPages[pageIndex] !== false;
    const pageBar = `
      <div class="tss-page-bar">
        <span class="tss-page-num">${pageIndex + 1}<span class="of">／${flyer.pages.length}ページ</span></span>
        <span class="tss-page-key">${escapeHTML(page.pageKey)}</span>
        <label class="tss-toggle tss-page-printchk">
          <input type="checkbox" data-page-index="${pageIndex}" ${printChecked ? 'checked' : ''} />このページを印刷する
        </label>
      </div>`;
    return `
    <div class="tss-page-wrap${printChecked ? '' : ' is-noprint'}" data-page-index="${pageIndex}">
      ${pageBar}
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

  // 担当者の入力欄をツールバーへ追加する。
  // 営業所マスタは全社共通で画面から変えられないため、担当名と携帯だけは
  // ここで入力し、この端末に保存して次回以降も同じ内容を使えるようにする。
  const toolbar = document.querySelector('.tss-toolbar');
  if (toolbar) {
    const saved = tssLoadStaff();
    const initial = saved || { name: office.contactName || '', mobile: office.mobile || '' };
    const group = document.createElement('div');
    group.className = 'tss-toolgroup tss-staffgroup';
    group.innerHTML =
      '<span class="tss-toolgroup-label">担当</span>' +
      '<input type="text" class="tss-staff-input" id="tss-staff-name" placeholder="担当者名"' +
      ' value="' + escapeHTML(initial.name) + '" />' +
      '<input type="tel" class="tss-staff-input" id="tss-staff-mobile" placeholder="携帯番号"' +
      ' value="' + escapeHTML(initial.mobile) + '" />';
    const firstGroup = toolbar.querySelector('.tss-toolgroup');
    if (firstGroup) firstGroup.insertAdjacentElement('beforebegin', group);
    else toolbar.appendChild(group);
    group.addEventListener('change', () => {
      tssSaveStaff({
        name: document.getElementById('tss-staff-name').value,
        mobile: document.getElementById('tss-staff-mobile').value,
      });
      office = tssOfficeWithStaff(tssLoadOffice());
      renderAll();
    });
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

  /* ---- チラシ上での金額編集 ----
     施設ごとに金額を変えたチラシを渡すための機能。
     既定では価格表に保存せず、このチラシ限り（タブを閉じると消える）。 */
  const priceEditToggle = document.getElementById('tss-toggle-priceedit');
  const saveToggle = document.getElementById('tss-toggle-savetable');
  function updatePriceEditUI() {
    const bar = document.getElementById('tss-priceedit-bar');
    if (bar) bar.style.display = priceEditMode ? '' : 'none';
    const n = Object.keys(tempSell).filter(k => tssNum(tempSell[k]) != null).length;
    const badge = document.getElementById('tss-temp-count');
    if (badge) {
      badge.textContent = n ? 'このチラシだけ変更中：' + n + '件' : '';
      badge.style.display = n ? '' : 'none';
    }
    const resetBtn = document.getElementById('tss-temp-reset');
    if (resetBtn) resetBtn.style.display = n ? '' : 'none';
  }
  if (priceEditToggle) {
    priceEditToggle.addEventListener('change', () => {
      priceEditMode = priceEditToggle.checked;
      // 金額を編集するには価格表示がONである必要がある
      if (priceEditMode && !showPrice) {
        showPrice = true;
        tssSaveBool(TSS_SHOW_PRICE_KEY, true);
        const pt = document.getElementById('tss-toggle-price');
        if (pt) pt.checked = true;
      }
      renderAll();
      updatePriceEditUI();
    });
  }
  if (saveToggle) {
    saveToggle.addEventListener('change', () => { saveToTable = saveToggle.checked; });
  }
  const tempResetBtn = document.getElementById('tss-temp-reset');
  if (tempResetBtn) {
    tempResetBtn.addEventListener('click', () => {
      if (!confirm('このチラシだけの金額変更をすべて取り消し、価格表の金額に戻します。よろしいですか？')) return;
      tempSell = {};
      tssSaveTempSell(tempSell);
      renderAll();
      updatePriceEditUI();
    });
  }
  // 金額・単価の入力を反映する（片方を直すともう片方を計算し直す）
  mount.addEventListener('change', (e) => {
    const inp = e.target.closest('.tss-price-input');
    if (!inp) return;
    const id = Number(inp.dataset.id);
    const item = itemById.get(id);
    const priceRow = item ? priceByCode.get(item) : null;
    if (!priceRow) return;
    const qty = savedQtys[id] != null ? tssNum(savedQtys[id]) : priceRow.baseQty;
    const kind = savedUnits[id] || priceRow.kind;
    const basis = tssNum(savedBases[id]) ?? tssDefaultBasis(kind);

    let sell = null;
    if (inp.dataset.field === 'sell') {
      sell = tssNum(inp.value);
    } else {
      // 「100mLあたり」から本体価格を逆算する
      sell = tssSellFromUnitPrice(tssNum(inp.value), qty, kind, basis);
    }
    if (sell == null) { renderAll(); return; }

    if (saveToTable) {
      // 価格表（見積・価格表シートと共通）に保存する
      savedSellPrices[id] = String(Math.round(sell));
      tssSavePrices(savedPrices, savedQtys, savedMargins, savedSellPrices, savedUnits, savedBases);
      delete tempSell[id];
    } else {
      // このチラシ限り。価格表には触らない
      tempSell[id] = String(Math.round(sell));
    }
    tssSaveTempSell(tempSell);
    renderAll();
    updatePriceEditUI();
  });

  const askToggle = document.getElementById('tss-toggle-ask');
  if (askToggle) {
    askToggle.checked = askMode;
    askToggle.addEventListener('change', () => {
      askMode = askToggle.checked;
      tssSaveBool(TSS_ASK_KEY, askMode);
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

  // 印刷するページの選択。チェックを外したページは印刷から除く。
  function printCount() {
    return flyer.pages.filter((p, i) => printPages[i] !== false).length;
  }
  function updatePrintBtn() {
    const btn = document.getElementById('tss-print-btn');
    if (!btn) return;
    const n = printCount();
    btn.textContent = n === flyer.pages.length
      ? '🖨 印刷 / PDF保存'
      : '🖨 印刷 / PDF保存（' + n + 'ページ）';
    btn.disabled = n === 0;
    btn.style.opacity = n === 0 ? '.45' : '';
  }
  mount.addEventListener('change', (e) => {
    const chk = e.target.closest('.tss-page-printchk input');
    if (!chk) return;
    const i = Number(chk.dataset.pageIndex);
    printPages[i] = chk.checked;
    const wrap = chk.closest('.tss-page-wrap');
    if (wrap) wrap.classList.toggle('is-noprint', !chk.checked);
    updatePrintBtn();
  });

  const printAllBtn = document.getElementById('tss-print-all');
  function setAllPages(on) {
    flyer.pages.forEach((p, i) => { printPages[i] = on; });
    mount.querySelectorAll('.tss-page-printchk input').forEach(c => { c.checked = on; });
    mount.querySelectorAll('.tss-page-wrap').forEach(w => w.classList.toggle('is-noprint', !on));
    // 全ページ選択中なら次の操作は「解除」、そうでなければ「選択」
    if (printAllBtn) printAllBtn.textContent = on ? 'すべて解除' : 'すべて選択';
    updatePrintBtn();
  }
  if (printAllBtn) {
    printAllBtn.addEventListener('click', () => setAllPages(printCount() < flyer.pages.length));
  }

  const printBtn = document.getElementById('tss-print-btn');
  if (printBtn) printBtn.addEventListener('click', () => {
    if (printCount() === 0) { alert('印刷するページが選ばれていません。'); return; }
    window.print();
  });
  updatePrintBtn();
  updatePriceEditUI();

  const jumpNav = document.getElementById('tss-pagejump');
  if (jumpNav) {
    jumpNav.innerHTML = flyer.pages.map((p, i) =>
      `<a href="#tss-page-${i}"><span class="tss-jump-num">${i + 1}</span>${escapeHTML(p.pageKey)}</a>`).join('');
  }
  const titleEl = document.getElementById('tss-flyer-title');
  if (titleEl) titleEl.textContent = flyer.name + '（全' + flyer.pages.length + 'ページ）';
}
