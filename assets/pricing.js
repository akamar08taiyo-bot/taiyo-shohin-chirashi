// 価格・単価計算の共通ロジック。price-calc.html と各チラシページの「価格表示」で共有する。
// localStorage キー tsss-price-v1 は元の「価格・単価計算シート」から引き継ぎ。
const TSS_PRICE_KEY = 'tsss-price-v1';

function tssLoadPrices() {
  try {
    const raw = localStorage.getItem(TSS_PRICE_KEY);
    if (!raw) return { prices: {}, qtys: {} };
    const v = JSON.parse(raw);
    return { prices: v.prices || {}, qtys: v.qtys || {} };
  } catch (e) {
    return { prices: {}, qtys: {} };
  }
}

function tssSavePrices(prices, qtys) {
  try {
    localStorage.setItem(TSS_PRICE_KEY, JSON.stringify({ prices, qtys }));
  } catch (e) {}
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

function tssFmtYen(v) {
  if (v == null) return '—';
  if (v >= 100) return '￥' + Math.round(v).toLocaleString('ja-JP');
  if (v >= 10) return '￥' + v.toFixed(1);
  return '￥' + v.toFixed(2);
}
