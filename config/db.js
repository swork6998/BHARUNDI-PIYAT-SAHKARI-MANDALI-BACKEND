import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// MySQL કનેક્શન પુલ સેટઅપ (શુદ્ધ ગુજરાતી UTF8MB4 સપોર્ટ સાથે)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'smit6998',
  database: process.env.DB_NAME || 'bharundi_piyat_mandali',
  charset: 'utf8mb4',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ડેટાબેઝ કનેક્શન ચકાસણી
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ [MySQL Database]: સફળતાપૂર્વક કનેક્ટ થયો! (ડેટાબેઝ: bharundi_piyat_mandali, UTF8MB4)');
    await conn.query('SET NAMES utf8mb4');
    conn.release();
  } catch (err) {
    console.error('❌ [MySQL Database Connection Error]: કનેક્શન નિષ્ફળ:', err.message);
  }
})();

/**
 * ડાયરેક્ટ MySQL ક્વેરી એક્ઝિક્યુટર
 * તમામ ડેટા ફક્ત અને ફક્ત MySQL ડેટાબેઝમાંથી જ આવશે (શૂન્ય સ્ટેટિક ડેટા)
 */
export const query = async (sql, params = []) => {
  try {
    const [results] = await pool.query(sql, params);
    return results;
  } catch (err) {
    console.error('MySQL Query Error:', err.message, '| SQL:', sql);
    throw err;
  }
};

export default pool;
