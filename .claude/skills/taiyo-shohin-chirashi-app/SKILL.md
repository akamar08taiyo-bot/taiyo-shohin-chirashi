---
name: taiyo-shohin-chirashi-app
description: 太陽シルバーサービスの業務アプリ「チラシ作成（消耗品）」（病院・施設向け消耗品のチラシ・御見積書・表紙。リポジトリ akamar08taiyo-bot/taiyo-shohin-chirashi、公開は https://akamar08taiyo-bot.github.io/taiyo-shohin-chirashi/ 、太陽ポータルのタイル）を直す・機能を足す・公開するときに必ず使う。メーカー別・用途別のチラシ（1ページ4商品・A4）、自作チラシ（custom.html）、商品の差し替え、見積（quote.html の御見積書・印刷 / PDF保存・📗 Excelで保存・施設ごとの保存）、表紙（cover.html）、価格表（price-calc.html・利益率）、商品データ（data/products.json・JAN・入数・公式画像）の話が出たら、アプリ名を言われなくても使う。ビルドのない静的サイトの直し方、validate.cjs、印刷と Excel を同じデータ（quoteDoc）から作る仕組み、Excel の作り（buildQuoteXlsx・assets/xlsx.js）、確かめ方、公開とデプロイの確かめ方、まだ決まっていないこと（合計の小数）がまとまっている。ケアマネ向けの「チラシ作成（レンタル）」は別のリポジトリ taiyo-chirashi。quote.html の画面の見出しは「見積・提案書作成」でも、ポータルの「見積・提案書作成」（taiyo-mitsumori）とは別のアプリ（URL や「← メインメニューへ」で見分ける）。
---

# チラシ作成（消耗品）（taiyo-shohin-chirashi）

病院・施設向けの業務用消耗品について、カタログチラシ・御見積書・表紙を作るアプリ。使うのは営業所の営業担当、依頼してくるのは行橋営業所の担当者（プログラマーではない。パソコンとスマホ）。
発行する営業所は19営業所から選べる（`assets/offices.js`、初めは行橋営業所）。
このスキルは 2026年10月のセッション（御見積書を Excel でも保存できるようにした・価格＋品番で印刷が止まる不具合を直し「ロケット石鹸のみ」を足した 10-28）までの知識をまとめたもの。

ポータル全体に共通のこと（公開の流れ・ユーザーの好み・報告のしかた）は `taiyo-portal` スキル、Excel の作り方と確かめ方の詳しいことは `taiyo-excel-export` スキルにある（入っていれば一緒に読む）。

## まず全体をつかむ

| もの | 場所 |
|---|---|
| リポジトリ | `akamar08taiyo-bot/taiyo-shohin-chirashi`（**public**、main）。ビルドなし（素の HTML とバニラ JS）。package.json も自動テストもない |
| 作業の前に読む | `README.md`・`Learnings.md`（32項目の知見）・`skills/taiyo-flyer-print-safety/SKILL.md`（チラシ印刷の決まり。`.claude/skills` ではないので自動では読まれない） |
| 公開 | main に push → GitHub Pages（main 直下）。ポータルのタイル `name:'チラシ作成（消耗品）'` はこの URL を開くだけ（ポータルにはコピーしない。push が要るのはタイルの文を変えるときだけ） |
| 取り違えない | ポータルの「チラシ作成（レンタル）」は別のリポジトリ `taiyo-chirashi`（ケアマネジャー様向け）。「見積・提案書作成」は別のアプリ（taiyo-mitsumori）。quote.html の画面の見出しも「見積・提案書作成」なので注意 |

## 画面

- メインメニュー（`index.html`）：営業所と担当者名・携帯を設定し、4つから選ぶ。
  チラシ → `flyers.html`（メーカー別・用途別・おすすめの組み合わせ）→ 各チラシ（`kao-rocket.html` など・`omakase*.html`＝おすすめの組み合わせ9パターン、`omakase14` は「ロケット石鹸のみ」で6用途・20ページ）か、自分で4点選ぶ `custom.html`／見積 → `quote.html`／表紙 → `cover.html`（A4横。`covers.html` は表紙チラシ15パターン）／価格表 → `price-calc.html`（社内用）。
- `quote.html`：タブ「商品を選ぶ」（検索・メーカーの絞り込み・チェック。チラシの「見積に追加」も同じカート）と「見積書を確認・印刷」（宛名・帳票タイトル・番号・条件・担当・携帯・備考・明細。手入力の行も足せる。
  「合計金額を印刷する」は初めオフ。施設名を付けて保存）。上のボタン：📘表紙をつくる／印刷 / PDF保存／📗 Excelで保存／見積をクリア。
