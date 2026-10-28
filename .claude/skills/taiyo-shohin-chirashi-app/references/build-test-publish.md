# 確かめ方・公開（チラシ作成（消耗品））

## 1. 用意

新しいセッションでは、リポジトリを足して clone する（`add_repo` → `git clone https://github.com/akamar08taiyo-bot/taiyo-shohin-chirashi /home/user/taiyo-shohin-chirashi` → `register_repo_root`）。
作業の前に `git fetch` して main を見る。`README.md`・`Learnings.md`・`skills/taiyo-flyer-print-safety/SKILL.md` を読む。

## 2. 画面で確かめる

- `fetch()` で `data/*.json` を読むので `file://` では動かない。リポジトリ直下で `python3 -m http.server 5613 --bind 127.0.0.1`。
- Playwright（`/opt/node-tools/node_modules/playwright/index.mjs`）で開く。起動は `chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}})`（日本語のダウンロード名）。
- 価格はリポジトリに無いので、`addInitScript` で架空のカート・価格・meta を入れる（sessionStorage の印で1回だけ）：
  `tss_quote_cart_v1`＝`{商品id: 数量}`、`tsss-price-v1`＝`{prices, qtys, margins, sellPrices: {商品id: 販売単価}, units, bases}`（`assets/pricing.js` の `tssSavePrices` の形）、`tss_quote_meta_v1`（宛名・番号・条件など）。confirm と alert を止める（`page.on('dialog', d => d.accept())`）。
  見本の例：a＝お客様名・番号・合計あり・2行の備考・担当と携帯・手入力1行・小数の単価 2480.5・単価なし1件、b＝空欄・合計なし。
- `window.print` を空にしてから `#btn-print` を押し、`#print-content-holder` の HTML を保存。`#btn-excel` のダウンロードも保存。1366×900 と 390×844 でスクリーンショット。
- チラシの印刷チェック：`node .claude/skills/taiyo-shohin-chirashi-app/scripts/audit-flyers.mjs`（全チラシ × 表示の組み合わせ。Google Fonts だけ通して本物の書体で測る。代わりの書体では印刷が止まる不具合が再現しない）。
  実際の PDF は `page.pdf({preferCSSPageSize: true, printBackground: true})` → `pdfinfo` のページ数と、`pdftotext` で社名の数がページ数と同じか。
- 印刷を変えていないこと：`git show HEAD:quote.html > quote_orig_tmp.html` で前の版も開き、`#print-content-holder` の中身が同じか比べる（あとで一時ファイルは消す）。

## 3. Excel を確かめる（`taiyo-excel-export` スキルの scripts）

1. `validate.py`：ECMA-376 の XSD と、結合セルの重なり・結合の中の値・行の高さ 409pt → ALL VALID / EXCEL CHECKS OK。**結合の重なりは XSD では見つからない**ので必ずこの検査も。
2. `recalc.py`：LibreOffice（UNO）で式を計算し直し、開いた時点の値と比べる（2026-10 は 42式で不一致 0）。
3. 印刷の HTML は Chromium で PDF に、xlsx は `soffice --headless --convert-to pdf` で PDF に。`pdfinfo` でページ数（どちらも2ページだった）、`pdftoppm -r 80 -png` で画像にして左右に並べて見る。
4. Microsoft Excel はこの環境に無いので、見本を会社の Excel で開いてもらう。

## 4. 公開（main → GitHub Pages）

- **main への push は本番の公開。** ユーザーの「公開して」のあとで。作業環境の安全確認で止められたら回り道をしない。
- ファイル名を挙げて `git add`（例：`git add README.md quote.html assets/xlsx.js`）→ 日本語のコミット文と指定の2行 → `git push -u origin main`。
- デプロイの確かめ：github.io はこの作業環境から見えない（curl は 403）。GitHub MCP の `actions_list`（`list_workflow_runs`、owner `akamar08taiyo-bot`、repo `taiyo-shohin-chirashi`、perPage 3）で、
  自分の head_sha の「pages build and deployment」が completed／success になるのを見る（1分ほど）。
- 新しい機能はポータルのタイルの使い方の文（`taiyo-portal/index.html` の `name:'チラシ作成（消耗品）'`）にも足す（`taiyo-portal` スキル）。
- ユーザーへ：スマホ・パソコンで古い画面が出たら、読み込み直し（パソコンは Ctrl+F5）。
