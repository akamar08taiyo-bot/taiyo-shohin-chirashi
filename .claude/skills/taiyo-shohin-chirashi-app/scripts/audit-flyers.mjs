// 全チラシ × 表示の組み合わせ（価格・品番・お客様チェック欄・金額を編集）で、
// 印刷前のチェックが通るか（4商品・社名・本文のはみ出し・写真枠の高さのそろい）を調べる。
//
// 使い方（リポジトリ直下で http サーバーを立ててから）:
//   python3 -m http.server 5613 --bind 127.0.0.1 &
//   node .claude/skills/taiyo-shohin-chirashi-app/scripts/audit-flyers.mjs            # 全チラシ
//   node .claude/skills/taiyo-shohin-chirashi-app/scripts/audit-flyers.mjs kao-rocket.html,paper.html
//
// 大事なこと: 本物の Noto Sans JP（Google Fonts）を読み込まないと再現しない不具合がある
// （2026-10：価格＋品番で本文が 8.5px はみ出して印刷が止まったのは、代わりの書体では起きなかった）。
// このため Google Fonts だけは通信を通す（作業環境のプロキシ HTTPS_PROXY 経由）。ほかの外部通信は止める。
// 価格は架空の値を localStorage に入れる（本物の価格はリポジトリに無い）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const ROOT = process.env.REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const BASE = process.env.BASE || 'http://127.0.0.1:5613/';
const prods = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8')).items;
const sell = {}; prods.forEach((p, i) => { sell[p.id] = String(1000 + (i * 137) % 90000); });
const pagesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
const files = process.argv[2] ? process.argv[2].split(',') : pagesJson.flyers.map(f => f.file);
const combos = [
  { price: true, codes: true, ask: true },
  { price: true, codes: true, edit: true },
  { price: true, codes: false },
  { price: false, codes: true },
  { price: false, codes: false, ask: true },
];
const browser = await chromium.launch({
  env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
});
let failures = 0;
for (const file of files) for (const opts of combos) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1|https:\/\/fonts\.(googleapis|gstatic)\.com).*/, r => r.abort());
  await ctx.addInitScript(([sell, opts]) => {
    if (sessionStorage.getItem('__init')) return; sessionStorage.setItem('__init', '1');
    localStorage.setItem('tsss-price-v1', JSON.stringify({ prices: {}, qtys: {}, margins: {}, sellPrices: sell, units: {}, bases: {} }));
    localStorage.setItem('tss_chirashi_showPrice_v1', opts.price ? '1' : '0');
    localStorage.setItem('tss_chirashi_showCodes_v1', opts.codes ? '1' : '0');
    localStorage.setItem('tss_chirashi_askCheck_v1', opts.ask ? '1' : '0');
    window.print = () => { window.__printed = (window.__printed || 0) + 1; };
  }, [sell, opts]);
  const page = await ctx.newPage();
  const alerts = [], errors = [];
  page.on('dialog', d => { alerts.push(d.message()); d.accept(); });  // confirm・alert を止める（止め忘れるとタブが固まる）
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + file);
  try { await page.waitForSelector('.page .tss-card', { timeout: 15000 }); }
  catch { console.log('NG ', file, 'カードが出ない'); failures++; await ctx.close(); continue; }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts.ready);
  if (opts.edit) { await page.check('#tss-toggle-priceedit'); await page.waitForTimeout(300); }
  const res = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')];
    const bad = pages.map((pg, pi) => {
      const pageRect = pg.getBoundingClientRect();
      const cards = [...pg.querySelectorAll('.tss-card')];
      const footer = pg.querySelector('.tss-footer');
      const out = [];
      cards.forEach((card, ci) => {
        const body = card.querySelector('.tss-card-body');
        const spill = body.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom;
        if (body.scrollHeight > body.clientHeight + 1 || spill > 1) out.push(`カード${ci + 1}はみ出し${spill.toFixed(1)}px`);
      });
      const heights = [...new Set(cards.map(c => Math.round(c.querySelector('.tss-card-photo').getBoundingClientRect().height)))];
      if (heights.length > 1) out.push('写真枠の高さ ' + heights.join('/'));
      if (cards.length !== 4) out.push('カード' + cards.length + '枚');
      if (!footer || footer.getBoundingClientRect().bottom > pageRect.bottom + 1) out.push('社名がはみ出し');
      if (pg.scrollHeight > pg.clientHeight + 1 || pg.scrollWidth > pg.clientWidth + 1) out.push('ページがはみ出し');
      return out.length ? `p${pi + 1}[${out.join(' ')}]` : null;
    }).filter(Boolean);
    const minPhoto = Math.min(...[...document.querySelectorAll('.tss-card-photo')].map(p => p.getBoundingClientRect().height));
    return { n: pages.length, bad, minPhoto: Math.round(minPhoto) };
  });
  await page.click('#tss-print-btn');
  await page.waitForTimeout(1200);
  const printed = await page.evaluate(() => window.__printed || 0);
  const ok = !res.bad.length && printed === 1 && !alerts.length && !errors.length;
  if (!ok) failures++;
  console.log(`${ok ? 'OK ' : 'NG '} ${file} ${JSON.stringify(opts)} ${res.n}ページ 写真枠の最小${res.minPhoto}px 印刷${printed ? 'できた' : 'されない'}`
    + (res.bad.length ? ` ${res.bad.length}ページ: ${res.bad.slice(0, 3).join(' ')}` : '')
    + (alerts.length ? ' 警告: ' + alerts[0].slice(0, 40) : '') + (errors.length ? ' エラー: ' + errors.join(' | ').slice(0, 200) : ''));
  await ctx.close();
}
console.log(failures ? `NG ${failures} 件` : 'すべてOK');
await browser.close();
process.exit(failures ? 1 : 0);