- 価格はリポジトリに**無い**（public だから）。各端末の localStorage（`tsss-price-v1`）だけ。ほかのキー：`tss_quote_cart_v1`・`tss_quote_meta_v1`・`tss_quote_saved_v1`・`tss_office_v1`・`tss_staff_v1`・`tss_chirashi_composition_v1`、sessionStorage `tss_chirashi_tempSell_v1`。
- データ：`data/products.json`（849件。README の「412」は古い）・`data/price-rows.json`・`data/pages.json`。`assets/pricing.js`（カート・価格・`tssFmtYen`）・`assets/flyer-render.js`。
  `assets/vendor/xlsx.full.min.js`（SheetJS）は price-calc.html の価格一覧の読み書きだけに使う（見積の Excel とは別物）。

## 見積書：印刷と Excel は同じデータから（`quote.html`）

- `quoteDoc()`：印刷と Excel が使う共通のデータ `{groups, subtotal, tax=Math.round(subtotal*0.1), total=subtotal+tax, today, office, dateStr, customerName, title, showTotal}`。条件・番号・担当・備考は両方とも `meta` から直接読む。
  **片方だけ直さない。**
- `perBasis()`：`{label, value, content, basis}`（content・basis は単価の内訳の式に使う）。`computedRows()`：単価は `meta.priceOverrides` か `tssSellOf()`、丸めない（画面の単価欄だけ `Math.round` した文字）。`computedGroups()`：メーカー順、手入力は「その他」として最後。
- 印刷 `#btn-print`：`#print-content-holder` に帳票の HTML を入れて `window.print()`。A4縦・余白0、`.doc` の内側の余白 11mm・幅182mm、書体 BIZ UDPMincho。
- Excel `buildQuoteXlsx(d)` → `#btn-excel` で `TssXlsx.download()`。ファイル名 `題名_お客様名_YYYY-MM-DD.xlsx`（お客様名が空なら省く。`\/:*?"<>|` と改行は `_`）。
  - 頭・帯・下の枠を印刷と同じ位置（横 mm、縦 pt）に `put()` で置く。列は表の列（colgroup 34/7/8/15/18/18%）を先に取り、ほかの枠の境目を足す（2mm より近い境目はまとめる）。行は `layBlock()` で縦の境目から作る（**0.3pt** より近い境目はまとめる）。1つの枠は結合セル。
  - 1商品は2行：品名・数量・単位・単価・金額のセルは2行を結合し、単価の内訳の列だけ上の行に「100mLあたり」、下の行にその単価（式）。式：金額 `IF(ISNUMBER(単価),数量*単価,"—")`・内訳 `単価/(content/basis)`・メーカー小計 `SUM`・小計 `SUM(全金額)`・消費税 `ROUND(小計*0.1,0)`・合計 小計＋消費税。表示形式 `"￥"#,##0`。
  - 帯・小計・合計は showTotal のときだけ。印刷設定：A4縦、余白 左右14mm・上下11mm、横1ページ、印刷範囲つき。
- `assets/xlsx.js`（`window.TssXlsx`）：`MINCHO:'BIZ UDP明朝 Medium'`・`PT_MM`・`createBook`（`ws.setCols(mm[])`・`ws.height(r,pt)`＝409pt まで・同じ行は大きい方・`ws.box()`＝結合と外枠の罫線の振り分け・`ws.page`＝paper 9・余白・fitWidth/fitHeight・hCenter・printArea・printTitles）・
  `textEm`・`lineCount`（使える幅 93%）・`letterSpace`・`ref`・`range`・`download`。値は 数値・文字列・`{rich:[{t,font}]}`・`{f,v}`・null。zip は自前（無圧縮＋CRC-32、外部ライブラリなし）。`fullCalcOnLoad="1"`。

## 直すときの決まり（README・Learnings）

- 変えたら `node validate.cjs`（読むだけの検査：id の重複・price-rows との対応・JAN のチェックデジット・未確認情報・画像の実在・**1ページ4商品ちょうど**）。
  `node audit-images.cjs --compact` は sharp を依頼者の Windows のパス（`C:/Users/…`）から読むので Linux では止まる → sharp を一時フォルダに入れ、読み込み先を書き換えた一時コピーで動かし、あとで消す。
- ピッカー専用の商品（pages.json に無いページ名、`fixedFlyer:false`）を誤りだと思って直さない（直すと1ページ5商品になって崩れる）。推測でデータを埋めない。写真は公式の画像だけ。
- データ・CSS・描画のコードを変えたら、全ページの `?v=` を上げる（上げ忘れると利用者のブラウザに古いファイルが残る。quote.html の xlsx.js・pricing.js・offices.js の読み込みには今は `?v=` が無い。offices.js は covers.html だけ付いている）。
- 価格・お客様のデータはリポジトリに入れない（`.gitignore` で *.xlsx・*.csv を外している）。テストは架空の価格とお客様名を localStorage に入れる。
- テストでは confirm と alert の両方を止める（止め忘れるとタブごと固まる）。印刷帳票の高さは、いちばん長くなる場合（メーカーが多い・合計あり）で測る。
- コメントは日本語で「なぜ」を書く。一時ファイル（`_audit_tmp.cjs`・`quote_orig_tmp.html` など）を残さない。`git add -A` を使わず、ファイル名を挙げて add する（README の `rtk git …` は依頼者の Windows での書き方）。

