import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function importDatabase() {
    const host = process.env.DB_HOST;
    const port = Number(process.env.DB_PORT) || 3306;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;
    const useSsl = process.env.DB_SSL === 'true';

    console.log(`Connecting to ${host}:${port} as ${user} for database '${database}'...`);

    let connection;
    try {
        connection = await mysql.createConnection({
            host,
            port,
            user,
            password,
            database,
            multipleStatements: true,
            ssl: useSsl ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined
        });
        console.log('✅ Connection successful!');

        const sqlFilePath = path.join(__dirname, '..', '..', 'bharundi_piyat_schema_and_data_utf8.sql');
        if (!fs.existsSync(sqlFilePath)) {
            throw new Error(`SQL file not found at: ${sqlFilePath}`);
        }

        console.log('Reading SQL file...');
        let sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        sqlContent = sqlContent.replace(/^\uFEFF/, '');

        console.log('Importing schema and data into database... (this may take a few moments)');
        await connection.query(sqlContent);

        const [tables] = await connection.query('SHOW TABLES');
        console.log(`🎉 Import completed successfully! Total tables in database: ${tables.length}`);
    } catch (err) {
        console.error('❌ Import failed:', err.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

importDatabase();
