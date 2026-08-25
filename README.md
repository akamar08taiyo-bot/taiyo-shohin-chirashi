# 消耗品チラシ（太陽シルバーサービス㈱ 行橋営業所）

施設・病院・事業所さま向けの業務用消耗品カタログチラシです。ビルド不要の素のHTML＋バニラJSで、GitHub Pagesでそのまま配信します。

公開先: https://akamar08taiyo-bot.github.io/taiyo-shohin-chirashi/

## 構成

```
index.html          一覧ページ
kao-rocket.html      花王・ロケット石鹸（全11ページ・44商品）
japacks.html         ジャパックス（全8ページ・32商品）
paper.html            紙製品（全4ページ・16商品）
price-calc.html       価格・単価計算シート（社内用）
assets/
  design.css          デザイントークン・A4ページのCSS（794×1123px = A4 @96dpi）
  flyer-render.js      data/ からページを組み立てる共通レンダラー
  pricing.js           単価計算ロジック（localStorage 共有）
data/
  products.json         商品マスター（92商品。出所: design_handoff_flier/product-master.json）
  pages.json            ページ構成（見出し・リード文・サイズ展開欄・注記。3つの元 .dc.html から抽出）
  price-rows.json       価格計算シート用の行データ（容量・入数を商品マスターから自動導出）
images/
  kao/ rocket/ japacks/ daio/ bews/   商品写真（メーカー公式画像）
```

データとテンプレートを分離しているため、**HTMLを増やさず** `data/*.json` の編集だけで内容を更新できます。

## 商品・ページの追加や修正

- 商品を追加・修正する: `data/products.json` に1件追加（`flier` と `page` は既存の値と完全一致させる）。画像は `images/<メーカー>/` に配置し `image` に相対パスを書く。
- ページ（見出し・リード文・サイズ展開欄・注記）を追加・修正する: `data/pages.json` の該当 `pages[]` を編集。
- 1ページに4商品ちょうど（ルール）。過不足があると空欄またはグリッドが崩れるので確認する。
- 価格を入力する: `price-calc.html` で仕入価格を入力すると、利益率20%（変更可）を基準に販売金額を自動計算する。利益率または金額を直接編集すればもう片方を逆算する。ブラウザの `localStorage`（キー `tsss-price-v1`）に保存され、各チラシページの「価格表示（社内用）」をONにするとその場に反映される。他の端末には自動同期されない。
- 掲載商品を差し替える: 各チラシページの「商品を編集」をONにすると、カードごとに「商品を変更」ボタンが出る。押すと全92商品から検索（商品名・メーカー）／場所（ページ分類）／メーカーで絞り込んで選べる。差し替えは `localStorage`（キー `tss_chirashi_composition_v1`）にページ単位で保存され、ページの「おすすめ構成に戻す」で元の構成に戻せる。印刷・PDF保存時は編集用のボタンは表示されない。

## ローカル確認

ビルド不要。ただし `fetch()` で `data/*.json` を読むため、`file://` では動かない。簡易サーバーを立てて確認する。

```bash
npx serve .
# または
python -m http.server 8080
```

## デプロイ

```bash
rtk git add -A
rtk git commit -m "内容の要約"
rtk git push
```

main ブランチ直下を GitHub Pages で配信する設定。反映は push 後1〜3分。確認は Ctrl+F5（スーパーリロード）で。

## 由来・データの出典

`design_handoff_flier`（Claude Design由来の引き継ぎ資料）から機械抽出・移植しました。デザイン（配色・寸法・書体）は元の `.dc.html` に忠実です。掲載ルール（1ページ4商品、写真高さ統一、公式画像のみ使用、不明情報は「未確認」と明記）は踏襲しています。

`code` に「未確認」を含む項目、`price-rows.json` で容量が空欄の項目は、メーカー公式カタログでの照合待ちです。推測値は入れていません。
