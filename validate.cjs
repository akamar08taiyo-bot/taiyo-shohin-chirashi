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
const sensitivePriceKeys = [
  'cost', 'defaultSellPrice', 'purchaseCasePrice', 'saleCasePrice',
  'priceSource', 'priceSourceMethod', 'priceKind', 'defaultSellMethod',
];

// --- ID の一意性 ---
const seen = new Set();
if (products.meta && products.meta.items !== products.items.length) {
  errors.push(`products.json: meta.items ${products.meta.items} と実商品数 ${products.items.length} が一致しない`);
}
for (const it of products.items) {
  if (typeof it.id !== 'number') errors.push(`products.json: id が数値でない (${it.name})`);
  if (seen.has(it.id)) errors.push(`products.json: id ${it.id} が重複している`);
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
  const explicitPieces = String(r.spec || '').match(/(\d+)\s*枚入(?:\s*[×x]\s*(\d+))?/);
  if (r.baseQty == null && explicitPieces) {
    errors.push(`price-rows.json: id ${r.id} (${r.name}) は規格に枚数があるのに内容量が空欄`);
  }
}

// --- 画像ファイルの実在 ---
for (const it of products.items) {
  const p = path.join(root, it.image.replace(/^\.\//, ''));
  if (!fs.existsSync(p)) errors.push(`画像が見つからない: ${it.image} (id ${it.id} ${it.name})`);
}

// --- 固定ページは4商品ちょうど、自動ページ分割はカテゴリ内に1商品以上 ---
const validPairs = new Set();
for (const flyer of pages.flyers) {
  for (const pg of flyer.pages) {
    validPairs.add(flyer.name + '||' + pg.pageKey);
    const items = products.items.filter(it => it.flier === flyer.name && it.page === pg.pageKey);
    if (flyer.autoPaginate && items.length === 0) {
      errors.push(`${flyer.key} / ${pg.pageKey}: 自動ページ分割する商品がありません`);
    } else if (!flyer.autoPaginate && items.length !== 4) {
      errors.push(`${flyer.key} / ${pg.pageKey}: 掲載商品が ${items.length} 件（4件ちょうどである必要があります）`);
    }
  }
}

// --- ページに載らない商品（ピッカー専用の予備）---
const spares = products.items.filter(it => !validPairs.has(it.flier + '||' + it.page));
if (spares.length) {
  notes.push(`ピッカー専用の予備商品 ${spares.length} 件（チラシには印刷されません）:`);
  spares.forEach(it => notes.push(`    id ${it.id}  ${it.flier} / ${it.page}  ${it.name}`));
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