確かめ方・公開の手順は `references/build-test-publish.md`。

## チラシの写真枠と印刷のチェック（`assets/flyer-render.js`）

- `tssFitPhotos(mount)`：ページごとに4枚の写真枠を同じだけ広げる（本文に12px以上の余り）／縮める（本文がはみ出すとき。最小80px）。`renderAll` のたびと `document.fonts.ready` のあと、印刷ボタンの直後に走る。
  余りは `tssCardSlack(card)`（品番行は margin-top:auto なので説明文との間に余りが集まる・品番なしなら本文の下）。CSS の写真枠は `flex: 0 0 auto`（勝手に縮まない）。
- 印刷の前のチェック（`runPrintFlow`）：画像の読み込み・1ページ4枚・社名・本文のはみ出し・ページのはみ出し。どれかで止めて alert。custom.html にも同じチェックがある（写真枠の自動合わせは無い。写真170px固定で、文字の多い商品でも収まるのを確かめた）。
- おすすめの組み合わせ：`randomSample`（`max`・`preferMakers`・`onlyMakers`・`alwaysInclude`・`pricedOnly`）。`tssPickRandom` と `validate.cjs` の `randomSampleSafeCount` の前でしぼる。`onlyMakers` のパターンに商品0件の用途を入れると validate が誤りにする。
- 検査：`scripts/audit-flyers.mjs`（全チラシ × 価格・品番・チェック欄・金額を編集。Google Fonts だけ通して本物の書体で測る）。

## 落とし穴（2026-10 にあったこと）

- **印刷が止まるのに作業環境では再現しない**（10-28）：価格＋品番で本文が 8.5px はみ出し「1ページに4商品と社名を安全に収められない」。Noto Sans JP（Google Fonts）が読み込まれた端末だけで起きる。
  Playwright の `chromium.launch({proxy:{server: process.env.HTTPS_PROXY, bypass:'127.0.0.1,localhost'}})` で fonts.googleapis.com・fonts.gstatic.com だけ通すと再現する。19種のうち9種で起きていた → 写真枠を縮めて直した。
- ロケット石鹸の「12 ボディソープ」23点・「13 ビューティ/オーラルケア」14点が、どの用途にも入っていなかった（2026-10-28 に YT07 入浴・ボディケアへ足した。ユーザーの「はい」）。
  yoto（用途別）は総数が4の倍数でないとチラシ全体が止まる（737件になった）ので、yoto だけ `excludeIds: [878]`（animo ヤシの実石鹸 80g×2P。同じ石鹸の3Pは載る）で736件にした。
  **用途に分類を足す・商品を足すときは、yoto の総数が4の倍数か `node validate.cjs` で確かめる。**

- 結合セルが重なった（J17:Q17 と J17:Q18）：`layBlock` が 1pt より近い境目をまとめていて、0.75pt 違いの境目が1つになった → 0.3pt に（どの枠も 0.3pt より高い）。**XSD の検査では見つからず、結合の重なりの検査で見つかった。**
- 備考の左の太い線は、印刷では横の合計の欄の下まで伸びる → Excel にも線だけの枠を足した。
- スマホで上のボタン4つの文字が細切れ → `.actions{flex-wrap:wrap}` で2段に。
- `assets/xlsx.js` の正規表現に U+FFFE・U+FFFF が文字そのもので入っている（動くが、直すなら `\uFFFE\uFFFF`）。

## これから（2026-10-21 の時点）

1. **合計の小数**：印刷と画面では「￥60,413.5」、Excel では「￥60,414」と出る（合計を丸めずに表示している。小計は丸める）。円単位にそろえるかユーザーに3回聞いて返事待ち。
   直すなら `quoteDoc`・`renderTotals`・印刷・Excel をいっしょに。
2. 会社の Excel で見本を開いて警告が出ないかの確認（返事待ち）。ポータルのタイルの使い方の文に Excel 保存がまだない。
3. 表紙と価格表は Excel 保存の対象にしていない（聞いていない）。
4. main に入っていない以前のブランチが3本（`claude/save-share-contacts-flyers-wlrt3h`・`claude/debug-and-verification-9tzg5s`・`claude/app-comprehensive-debug-c9srvh`。壱岐営業所の住所など）と、開いたままの PR が2つ（#1 audit-images の sharp の読み込み先の直し、#2 見積の単価・住所）。
   扱いは未定。#1 が入れば、audit-images のための sharp の回り道は要らなくなる。
