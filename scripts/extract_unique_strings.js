import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function extract() {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'smit6998', database: 'bharundi_piyat_mandali'
  });

  const targets = [
    { table: 'members', cols: ['name', 'father_name'] },
    { table: 'vouchers', cols: ['debit_account', 'credit_account', 'narration', 'paid_to'] },
    { table: 'cash_receipts', cols: ['narration'] },
    { table: 'piyat_entries', cols: ['season_name', 'block_no', 'water_type'] },
    { table: 'rate_tariff', cols: ['season_name'] },
    { table: 'member_blocks', cols: ['block_no', 'survey_no'] },
    { table: 'villages', cols: ['name', 'taluka', 'district'] },
    { table: 'receipt_books', cols: ['name'] }
  ];

  const uniqueSet = new Set();
  const occurrences = {};

  for (const t of targets) {
    for (const c of t.cols) {
      const [rows] = await conn.query(
        `SELECT DISTINCT \`${c}\` as val FROM \`${t.table}\` WHERE \`${c}\` REGEXP '[^\\x00-\\x7F\\u0A80-\\u0AFF]'`
      );
      for (const r of rows) {
        if (r.val && r.val.trim().length > 0) {
          uniqueSet.add(r.val);
          if (!occurrences[r.val]) occurrences[r.val] = [];
          occurrences[r.val].push(`${t.table}.${c}`);
        }
      }
    }
  }

  const list = Array.from(uniqueSet);
  console.log(`Found ${list.length} unique Akruti strings across all tables.`);

  const outDir = path.join(import.meta.dirname, 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outDir, 'unique_strings.json'), JSON.stringify(list, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'occurrences.json'), JSON.stringify(occurrences, null, 2), 'utf8');
  console.log('Saved to ' + path.join(outDir, 'unique_strings.json'));

  await conn.end();
}

extract();
