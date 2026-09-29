import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: 'backend/.env' });

async function dumpDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'smit6998',
    database: process.env.DB_NAME || 'bharundi_piyat_mandali'
  });

  console.log('Generating complete SQL dump...');
  let sql = `-- ======================================================================================
-- શ્રી ભારૂંડી જૂથ પિયત સહકારી મંડળી લિમિટેડ (Shree Bharundi Group Irrigation Co-op)
-- સંપૂર્ણ ડેટાબેઝ સ્કીમા અને તમામ વર્ષોનો વાસ્તવિક લેગસી ડેટા (Full Schema & All Years Data)
-- જનરેટ તારીખ: ${new Date().toISOString()}
-- ======================================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS \`bharundi_piyat_mandali\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`bharundi_piyat_mandali\`;
\n`;

  const [tables] = await conn.query('SHOW FULL TABLES WHERE Table_Type = "BASE TABLE"');
  for (const tRow of tables) {
    const tableName = Object.values(tRow)[0];
    console.log(`Dumping table: ${tableName}`);
    
    // Create Table DDL
    const [createRes] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
    sql += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
    sql += `${createRes[0]['Create Table']};\n\n`;

    // Data Dump
    const [rows] = await conn.query(`SELECT * FROM \`${tableName}\``);
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      const colList = cols.map(c => `\`${c}\``).join(', ');
      sql += `INSERT INTO \`${tableName}\` (${colList}) VALUES\n`;

      const valRows = rows.map(r => {
        const vals = cols.map(c => {
          const val = r[c];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 1 : 0;
          if (val instanceof Date) {
            return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
          }
          const s = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          return `'${s}'`;
        });
        return `(${vals.join(', ')})`;
      });

      sql += valRows.join(',\n') + ';\n\n';
    }
  }

  sql += `SET FOREIGN_KEY_CHECKS = 1;\n-- END OF BHARUNDI PIYAT MANDALI COMPLETE SQL SCRIPT\n`;

  fs.writeFileSync('bharundi_piyat_schema_and_data.sql', sql, 'utf8');
  fs.writeFileSync('backend/database/bharundi_piyat_schema_and_data.sql', sql, 'utf8');
  console.log('Saved to bharundi_piyat_schema_and_data.sql & backend/database/bharundi_piyat_schema_and_data.sql');

  await conn.end();
}

dumpDatabase().catch(err => {
  console.error('Dump failed:', err);
  process.exit(1);
});
