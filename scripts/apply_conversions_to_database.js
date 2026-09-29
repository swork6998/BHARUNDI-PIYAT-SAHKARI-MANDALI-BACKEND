import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function updateDatabase() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'smit6998',
    database: 'bharundi_piyat_mandali'
  });

  const raw = fs.readFileSync(path.join(import.meta.dirname, 'data/converted_dict.json'), 'utf8').replace(/^\uFEFF/, '');
  const dict = JSON.parse(raw);
  const occurrences = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'data/occurrences.json'), 'utf8'));

  console.log(`Loaded ${Object.keys(dict).length} dictionary entries.`);

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

  const stats = {};
  for (const t of targets) {
    stats[t.table] = 0;
  }

  // Disable autocommit for transactional safety or update in batches
  await conn.beginTransaction();

  try {
    for (const [rawKey, convertedVal] of Object.entries(dict)) {
      if (!rawKey || rawKey === convertedVal) continue;

      const whereList = occurrences[rawKey] || [];
      for (const loc of whereList) {
        const [table, col] = loc.split('.');
        const [res] = await conn.query(
          `UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` = ?`,
          [convertedVal, rawKey]
        );
        if (res.affectedRows > 0) {
          stats[table] += res.affectedRows;
        }
      }
    }

    await conn.commit();
    console.log('\n=== DATABASE UPDATE COMPLETED SUCCESSFULLY ===');
    for (const [table, count] of Object.entries(stats)) {
      console.log(`Table ${table}: ${count} rows updated.`);
    }
  } catch (err) {
    await conn.rollback();
    console.error('Error during database update, transaction rolled back:', err);
  } finally {
    await conn.end();
  }
}

updateDatabase();
