// 太陽シルバーサービス㈱ 全19営業所マスタ
// 出所: taiyo-office-master スキル。
// 2026-08-27: 自社の「見積書カバー（2025-02-01版）」と照合し、久留米・大分の2件を更新した。
//   久留米 〒838-0814 朝倉郡筑前町高田585-1 → 〒838-0141 小郡市小郡97-19（旧値は本社と同じ住所だった）
//   大分   〒870-0142 大分市三川下2-7-8   → 〒870-0953 大分市下郡東1-4-35
// 残り17営業所はカバーの記載と一致を確認済み。人事異動等で所長名が変わったらここも更新すること。
const TSS_OFFICE_MASTER = [
  { name: '小倉営業所', zip: '802-0011', address: '福岡県北九州市小倉北区重住3丁目11-21', tel: '093-952-1616', fax: '093-952-1627', manager: '森口 賢一' },
  { name: '小倉南営業所', zip: '800-0226', address: '福岡県北九州市小倉南区田原新町1-3-34', tel: '093-474-5670', fax: '093-474-5671', manager: '串山 清彦' },
  { name: '八幡西営業所', zip: '807-0815', address: '福岡県北九州市八幡西区本城東2-4-8', tel: '093-603-3512', fax: '093-601-3593', manager: '福本 浩史' },
  { name: '八幡東営業所', zip: '805-0033', address: '福岡県北九州市八幡東区山路松尾町14-6', tel: '093-654-8515', fax: '093-654-8516', manager: '兼重 陽介' },
  { name: '行橋営業所', zip: '824-0043', address: '福岡県行橋市大字流末1327番地', tel: '0930-26-9640', fax: '0930-26-9641', manager: '久保 匠史', contactName: '久保', mobile: '080-9151-0294' },
  { name: '田川営業所', zip: '826-0042', address: '福岡県田川市大字川宮1200番地', tel: '0947-44-1895', fax: '0947-44-2372', manager: '早崎 勝' },
  { name: '飯塚営業所', zip: '820-0081', address: '福岡県飯塚市枝国510番地7', tel: '0948-52-6360', fax: '0948-52-6362', manager: '佐藤 正仁' },
  { name: '福岡南営業所', zip: '816-0912', address: '福岡県大野城市御笠川2-10-15', tel: '092-504-9810', fax: '092-504-9811', manager: '神谷 大輔' },
  { name: '福岡西営業所', zip: '814-0032', address: '福岡県福岡市早良区小田部4-11-31', tel: '092-833-0131', fax: '092-833-0132', manager: '佐藤 正利' },
  { name: '福岡東営業所', zip: '812-0064', address: '福岡県福岡市東区松田3丁目25-2', tel: '092-627-1150', fax: '092-627-1151', manager: '岡本 将臣' },
  { name: '久留米営業所', zip: '838-0141', address: '福岡県小郡市小郡97-19', tel: '0942-72-8822', fax: '0942-72-8833', manager: '牟田 知広' },
  { name: '大牟田営業所', zip: '837-0924', address: '福岡県大牟田市歴木446-1', tel: '0944-59-1488', fax: '0944-59-1481', manager: '橋本 浩志' },
  { name: '佐賀営業所', zip: '849-0937', address: '佐賀県佐賀市鍋島5丁目4-15', tel: '0952-34-1224', fax: '0952-34-1225', manager: '江原 諒' },
  { name: '長崎営業所', zip: '851-0122', address: '長崎県長崎市界2丁目2-4', tel: '095-834-0535', fax: '095-834-0536', manager: '吉本 幸治' },
  { name: '大村営業所', zip: '856-0844', address: '長崎県大村市溝陸町643-1', tel: '0957-49-6222', fax: '0957-49-6333', manager: '山口 隆史' },
  { name: '壱岐営業所', zip: '811-5117', address: '長崎県壱岐市郷ノ浦町中触1078', tel: '0920-47-9005', fax: '0920-47-9006', manager: '長岡 計治' },
  { name: '熊本営業所', zip: '862-0945', address: '熊本県熊本市東区画図町大字下無田1432-22', tel: '096-377-7630', fax: '096-377-7631', manager: '城戸 健' },
  { name: '熊本北営業所', zip: '861-5517', address: '熊本県熊本市北区鶴羽田1-10-7', tel: '096-341-5765', fax: '096-341-5766', manager: '高木 伸基' },
  { name: '大分営業所', zip: '870-0953', address: '大分県大分市下郡東1-4-35', tel: '097-504-8001', fax: '097-504-8002', manager: '山下 厚' },
];

const TSS_OFFICE_KEY = 'tss_office_v1';
const TSS_DEFAULT_OFFICE = '行橋営業所';

function tssLoadOffice() {
  try {
    const saved = localStorage.getItem(TSS_OFFICE_KEY);
    return TSS_OFFICE_MASTER.find(o => o.name === saved) || TSS_OFFICE_MASTER.find(o => o.name === TSS_DEFAULT_OFFICE);
  } catch (e) {
    return TSS_OFFICE_MASTER.find(o => o.name === TSS_DEFAULT_OFFICE);
  }
}

function tssSaveOffice(name) {
  try { localStorage.setItem(TSS_OFFICE_KEY, name); } catch (e) {}
}

/* ===== 担当者（担当名・携帯番号）=====
   営業所マスタは全社共通の固定値なので画面からは変えられない。
   一方、チラシや見積書に載せる担当者は人によって違うため、
   この端末の設定として保存し、次に開いたときも同じ内容を使う。 */
const TSS_STAFF_KEY = 'tss_staff_v1';

// 未設定なら null を返す。空文字を保存した場合は「担当者なし」として扱いたいので、
// 値が空かどうかではなく、キーがあるかどうかで判定する。
function tssLoadStaff() {
  try {
    const raw = localStorage.getItem(TSS_STAFF_KEY);
    if (raw == null) return null;
    const v = JSON.parse(raw) || {};
    return { name: String(v.name || ''), mobile: String(v.mobile || '') };
  } catch (e) {
    return null;
  }
}

function tssSaveStaff(staff) {
  try {
    localStorage.setItem(TSS_STAFF_KEY, JSON.stringify({
      name: String((staff && staff.name) || '').trim(),
      mobile: String((staff && staff.mobile) || '').trim(),
    }));
  } catch (e) {}
}

// 担当者を設定していればそちらを優先し、未設定なら営業所マスタの値をそのまま使う。
function tssOfficeWithStaff(office) {
  const staff = tssLoadStaff();
  if (!staff) return office;
  return Object.assign({}, office, { contactName: staff.name, mobile: staff.mobile });
}
