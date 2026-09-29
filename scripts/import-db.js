import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const password = process.env.DB_PASSWORD || 'smit6998';
  console.log('Connecting to MySQL on localhost:3306 with UTF-8...');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: password,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  console.log('Connected! Creating database and inserting all Gujarati seed data...');
  const sqlPath = path.resolve(__dirname, '../../bharundi_piyat_schema_and_data.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  await conn.query('SET NAMES utf8mb4;');
  await conn.query('SET CHARACTER SET utf8mb4;');
  await conn.query(sql);

  const [tables] = await conn.query('SHOW TABLES FROM bharundi_piyat_mandali;');
  console.log(`✅ Success! Created ${tables.length} tables in bharundi_piyat_mandali:`);

  const [members] = await conn.query('SELECT member_no, name, phone, village_id FROM bharundi_piyat_mandali.members LIMIT 3;');
  console.log('Sample Member records from MySQL:');
  console.table(members);

  await conn.end();
  console.log('MySQL Database setup completed successfully!');
}

run().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
