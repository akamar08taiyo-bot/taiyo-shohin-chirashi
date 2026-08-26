// 価格・単価計算の共通ロジック。price-calc.html と各チラシページの「価格表示」で共有する。
// localStorage キー tsss-price-v1 は元の「価格・単価計算シート」から引き継ぎ。
const TSS_PRICE_KEY = 'tsss-price-v1';

const TSS_DEFAULT_MARGIN = 20;

// 見積カート: 各チラシの「見積に追加」チェックから商品を集める。
// 形状: { [商品id]: 数量 }。id は data/products.json の連番。
const TSS_QUOTE_CART_KEY = 'tss_quote_cart_v1';

function tssLoadQuoteCart() {
  try {
    const raw = localStorage.getItem(TSS_QUOTE_CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function tssSaveQuoteCart(cart) {
  try { localStorage.setItem(TSS_QUOTE_CART_KEY, JSON.stringify(cart)); } catch (e) {}
}
function tssQuoteCartCount(cart) { return Object.keys(cart || tssLoadQuoteCart()).length; }

function tssLoadPrices() {
  try {
    const raw = localStorage.getItem(TSS_PRICE_KEY);
    if (!raw) return { prices: {}, qtys: {}, margins: {}, sellPrices: {}, units: {}, bases: {} };
    const v = JSON.parse(raw);
    return {
      prices: v.prices || {}, qtys: v.qtys || {}, margins: v.margins || {}, sellPrices: v.sellPrices || {},
      units: v.units || {}, bases: v.bases || {},
    };
  } catch (e) {
    return { prices: {}, qtys: {}, margins: {}, sellPrices: {}, units: {}, bases: {} };
  }
}

function tssSavePrices(prices, qtys, margins, sellPrices, units, bases) {
  try {
    localStorage.setItem(TSS_PRICE_KEY, JSON.stringify({ prices, qtys, margins, sellPrices, units: units || {}, bases: bases || {} }));
  } catch (e) {}
}

// 単価の基準（100mLあたり・1000gあたり 等の「100」「1000」部分）の既定値
function tssDefaultBasis(kind) {
  if (kind === 'mL') return 100;
  if (kind === 'g') return 1000;
  return 1;
}

// 利益率（粗利率） = (販売価格 - 原価) / 販売価格 × 100 （price-calc-logic 規約準拠）
function tssMarginFromSell(cost, sell) {
  if (cost == null || sell == null || sell <= 0) return null;
  return Math.round(((sell - cost) / sell) * 1000) / 10;
}

// 販売価格 = 原価 / (1 - 目標利益率/100)
function tssSellFromMargin(cost, marginPercent) {
  if (cost == null || marginPercent == null || marginPercent >= 100) return null;
  return cost / (1 - marginPercent / 100);
}

function tssNum(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

// basis を省略すると既定値（100mL・1000g・1枚等）を使う。
// mL/g は「{basis}{kind}あたり」、それ以外は「{basis}{kind}あたり」（basis=1なら「1枚あたり」等）。
function tssUnitLabel(kind, basis) {
  const b = basis != null ? basis : tssDefaultBasis(kind);
  if (kind === 'mL' || kind === 'g') return b + kind + 'あたり';
  const unitName = kind === 'ロール' ? 'ロール' : kind === '箱' ? '箱' : '枚';
  return b + unitName + 'あたり';
}

function tssCalcUnitPrice(price, qty, kind, basis) {
  if (price == null || qty == null) return null;
  const b = basis != null ? basis : tssDefaultBasis(kind);
  return price / (qty / b);
}

// トイレットペーパー等ロール物の「1mあたり」= 1ロールあたり単価 ÷ 1ロールの長さ(m)
function tssCalcPerMeterPrice(price, qty, metersPerRoll) {
  if (price == null || qty == null || !metersPerRoll) return null;
  return (price / qty) / metersPerRoll;
}

function tssFmtYen(v) {
  if (v == null) return '—';
  if (v >= 100) return '￥' + Math.round(v).toLocaleString('ja-JP');
  if (v >= 10) return '￥' + v.toFixed(1);
  return '￥' + v.toFixed(2);
}
