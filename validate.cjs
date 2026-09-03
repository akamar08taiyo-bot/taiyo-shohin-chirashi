#!/usr/bin/env node
// データ整合性チェック。`node validate.cjs` で実行する。
// 掲載ルール（1ページ4商品ちょうど・ID一致・画像の実在）を機械的に検証し、
// 崩れたまま公開してしまうのを防ぐ。

const fs = require('fs');
const path = require('path');

const root = __dirname;
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/products.json'), 'utf-8'));
const priceRows = JSON.parse(fs.readFileSync(path.join(root, 'data/price-rows.json'), 'utf-8'));
const pages = JSON.parse(fs.readFileSync(path.join(root, 'data/pages.json'), 'utf-8'));

const errors = [];
const notes = [];
const noIdItems = [];
const noQtyRows = [];
const sensitivePriceKeys = [
  'cost', 'defaultSellPrice', 'purchaseCasePrice', 'saleCasePrice',
  'priceSource', 'priceSourceMethod', 'priceKind', 'defaultSellMethod',
];

function isValidJan13(value) {
  const digits = String(value).split('').map(Number);
  if (digits.length !== 13 || digits.some(Number.isNaN)) return false;
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

// --- ID の一意性 ---
const seen = new Set();
const productSignatures = new Map();
if (products.meta && products.meta.items !== products.items.length) {
  errors.push(`products.json: meta.items ${products.meta.items} と実商品数 ${products.items.length} が一致しない`);
}
for (const it of products.items) {
  if (typeof it.id !== 'number') errors.push(`products.json: id が数値でない (${it.name})`);
  if (seen.has(it.id)) errors.push(`products.json: id ${it.id} が重複している`);
  if (String(it.code || '').includes('未確認')) errors.push(`products.json: id ${it.id} (${it.name}) に未確認情報が残っている`);
  const signature = [it.maker, it.name, it.spec, it.code].join('||');
  if (productSignatures.has(signature)) {
    errors.push(`products.json: id ${it.id} と id ${productSignatures.get(signature)} が同一商品として重複している`);
  }
  productSignatures.set(signature, it.id);
  const janCodes = String(it.code || '').match(/\b\d{13}\b/g) || [];
  const hasModel = /品番\s*\S/.test(String(it.code || ''));
  // JAN・品番のどちらも公表していないメーカーがあるため（ユニ・チャーム等）、
  // 識別子なしはエラーにせず補足として一覧に出す。誤ったJANを入れる方が危険。
  if (janCodes.length === 0 && !hasModel) noIdItems.push(it);
  janCodes.filter(jan => !isValidJan13(jan)).forEach(jan => {
    errors.push(`products.json: id ${it.id} (${it.name}) のJAN ${jan} はチェックデジットが不正`);
  });
  if (/容量\s*[^／]+/.test(String(it.code || '')) && /^(大容量|ボトル|スプレー|本体)$/.test(String(it.spec || ''))) {
    errors.push(`products.json: id ${it.id} (${it.name}) は容量確認済みなのに規格が曖昧`);
  }
  seen.add(it.id);
}

// --- products と price-rows の 1:1 対応 ---
const priceIds = new Set(priceRows.map(r => r.id));
const productById = new Map(products.items.map(item => [item.id, item]));
for (const it of products.items) {
  if (!priceIds.has(it.id)) errors.push(`price-rows.json: id ${it.id} (${it.name}) の行がない`);
}
for (const r of priceRows) {
  if (!seen.has(r.id)) errors.push(`price-rows.json: id ${r.id} は products.json に存在しない`);
  const product = productById.get(r.id);
  if (product) {
    for (const key of ['maker', 'name', 'spec', 'code']) {
      if (r[key] !== product[key]) errors.push(`id ${r.id}: ${key} が products.json と price-rows.json で一致しない`);
    }
  }
  const leakedKeys = sensitivePriceKeys.filter(key => Object.prototype.hasOwnProperty.call(r, key));
  if (leakedKeys.length) errors.push(`price-rows.json: id ${r.id} に公開禁止フィールドがある (${leakedKeys.join(', ')})`);
  if (['mL', 'g'].includes(r.kind) && r.baseQty === 1) {
    errors.push(`price-rows.json: id ${r.id} (${r.name}) の内容量に仮値 1${r.kind} が残っている`);
  }
  if (/容量\s*未確認/.test(String(r.code || '')) && r.baseQty != null) {
    errors.push(`price-rows.json: id ${r.id} (${r.name}) は容量未確認なのに数量が入力されている`);
  }
  // 規格から読み取れる数量があるのに未入力なのは取りこぼし＝エラー。
  // 一方、メーカーが入数を公表していない商品（ライフリー等）や機器類は数量を持たないので補足扱い。
  const derivableQty = /[\d.]+\s*(枚|本|個|組|セット|mL|ｍｌ|L|g|kg)/i.test(String(r.spec || ''));
  if (r.baseQty == null) {
    if (derivableQty) errors.push(`price-rows.json: id ${r.id} (${r.name}) は規格に数量があるのに内容量が空欄`);
    else noQtyRows.push(r);
  } else if (!Number.isFinite(Number(r.baseQty)) || Number(r.baseQty) <= 0) {
    errors.push(`price-rows.json: id ${r.id} (${r.name}) の内容量・入数が不正`);
  }
}

// --- 画像ファイルの実在 ---
for (const it of products.items) {
  const p = path.join(root, it.image.replace(/^\.\//, ''));
  if (!fs.existsSync(p)) errors.push(`画像が見つからない: ${it.image} (id ${it.id} ${it.name})`);
}

// --- 固定ページも自動ページ分割も、印刷される全ページが4商品ちょうど ---
const validPairs = new Set();
const autoFlyerNames = new Set(pages.flyers.filter(flyer => flyer.autoPaginate).map(flyer => flyer.name));
for (const flyer of pages.flyers) {
  const autoItems = [];
  for (const pg of flyer.pages) {
    validPairs.add(flyer.name + '||' + pg.pageKey);
    const items = products.items.filter(it => it.flier === flyer.name && it.page === pg.pageKey);
    if (flyer.autoPaginate) {
      const printableItems = items.filter(it => it.fixedFlyer !== false);
      if (printableItems.length === 0) {
        errors.push(`${flyer.key} / ${pg.pageKey}: 自動ページ分割する商品がありません`);
      }
      autoItems.push(...printableItems);
    } else if (!flyer.autoPaginate && items.length !== 4) {
      errors.push(`${flyer.key} / ${pg.pageKey}: 掲載商品が ${items.length} 件（4件ちょうどである必要があります）`);
    }
  }
  if (flyer.autoPaginate) {
    if (autoItems.length === 0 || autoItems.length % 4 !== 0) {
      errors.push(`${flyer.key}: 固定チラシ商品が ${autoItems.length} 件（全ページを4件ちょうどにできません）`);
    }
    for (let offset = 0; offset < autoItems.length; offset += 4) {
      const pageItems = autoItems.slice(offset, offset + 4);
      if (pageItems.length !== 4) {
        errors.push(`${flyer.key}: 自動生成ページ ${offset / 4 + 1} が ${pageItems.length} 件（4件ちょうどである必要があります）`);
      }
    }
  }
}

// --- ページに載らない商品（ピッカー専用の予備）---
const spares = products.items.filter(it => (
  !validPairs.has(it.flier + '||' + it.page)
  || (autoFlyerNames.has(it.flier) && it.fixedFlyer === false)
));
if (spares.length) {
  notes.push(`ピッカー専用の予備商品 ${spares.length} 件（チラシには印刷されません）:`);
  spares.forEach(it => notes.push(`    id ${it.id}  ${it.flier} / ${it.page}  ${it.name}`));
}

// --- 識別子・入数を公表していない商品（誤情報を入れないため空欄のまま）---
if (noIdItems.length) {
  const byMaker = {};
  noIdItems.forEach(it => { byMaker[it.maker] = (byMaker[it.maker] || 0) + 1; });
  notes.push(`JAN・品番の公表がない商品 ${noIdItems.length} 件（推測で入れずに空欄）: `
    + Object.entries(byMaker).map(([m, n]) => `${m} ${n}件`).join(' / '));
}
if (noQtyRows.length) {
  const byMaker = {};
  noQtyRows.forEach(r => { byMaker[r.maker] = (byMaker[r.maker] || 0) + 1; });
  notes.push(`入数の公表がない商品 ${noQtyRows.length} 件（単価は表示されません）: `
    + Object.entries(byMaker).map(([m, n]) => `${m} ${n}件`).join(' / '));
}

// --- 出力 ---
if (notes.length) {
  console.log('■ 補足');
  notes.forEach(n => console.log('  ' + n));
  console.log('');
}
if (errors.length) {
  console.error('■ エラー ' + errors.length + ' 件');
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`✓ 検証OK  商品 ${products.items.length} 件 / 価格行 ${priceRows.length} 件 / チラシ ${pages.flyers.length} 種`);
