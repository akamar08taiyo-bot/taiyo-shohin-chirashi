// 価格・単価計算の共通ロジック。price-calc.html と各チラシページの「価格表示」で共有する。
// localStorage キー tsss-price-v1 は元の「価格・単価計算シート」から引き継ぎ。
const TSS_PRICE_KEY = 'tsss-price-v1';

const TSS_DEFAULT_MARGIN = 20;

function tssLoadPrices() {
  try {
    const raw = localStorage.getItem(TSS_PRICE_KEY);
    if (!raw) return { prices: {}, qtys: {}, margins: {}, sellPrices: {} };
    const v = JSON.parse(raw);
    return { prices: v.prices || {}, qtys: v.qtys || {}, margins: v.margins || {}, sellPrices: v.sellPrices || {} };
  } catch (e) {
    return { prices: {}, qtys: {}, margins: {}, sellPrices: {} };
  }
}

function tssSavePrices(prices, qtys, margins, sellPrices) {
  try {
    localStorage.setItem(TSS_PRICE_KEY, JSON.stringify({ prices, qtys, margins, sellPrices }));
  } catch (e) {}
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

function tssUnitLabel(kind) {
  if (kind === 'mL') return '100mLあたり';
  if (kind === 'g') return '1kgあたり';
  if (kind === 'ロール') return '1ロールあたり';
  if (kind === '箱') return '1箱あたり';
  return '1枚あたり';
}

function tssCalcUnitPrice(price, qty, kind) {
  if (price == null || qty == null) return null;
  if (kind === 'mL') return price / (qty / 100);
  if (kind === 'g') return price / (qty / 1000);
  return price / qty;
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
