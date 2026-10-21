/* 帳票を Excel（.xlsx）で保存するための書き出し器（ビルド不要・外部ライブラリなし）。
   印刷と同じ内容の Excel を、サーバーに送らずにこの端末の中で組み立てる。
   書式・結合セル・計算式・A4 の印刷設定は Office Open XML を直接書き、zip は無圧縮（帳票は小さいので十分）。
   見積・提案書作成（taiyo-mitsumori）・消耗品売上管理の Excel 保存と同じ作り。 */
(function () {
  const MINCHO = 'BIZ UDP明朝 Medium'; // 印刷帳票の BIZ UDPMincho と同じ書体（Windows 10 以降に標準）。無い PC では Excel が近い明朝体で表示する
  const MDW = 10;                       // 標準フォント（BIZ UDP明朝 Medium 11pt）の数字1文字の幅(px)。列幅の mm → Excel の幅 の換算に使う
  const PX_MM = 96 / 25.4;
  const PT_MM = 72 / 25.4;
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const CT = 'application/vnd.openxmlformats-officedocument.';
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  // XML に書けない制御文字を除いてエスケープ
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (c) => { let s = ''; let n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  // 0 始まりの行・列 → "A1"（abs=true で "$A$1"）
  const ref = (r, c, abs) => abs ? `$${colName(c)}$${r + 1}` : `${colName(c)}${r + 1}`;
  const range = (r1, c1, r2, c2, abs) => `${ref(r1, c1, abs)}:${ref(r2, c2, abs)}`;
  const argb = (hex) => 'FF' + String(hex || '000000').replace('#', '').toUpperCase();
  const num = (n) => { const v = Number(n); return isFinite(v) ? String(Number(v.toPrecision(15))) : '0'; }; // Excel と同じ有効15桁
  // mm → Excel の列幅（標準フォントの数字幅単位。パディング込みの値をそのまま書く）
  const colWidth = (mm) => Math.max(0.5, Math.round(mm * PX_MM / MDW * 256) / 256);

  // 文字幅（em）の見積り。列幅と行の高さ（折り返し行数）を決めるのに使う。
  // 半角英数は BIZ UDP明朝 の実際の字幅（0x20〜0x7E、1/100 em）、かなは少し広めに見積もる
  const ASCII_EM = [33, 38, 49, 86, 68, 100, 87, 30, 47, 47, 50, 84, 33, 50, 33, 50, 68, 52, 68, 68, 68, 68, 68, 68, 68, 68, 33, 33, 84, 84, 84, 70, 98, 84, 74, 81, 80, 72, 66, 84, 80, 38, 50, 79, 63, 96, 84, 84, 70, 86, 75, 70, 70, 82, 76, 98, 80, 76, 72, 50, 50, 50, 50, 31, 50, 62, 64, 58, 63, 63, 46, 66, 67, 33, 40, 65, 33, 92, 66, 62, 65, 64, 46, 54, 42, 64, 61, 86, 66, 64, 55, 51, 44, 51, 50];
  const textEm = (s) => {
    let w = 0;
    for (const ch of String(s == null ? '' : s)) {
      const cp = ch.codePointAt(0);
      if (cp >= 0x20 && cp < 0x7f) w += ASCII_EM[cp - 0x20] / 100;
      else if (cp === 0xa5) w += 0.68; // ¥
      else if (cp >= 0xff61 && cp <= 0xff9f) w += 0.5; // 半角カナ
      else if ('（）「」【】・：'.includes(ch)) w += 0.5;
      else if ('、。'.includes(ch)) w += 0.6;
      else if (ch === '　') w += 0.667; // 全角スペース（BIZ UDP明朝 は 2/3 em）
      else if ((cp >= 0x3041 && cp <= 0x30ff)) w += 0.95; // かな（プロポーショナル）
      else w += 1;
    }
    return w;
  };
  // 幅 widthMm のセルに sizePt の文字を折り返したときの行数。
  // 書体が置き換わって列が少し狭く見える PC でも文字が切れないよう、使える幅は1割弱少なめに見積もる
  const lineCount = (text, widthMm, sizePt) => {
    const usable = Math.max(4, (widthMm - 4) * 0.93); // セル内の左右余白・字下げ
    const emMm = sizePt / PT_MM;
    return String(text == null ? '' : text).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(textEm(line) * emMm / usable - 0.02)), 0);
  };
  // 印刷の letter-spacing の代わりにスペースを挟む。0.5em は全角スペース（2/3 em）を「全角2つ＋半角1つ」にすると
  // 字の位置が印刷とそろう。全角スペースのない字の間には半角スペース（1/3 em）を挟む
  const letterSpace = (s, em) => {
    const ch = [...String(s || '')];
    return ch.map((c, i) => {
      if (c === '　') return em >= 0.4 ? '　　 ' : '　 ';
      const next = ch[i + 1];
      return next !== undefined && !/\s/.test(c) && !/\s/.test(next) ? c + ' ' : c;
    }).join('');
  };

  // --- zip（無圧縮）。xlsx は zip なので、各パートを CRC-32 付きでそのまま並べる ---
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipStore(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locals = [], centrals = [];
    let offset = 0;
    Object.keys(files).forEach(name => {
      const nameBytes = enc.encode(name), data = files[name], crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameBytes.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      locals.push(new Uint8Array(lh.buffer), nameBytes, data);
      centrals.push(new Uint8Array(ch.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    });
    const cdSize = centrals.reduce((s, b) => s + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    const n = Object.keys(files).length;
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const parts = locals.concat(centrals, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
    let p = 0;
    parts.forEach(b => { out.set(b, p); p += b.length; });
    return out;
  }

  function createBook() {
    const baseFont = { name: MINCHO, sz: 11 }; // 標準スタイルの書体（列幅の単位もこの書体の数字幅になる）
    const familyOf = (name) => (/明朝|Mincho/i.test(name) ? 1 : 3);
    // --- スタイル（フォント・塗り・罫線・表示形式・配置）を重複なく登録 ---
    const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    const numFmts = [], xfs = [];
    const idx = { font: new Map(), fill: new Map(), border: new Map(), numFmt: new Map(), xf: new Map() };
    const intern = (map, list, key, make) => { if (map.has(key)) return map.get(key); list.push(make()); map.set(key, list.length - 1); return list.length - 1; };
    const fontBody = (f, tagName) => {
      const name = f.name || baseFont.name;
      return (f.b ? '<b/>' : '') + `<sz val="${num(f.sz || baseFont.sz)}"/>` + `<color rgb="${argb(f.color || '000000')}"/>`
        + `<${tagName} val="${esc(name)}"/><family val="${familyOf(name)}"/><charset val="128"/>`;
    };
    const fontId = (f = {}) => intern(idx.font, fonts, JSON.stringify([f.name || '', f.sz || 0, !!f.b, f.color || '']), () => `<font>${fontBody(f, 'name')}</font>`);
    fontId({});
    const fillId = (hex) => (hex ? intern(idx.fill, fills, hex, () => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0);
    // 罫線は { l, r, t, b } に 'thin:93C5FD' のような「線種:色」を指定
    const edge = (tag, spec) => { if (!spec) return `<${tag}/>`; const [st, col] = String(spec).split(':'); return `<${tag} style="${st}"><color rgb="${argb(col || '000000')}"/></${tag}>`; };
    const borderId = (b) => {
      if (!b || !(b.l || b.r || b.t || b.b)) return 0;
      return intern(idx.border, borders, [b.l, b.r, b.t, b.b].join('|'), () => `<border>${edge('left', b.l)}${edge('right', b.r)}${edge('top', b.t)}${edge('bottom', b.b)}<diagonal/></border>`);
    };
    const BUILTIN_FMT = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '@': 49 };
    const numFmtId = (code) => {
      if (!code) return 0;
      if (BUILTIN_FMT[code] !== undefined) return BUILTIN_FMT[code];
      return 164 + intern(idx.numFmt, numFmts, code, () => code);
    };
    // st = { font:{name,sz,b,color}, fill:'RRGGBB', border:{l,r,t,b}, align:{h,v,wrap,indent,shrink}, fmt:'表示形式' }
    const style = (st = {}) => {
      const key = JSON.stringify(st);
      if (idx.xf.has(key)) return idx.xf.get(key);
      const f = fontId(st.font || {}), fl = fillId(st.fill), bd = borderId(st.border), nf = numFmtId(st.fmt);
      const al = st.align || {};
      const alignXml = (al.h || al.v || al.wrap || al.indent || al.shrink)
        ? `<alignment${al.h ? ` horizontal="${al.h}"` : ''}${al.v ? ` vertical="${al.v}"` : ''}${al.wrap ? ' wrapText="1"' : ''}${al.indent ? ` indent="${al.indent}"` : ''}${al.shrink && !al.wrap ? ' shrinkToFit="1"' : ''}/>` : '';
      xfs.push(`<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${bd}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignXml}</xf>`);
      idx.xf.set(key, xfs.length - 1);
      return xfs.length - 1;
    };
    style({}); // 0 番 = 既定

    // --- 共有文字列（リッチテキスト＝1セル内で大きさ・色を変える文字にも対応） ---
    const sst = [], sstIdx = new Map();
    let sstRefs = 0;
    // 先頭・末尾の空白や改行を残すときだけ xml:space="preserve" を付ける（Excel と同じ）
    const tXml = (t) => `<t${/^\s|\s$|[\n\t]/.test(String(t)) ? ' xml:space="preserve"' : ''}>${esc(t)}</t>`;
    const runXml = (run) => `<r><rPr>${fontBody(run.font || {}, 'rFont')}</rPr>${tXml(run.t)}</r>`;
    const stringId = (v) => {
      sstRefs++;
      const key = typeof v === 'string' ? 's:' + v : 'r:' + JSON.stringify(v);
      if (sstIdx.has(key)) return sstIdx.get(key);
      const xml = typeof v === 'string' ? `<si>${tXml(v)}</si>` : `<si>${v.rich.filter(r => r.t !== '' && r.t != null).map(runXml).join('')}</si>`;
      sst.push(xml); sstIdx.set(key, sst.length - 1);
      return sst.length - 1;
    };

    const sheets = [];
    const addSheet = (name, pageOpts = {}) => {
      const ws = {
        name: (String(name || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').trim() || 'Sheet1').slice(0, 31), cols: [], rows: new Map(), merges: [],
        page: Object.assign({ orientation: 'portrait', paper: 9, margins: { l: 15, r: 15, t: 12, b: 12, h: 6, f: 6 }, fitWidth: 1, fitHeight: 0, hCenter: true, printArea: null, printTitles: null }, pageOpts),
      };
      const rowOf = (r) => { if (!ws.rows.has(r)) ws.rows.set(r, { ht: null, cells: new Map() }); return ws.rows.get(r); };
      // 列幅（mm 指定）
      ws.setCols = (mmList) => { ws.cols = mmList.map(colWidth); };
      ws.height = (r, pt) => { rowOf(r).ht = Math.min(409, Math.max(rowOf(r).ht || 0, Math.round(pt * 4) / 4)); }; // Excel の行の高さは 409pt まで
      // 値: 数値 / 文字列 / { rich:[{t,font}] } / { f:'式', v:キャッシュ値 } / null（書式だけ）
      ws.cell = (r, c, v, s) => { rowOf(r).cells.set(c, { v, s: s || 0 }); };
      ws.styleOnly = (r, c, s) => { const row = rowOf(r); const cur = row.cells.get(c); row.cells.set(c, { v: cur ? cur.v : null, s }); };
      // 結合セル：外枠の罫線を周囲のセルに振り分け、塗りは全セルに入れる
      ws.box = (r1, c1, r2, c2, v, st = {}) => {
        const b = st.border || {};
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            const cs = Object.assign({}, st, { border: { l: c === c1 ? b.l : undefined, r: c === c2 ? b.r : undefined, t: r === r1 ? b.t : undefined, b: r === r2 ? b.b : undefined } });
            if (r === r1 && c === c1) ws.cell(r, c, v, style(cs));
            else ws.styleOnly(r, c, style(cs));
          }
        }
        if (r1 !== r2 || c1 !== c2) ws.merges.push(range(r1, c1, r2, c2));
      };
      sheets.push(ws);
      return ws;
    };

    const sheetXml = (ws, sheetIndex) => {
      const rowsSorted = [...ws.rows.keys()].sort((a, b) => a - b);
      let maxR = 0, maxC = 0;
      const sd = rowsSorted.map(r => {
        const row = ws.rows.get(r);
        const cols = [...row.cells.keys()].sort((a, b) => a - b);
        maxR = Math.max(maxR, r);
        const cells = cols.map(c => {
          maxC = Math.max(maxC, c);
          const { v, s } = row.cells.get(c);
          const at = ref(r, c);
          const sa = s ? ` s="${s}"` : '';
          if (v === null || v === undefined || v === '') return `<c r="${at}"${sa}/>`;
          if (typeof v === 'number') return isFinite(v) ? `<c r="${at}"${sa}><v>${num(v)}</v></c>` : `<c r="${at}"${sa}/>`;
          if (typeof v === 'object' && v.f) {
            if (typeof v.v === 'string') return `<c r="${at}"${sa} t="str"><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>`;
            return `<c r="${at}"${sa}><f>${esc(v.f)}</f>${v.v === undefined || v.v === null || !isFinite(Number(v.v)) ? '' : `<v>${num(v.v)}</v>`}</c>`;
          }
          return `<c r="${at}"${sa} t="s"><v>${stringId(v)}</v></c>`;
        }).join('');
        const ht = row.ht ? ` ht="${num(row.ht)}" customHeight="1"` : '';
        return `<row r="${r + 1}"${ht}>${cells}</row>`;
      }).join('');
      const p = ws.page;
      const dim = `<dimension ref="A1:${ref(Math.max(0, maxR), Math.max(0, maxC, ws.cols.length - 1))}"/>`;
      const fit = p.fitWidth || p.fitHeight ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '';
      const views = `<sheetViews><sheetView showGridLines="0"${sheetIndex === 0 ? ' tabSelected="1"' : ''} zoomScale="100" zoomScaleNormal="100" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>`;
      const colsXml = ws.cols.length ? `<cols>${ws.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${num(w)}" customWidth="1"/>`).join('')}</cols>` : '';
      const merges = ws.merges.length ? `<mergeCells count="${ws.merges.length}">${ws.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      const mm2in = (mm) => num(Math.round(mm / 25.4 * 1000) / 1000);
      const m = p.margins;
      const printOpts = p.hCenter ? '<printOptions horizontalCentered="1"/>' : '';
      const pageMargins = `<pageMargins left="${mm2in(m.l)}" right="${mm2in(m.r)}" top="${mm2in(m.t)}" bottom="${mm2in(m.b)}" header="${mm2in(m.h)}" footer="${mm2in(m.f)}"/>`;
      const pageSetup = `<pageSetup paperSize="${p.paper}" orientation="${p.orientation}"${p.fitWidth || p.fitHeight ? ` fitToWidth="${p.fitWidth || 0}" fitToHeight="${p.fitHeight || 0}"` : ''}/>`;
      return XML_HEAD + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">${fit}${dim}${views}<sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${sd}</sheetData>${merges}${printOpts}${pageMargins}${pageSetup}</worksheet>`;
    };

    const toBytes = (meta = {}) => {
      const enc = new TextEncoder();
      const files = {};
      const put = (name, xml) => { files[name] = enc.encode(xml); };
      const ct = [], wbRels = [];
      // [Content_Types].xml を先頭に置く（一部の読み込み側が先頭を期待するため）。中身はシートを書いたあとで決まる
      files['[Content_Types].xml'] = null;
      sheets.forEach((ws, i) => {
        const n = i + 1;
        put(`xl/worksheets/sheet${n}.xml`, sheetXml(ws, i));
        ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="${CT}spreadsheetml.worksheet+xml"/>`);
        wbRels.push(`<Relationship Id="rId${n}" Type="${NS_R}/worksheet" Target="worksheets/sheet${n}.xml"/>`);
      });
      const nS = sheets.length;
      wbRels.push(`<Relationship Id="rId${nS + 1}" Type="${NS_R}/styles" Target="styles.xml"/>`);
      wbRels.push(`<Relationship Id="rId${nS + 2}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/>`);
      // 印刷範囲・印刷タイトル（各ページに繰り返す見出し行）
      const names = [];
      sheets.forEach((ws, i) => {
        const p = ws.page, sh = `'${ws.name.replace(/'/g, "''")}'`;
        if (p.printArea) names.push(`<definedName name="_xlnm.Print_Area" localSheetId="${i}">${esc(sh + '!' + range(p.printArea[0], p.printArea[1], p.printArea[2], p.printArea[3], true))}</definedName>`);
        if (p.printTitles) names.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${esc(sh + `!$${p.printTitles[0] + 1}:$${p.printTitles[1] + 1}`)}</definedName>`);
      });
      // スタイル・共有文字列はシートの XML を作る途中で登録されるので、シートのあとに書き出す
      put('xl/styles.xml', XML_HEAD + `<styleSheet xmlns="${NS_MAIN}">`
        + (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((code, k) => `<numFmt numFmtId="${164 + k}" formatCode="${esc(code)}"/>`).join('')}</numFmts>` : '')
        + `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`
        + `<fills count="${fills.length}">${fills.join('')}</fills>`
        + `<borders count="${borders.length}">${borders.join('')}</borders>`
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
        + '<cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>');
      put('xl/sharedStrings.xml', XML_HEAD + `<sst xmlns="${NS_MAIN}" count="${sstRefs}" uniqueCount="${sst.length}">${sst.join('')}</sst>`);
      put('xl/workbook.xml', XML_HEAD + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>`
        + `<sheets>${sheets.map((ws, i) => `<sheet name="${esc(ws.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
        + (names.length ? `<definedNames>${names.join('')}</definedNames>` : '')
        + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
      put('xl/_rels/workbook.xml.rels', XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`);
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      put('docProps/core.xml', XML_HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        + `<dc:title>${esc(meta.title || '')}</dc:title><dc:creator>${esc(meta.creator || '')}</dc:creator>`
        + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
      put('docProps/app.xml', XML_HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application></Properties>');
      put('_rels/.rels', XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>`
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        + `<Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
      put('[Content_Types].xml', XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + `<Override PartName="/xl/workbook.xml" ContentType="${CT}spreadsheetml.sheet.main+xml"/>`
        + `<Override PartName="/xl/styles.xml" ContentType="${CT}spreadsheetml.styles+xml"/>`
        + `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT}spreadsheetml.sharedStrings+xml"/>`
        + ct.join('')
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        + `<Override PartName="/docProps/app.xml" ContentType="${CT}extended-properties+xml"/></Types>`);
      return zipStore(files);
    };

    return { style, addSheet, toBytes };
  }

  // ファイルとして保存（ブラウザのダウンロード）
  function download(bytes, filename) {
    const blob = new Blob([bytes], { type: CT + 'spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  window.TssXlsx = { MINCHO, PT_MM, createBook, textEm, lineCount, letterSpace, ref, range, download };
})();
