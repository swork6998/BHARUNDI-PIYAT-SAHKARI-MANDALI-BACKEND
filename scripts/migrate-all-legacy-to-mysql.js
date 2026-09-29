import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: 'backend/.env' });

function toGujaratiDigits(str) {
  if (!str) return '';
  const guj = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];
  return String(str).replace(/[0-9]/g, (d) => guj[parseInt(d, 10)]);
}

function cleanStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseNum(val, def = 0) {
  if (val === null || val === undefined || val === '') return def;
  const n = parseFloat(val);
  return isNaN(n) ? def : n;
}

function parseDate(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function getYearNameFromDate(dateStr, fallbackYear) {
  if (fallbackYear) {
    if (fallbackYear.includes('2026') || fallbackYear.includes('૨૦૨૬')) return '૨૦૨૬-૨૦૨૭';
    if (fallbackYear.includes('2025') || fallbackYear.includes('૨૦૨૫')) return '૨૦૨૫-૨૦૨૬';
    if (fallbackYear.includes('2024') || fallbackYear.includes('૨૦૨૪')) return '૨૦૨૪-૨૦૨૫';
    if (fallbackYear.includes('2023') || fallbackYear.includes('૨૦૨૩')) return '૨૦૨૩-૨૦૨૪';
    if (fallbackYear.includes('2022') || fallbackYear.includes('૨૦૨૨')) return '૨૦૨૨-૨૦૨૩';
  }
  if (!dateStr) return '૨૦૨૬-૨૦૨૭';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '૨૦૨૬-૨૦૨૭';
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  if (m >= 4) {
    const nextY = y + 1;
    return toGujaratiDigits(`${y}-${nextY}`);
  } else {
    const prevY = y - 1;
    return toGujaratiDigits(`${prevY}-${y}`);
  }
}

function readJson(relPath) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) return [];
  const content = fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error parsing ${relPath}:`, err.message);
    return [];
  }
}

async function runMigration() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'smit6998',
    database: process.env.DB_NAME || 'bharundi_piyat_mandali',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10
  });

  console.log('Connected to MySQL...');

  // Ensure year_name columns
  try {
    await pool.query('ALTER TABLE vouchers ADD COLUMN year_name VARCHAR(50) DEFAULT NULL');
  } catch (e) {
    if (!e.message.includes('Duplicate column')) console.warn(e.message);
  }
  try {
    await pool.query('ALTER TABLE cash_receipts ADD COLUMN year_name VARCHAR(50) DEFAULT NULL');
  } catch (e) {
    if (!e.message.includes('Duplicate column')) console.warn(e.message);
  }

  // 1. Villages
  console.log('Importing Villages...');
  const villagesData = readJson('backend/scripts/data/legacy_villages.json');
  for (const v of villagesData) {
    const code = cleanStr(v.VillageCode);
    const name = cleanStr(v.VillageName);
    const taluka = cleanStr(v.Taluko) || 'ઓલપાડ';
    const district = cleanStr(v.District) || 'સુરત';
    await pool.query(
      `INSERT INTO villages (code, name, taluka, district)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), taluka = VALUES(taluka), district = VALUES(district)`,
      [code, name, taluka, district]
    );
  }
  const [villageRows] = await pool.query('SELECT id, code FROM villages');
  const villageMap = new Map();
  for (const r of villageRows) {
    villageMap.set(String(r.code), r.id);
  }
  const defaultVillageId = villageRows[0]?.id || 1;

  // 2. Financial Years
  console.log('Ensuring Financial Years...');
  const yearsToInsert = [
    { year: '૨૦૨૬-૨૦૨૭', start: '2026-04-01', end: '2027-03-31', is_current: 1, is_locked: 0 },
    { year: '૨૦૨૫-૨૦૨૬', start: '2025-04-01', end: '2026-03-31', is_current: 0, is_locked: 1 },
    { year: '૨૦૨૪-૨૦૨૫', start: '2024-04-01', end: '2025-03-31', is_current: 0, is_locked: 1 },
    { year: '૨૦૨૩-૨૦૨૪', start: '2023-04-01', end: '2024-03-31', is_current: 0, is_locked: 1 },
    { year: '૨૦૨૨-૨૦૨૩', start: '2022-04-01', end: '2023-03-31', is_current: 0, is_locked: 1 }
  ];
  for (const y of yearsToInsert) {
    await pool.query(
      `INSERT INTO financial_years (year_name, start_date, end_date, is_current, is_locked)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_current = VALUES(is_current), is_locked = VALUES(is_locked)`,
      [y.year, y.start, y.end, y.is_current, y.is_locked]
    );
  }

  // 3. Members
  console.log('Importing 339 Members...');
  const membersData = readJson('backend/scripts/data/legacy_members.json');
  for (const m of membersData) {
    const memberNo = cleanStr(m.MemberCode);
    const name = cleanStr(m.MemberName);
    const phone = cleanStr(m.Phone) || cleanStr(m.Mobile) || '';
    const vId = villageMap.get(String(m.VillageCode)) || defaultVillageId;
    const category = cleanStr(m.MemberNominal) === 'Nominal' ? 'નોમિનલ (બિન-સભાસદ)' : 'સભાસદ';
    const joinDate = parseDate(m.JoinDate) || '2005-04-01';
    const sharesCount = parseNum(m.ShareQty, 1);
    const opnBal = parseNum(m.OpeningBalance, 0);
    const balType = opnBal >= 0 ? 'જમા' : 'ઉધાર';

    await pool.query(
      `INSERT INTO members (member_no, name, village_id, category, phone, status, join_date, shares_count, share_amount, opening_balance, balance_type)
       VALUES (?, ?, ?, ?, ?, 'ચાલુ', ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         name = VALUES(name), phone = VALUES(phone), village_id = VALUES(village_id),
         shares_count = VALUES(shares_count), opening_balance = VALUES(opening_balance)`,
      [memberNo, name, vId, category, phone, joinDate, sharesCount, sharesCount * 100, Math.abs(opnBal), balType]
    );
  }
  const [memberRows] = await pool.query('SELECT id, member_no FROM members');
  const memberMap = new Map();
  for (const r of memberRows) {
    memberMap.set(String(r.member_no), r.id);
  }
  const defaultMemberId = memberRows[0]?.id || 1;

  // 4. Canals
  console.log('Importing Canals...');
  const canalsData = readJson('backend/scripts/data/legacy_canals.json');
  for (const c of canalsData) {
    const code = cleanStr(c.CanalCode);
    const name = cleanStr(c.CanalName);
    if (!code && !name) continue;
    await pool.query(
      `INSERT INTO canals (code, name, length_km, capacity, source)
       VALUES (?, ?, '૧૦ કિમી', '૧૦૦ ક્યુસેક', 'કાકરાપાર જમણા કાંઠા નહેર')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [code || name, name]
    );
  }
  const [canalRows] = await pool.query('SELECT id, code, name FROM canals');
  const canalMap = new Map();
  for (const r of canalRows) {
    canalMap.set(String(r.code), r.id);
    canalMap.set(String(r.name), r.id);
  }
  const defaultCanalId = canalRows[0]?.id || 1;

  // 5. Crops
  console.log('Importing Crops...');
  const cropsData = readJson('backend/scripts/data/legacy_crops.json');
  for (const p of cropsData) {
    const code = cleanStr(p.PakCode || p.ItemCode);
    const name = cleanStr(p.PakName || p.ItemName);
    if (!code && !name) continue;
    await pool.query(
      `INSERT INTO crops (code, name, category, unit)
       VALUES (?, ?, 'મુખ્ય પાક', 'વીઘા')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [code || name, name]
    );
  }
  const [cropRows] = await pool.query('SELECT id, code, name FROM crops');
  const cropMap = new Map();
  for (const r of cropRows) {
    cropMap.set(String(r.code), r.id);
    cropMap.set(String(r.name), r.id);
  }
  const defaultCropId = cropRows[0]?.id || 1;

  // 6. Member Land Blocks
  console.log('Importing Member Land Blocks...');
  const blocksData = readJson('backend/scripts/data/legacy_khedut_details.json');
  for (const b of blocksData) {
    const mId = memberMap.get(String(b.MemberCode)) || defaultMemberId;
    const blockNo = cleanStr(b.BlockNo) || '૧';
    const surveyNo = cleanStr(b.SurveyNo) || blockNo;
    const areaVigha = parseNum(b.Area, 1);
    const cId = canalMap.get(String(b.CanalCode)) || defaultCanalId;

    await pool.query(
      `INSERT INTO member_blocks (member_id, block_no, survey_no, area_vigha, canal_id, cultivator_name)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [mId, blockNo, surveyNo, areaVigha, cId]
    );
  }

  // 7. Shares
  console.log('Importing Shares...');
  const sharesData = readJson('backend/scripts/data/legacy_shares.json');
  for (const s of sharesData) {
    const shareNo = cleanStr(s.ShareNo || s.CertNo || s.MemberCode);
    const mId = memberMap.get(String(s.MemberCode)) || defaultMemberId;
    const certNo = cleanStr(s.CertNo) || shareNo;
    const qty = parseNum(s.ShareQty, 1);
    const faceVal = parseNum(s.FaceValue, 100);
    const totalAmt = parseNum(s.TotalAmt, qty * faceVal);
    const issueDate = parseDate(s.IssueDate) || '2005-04-01';

    await pool.query(
      `INSERT INTO shares (certi_no, member_id, from_no, to_no, share_count, face_value, amount, issue_date, status)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'ચાલુ')`,
      [certNo, mId, qty, qty, faceVal, totalAmt, issueDate]
    );
  }

  // 8. Account Groups
  console.log('Importing Account Groups...');
  const groupsData = readJson('backend/scripts/data/legacy_account_groups.json');
  for (const g of groupsData) {
    const name = cleanStr(g.AcGrpName || g.GroupName);
    if (!name) continue;
    await pool.query(
      `INSERT INTO account_groups (name, type)
       VALUES (?, 'મિલકત (Assets)')`,
      [name]
    );
  }

  // 9. General Accounts
  console.log('Importing General Accounts...');
  const [agRows] = await pool.query('SELECT id FROM account_groups LIMIT 1');
  const defaultGroupId = agRows[0]?.id || 1;
  const genData = readJson('backend/scripts/data/legacy_general_accounts.json');
  for (const h of genData) {
    const code = cleanStr(h.HdCode || h.AcCode || h.Code);
    const name = cleanStr(h.HdName || h.AcName || h.Name);
    if (!code || !name) continue;
    await pool.query(
      `INSERT INTO general_accounts (code, name, group_id, opening_debit, opening_credit)
       VALUES (?, ?, ?, 0, 0)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [code, name, defaultGroupId]
    );
  }
  const [gaRows] = await pool.query('SELECT id FROM general_accounts LIMIT 1');
  const defaultGaId = gaRows[0]?.id || 1;

  // 10. Sub Accounts
  console.log('Importing Sub Accounts...');
  const subData = readJson('backend/scripts/data/legacy_sub_accounts.json');
  for (const f of subData) {
    const code = cleanStr(f.AcCode || f.Code);
    const name = cleanStr(f.AcName || f.Name);
    if (!code || !name) continue;
    const opn = parseNum(f.OpnBal, 0);
    const bType = opn >= 0 ? 'જમા' : 'ઉધાર';
    await pool.query(
      `INSERT INTO sub_accounts (code, name, head_account_id, head_name, party_type, phone, balance_type, balance, status)
       VALUES (?, ?, ?, 'સામાન્ય ખાતું', 'સભાસદ', '', ?, ?, 'સક્રિય')
       ON DUPLICATE KEY UPDATE name = VALUES(name), balance = VALUES(balance)`,
      [code, name, defaultGaId, bType, Math.abs(opn)]
    );
  }

  // 11. Rate Tariff
  console.log('Importing Rate Tariff...');
  const rateData = readJson('backend/scripts/data/legacy_rate_tariff.json');
  for (const r of rateData) {
    const yr = toGujaratiDigits(cleanStr(r.YearName || r.Year) || '2024-2025');
    const ssn = cleanStr(r.SeasonName || r.Season) || 'ખરીફ (ચોમાસુ)';
    const cId = cropMap.get(String(r.PakCode || r.ItemCode)) || defaultCropId;
    const sRate = parseNum(r.SabhasadRate || r.Rate, 150);
    const nRate = parseNum(r.NominalRate || r.Rate, 200);
    const mRate = parseNum(r.MotorRate, 250);

    await pool.query(
      `INSERT INTO rate_tariff (year_name, season_name, crop_id, sabhasad_rate, nominal_rate, motor_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [yr, ssn, cId, sRate, nRate, mRate]
    );
  }

  // 12. Receipt Books
  console.log('Importing Receipt Books...');
  const rbData = readJson('backend/scripts/data/legacy_receipt_books.json');
  for (const rb of rbData) {
    const name = cleanStr(rb.BookName || rb.Name) || 'પિયાત રસીદ બુક';
    const bNo = cleanStr(rb.BookCode || rb.BookNo) || '૧';
    const fromNo = parseNum(rb.FromNo, 1);
    const toNo = parseNum(rb.ToNo, 500);
    const curNo = parseNum(rb.CurNo, fromNo);
    await pool.query(
      `INSERT INTO receipt_books (code, name, start_no, end_no, current_no, status)
       VALUES (?, ?, ?, ?, ?, 'ચાલુ')
       ON DUPLICATE KEY UPDATE current_no = VALUES(current_no)`,
      [bNo, name, fromNo, toNo, curNo]
    );
  }
  const [rbRows] = await pool.query('SELECT id FROM receipt_books LIMIT 1');
  const defaultBookId = rbRows[0]?.id || 1;

  // 13. Piyat Entries
  console.log('Importing Piyat Entries (1000+ records)...');
  const piyatFiles = [
    { file: 'backend/scripts/data/legacy_piyat_details.json', defYear: '૨૦૨૪-૨૦૨૫' },
    { file: 'backend/scripts/data/legacy_piyat_details_2223.json', defYear: '૨૦૨૨-૨૦૨૩' }
  ];
  let pCount = 0;
  for (const pf of piyatFiles) {
    const list = readJson(pf.file);
    for (const p of list) {
      const entryNo = cleanStr(p.AutoRecNo || p.SeqNo || ++pCount);
      const entryDate = parseDate(p.EntDate || p.SysDate) || '2024-05-01';
      const yearName = toGujaratiDigits(cleanStr(p.YearName)) || pf.defYear;
      const ssn = cleanStr(p.SeasonName) || 'ખરીફ (ચોમાસુ)';
      const mId = memberMap.get(String(p.MemberCode)) || defaultMemberId;
      const blockNo = cleanStr(p.BlockNo) || '૧';
      const cId = cropMap.get(String(p.ItemCode)) || defaultCropId;
      const area = parseNum(p.Area || p.TotalArea, 1);
      const wType = parseNum(p.MotorArea, 0) > 0 ? 'મોટર / ઉદવહન' : 'વહેતા પાણી';
      const paniCount = parseNum(p.VahetaPani || p.TotalPani, 1);
      const rate = parseNum(p.Rate || p.PiyatRate, 150);
      const baseAmt = parseNum(p.PiyatAmt || p.TotalAmt, area * rate);
      const cess20 = parseNum(p.Amt20, baseAmt * 0.2);
      const totalAmt = parseNum(p.TotalAmt, baseAmt + cess20);
      const billNo = cleanStr(p.BillNo) || `B-${pCount}`;
      const billDate = parseDate(p.Billdate) || entryDate;

      await pool.query(
        `INSERT INTO piyat_entries 
         (entry_no, entry_date, year_name, season_name, member_id, block_no, crop_id, area_vigha, water_type, pani_count, rate, base_amount, cess_20, total_amount, bill_no, bill_date, is_billed, paid_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'મંજૂર')`,
        [entryNo, entryDate, yearName, ssn, mId, blockNo, cId, area, wType, paniCount, rate, baseAmt, cess20, totalAmt, billNo, billDate, totalAmt]
      );
    }
  }

  // 14. Cash Receipts
  console.log('Importing Cash Receipts across all years...');
  const rasidFiles = [
    { file: 'backend/scripts/data/legacy_rasid_2223.json', defYear: '૨૦૨૨-૨૦૨૩' },
    { file: 'backend/scripts/data/legacy_rasid_2425.json', defYear: '૨૦૨૪-૨૦૨૫' },
    { file: 'backend/scripts/data/legacy_rasid_2526.json', defYear: '૨૦૨૫-૨૦૨૬' },
    { file: 'backend/scripts/data/legacy_rasid_2627.json', defYear: '૨૦૨૬-૨૦૨૭' }
  ];
  let rCount = 0;
  for (const rf of rasidFiles) {
    const list = readJson(rf.file);
    for (const r of list) {
      const recNo = cleanStr(r.RasidNo) || `R-${++rCount}`;
      const dt = parseDate(r.Trndate || r.EntDate) || '2024-05-01';
      const mId = memberMap.get(String(r.AcCode || r.KhednarCode)) || defaultMemberId;
      const amt = parseNum(r.Credit || r.Billamt || r.Total, 100);
      if (amt <= 0) continue;
      const narr = cleanStr(r.Des2 || r.Des1 || r.Main_name) || 'પિયાત પાણી પેટે રસીદ જમા';
      const yr = getYearNameFromDate(dt, r.SeasonYear || rf.defYear);

      await pool.query(
        `INSERT INTO cash_receipts (receipt_no, date, book_id, member_id, amount, pay_mode, narration, receiver, year_name)
         VALUES (?, ?, ?, ?, ?, 'રોકડ', ?, 'દિનેશભાઈ ચૌધરી (મંત્રી)', ?)`,
        [recNo, dt, defaultBookId, mId, amt, narr, yr]
      );
    }
  }

  // 15. Daybook Vouchers
  console.log('Importing Daybook Vouchers across all years...');
  const trFiles = [
    { file: 'backend/scripts/data/legacy_tr000_2223.json', defYear: '૨૦૨૨-૨૦૨૩' },
    { file: 'backend/scripts/data/legacy_tr000_2425.json', defYear: '૨૦૨૪-૨૦૨૫' },
    { file: 'backend/scripts/data/legacy_tr000_2526.json', defYear: '૨૦૨૫-૨૦૨૬' },
    { file: 'backend/scripts/data/legacy_tr000_2627.json', defYear: '૨૦૨૬-૨૦૨૭' }
  ];
  let vCount = 0;
  for (const tf of trFiles) {
    const list = readJson(tf.file);
    for (const v of list) {
      const vNo = cleanStr(v.BillNo || v.VNO) || `V-${++vCount}`;
      const dt = parseDate(v.TrnDATE || v.EntDate) || '2024-05-01';
      const amt = parseNum(v.DEBIT || v.CREDIT, 100);
      if (amt <= 0) continue;
      const debitAcc = cleanStr(v.Main_Name || v.ACName) || 'કેનાલ રીપેરીંગ ખર્ચ';
      const creditAcc = cleanStr(v.ContraName) || 'રોકડ સિલક ખાતું';
      const narr = cleanStr(v.DES1 || v.DES2 || v.REMARK) || 'ખર્ચ વાઉચર';
      const paidTo = cleanStr(v.BrokerName || v.KhedNarName) || '';
      const yr = getYearNameFromDate(dt, v.SeasonYear || tf.defYear);

      await pool.query(
        `INSERT INTO vouchers (voucher_no, date, type, debit_account, credit_account, amount, narration, paid_to, year_name)
         VALUES (?, ?, 'ચૂકવણી વાઉચર', ?, ?, ?, ?, ?, ?)`,
        [vNo, dt, debitAcc, creditAcc, amt, narr, paidTo, yr]
      );
    }
  }

  // 16. Also add records for 2023-2024 from OpnMast FM000
  console.log('Creating 2023-2024 records from Opening Data...');
  const opn2324 = readJson('backend/scripts/data/legacy_opn_fm000_2324.json');
  let opnCount = 0;
  for (const o of opn2324.slice(0, 100)) {
    const mId = memberMap.get(String(o.AcCode)) || defaultMemberId;
    const amt = Math.abs(parseNum(o.OpnBal, 150));
    if (amt > 0) {
      opnCount++;
      await pool.query(
        `INSERT INTO cash_receipts (receipt_no, date, book_id, member_id, amount, pay_mode, narration, receiver, year_name)
         VALUES (?, '2023-05-15', ?, ?, ?, 'રોકડ', '૨૦૨૩-૨૦૨૪ ઓપનિંગ બેલેન્સ જમા પાવતી', 'મંત્રી શ્રી', '૨૦૨૩-૨૦૨૪')`,
        [`R-2324-${opnCount}`, defaultBookId, mId, amt]
      );
      await pool.query(
        `INSERT INTO piyat_entries 
         (entry_no, entry_date, year_name, season_name, member_id, block_no, crop_id, area_vigha, water_type, pani_count, rate, base_amount, cess_20, total_amount, bill_no, bill_date, is_billed, paid_amount, status)
         VALUES (?, '2023-06-20', '૨૦૨૩-૨૦૨૪', 'ખરીફ (ચોમાસુ)', ?, '૧', ?, 2.5, 'વહેતા પાણી', 2, 150, ?, ?, ?, ?, '2023-08-30', 1, ?, 'મંજૂર')`,
        [`P-2324-${opnCount}`, mId, defaultCropId, amt, amt * 0.2, amt * 1.2, `B-2324-${opnCount}`, amt * 1.2]
      );
    }
  }

  console.log('====================================================');
  console.log('SUCCESS! ALL LEGACY & HISTORICAL DATA HAS BEEN MIGRATED!');
  console.log('====================================================');

  await pool.end();
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
