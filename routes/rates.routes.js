import express from 'express';
import { query } from '../config/db.js';
import { isLockedYear, toEnglishDigits } from '../utils/yearLock.js';

const router = express.Router();

// ૧. ઋતુવાર અને વર્ષવાર ભાવ પત્રક મેળવો
router.get('/', async (req, res) => {
  const { year, season, search, page, limit } = req.query;
  try {
    const params = [];
    let whereClauses = [];
    if (year) {
      whereClauses.push('(r.year_name = ? OR r.year_name = ?)');
      params.push(year, toEnglishDigits(year));
    }
    if (season && season !== 'all') {
      if (season.includes('ખરીફ') || season.includes('ચોમાસુ')) {
        whereClauses.push('(r.season_name LIKE ? OR r.season_name LIKE ?)');
        params.push('%ખરીફ%', '%ચોમાસુ%');
      } else if (season.includes('રવિ') || season.includes('શિયાળુ')) {
        whereClauses.push('(r.season_name LIKE ? OR r.season_name LIKE ?)');
        params.push('%રવિ%', '%શિયાળુ%');
      } else if (season.includes('ઉનાળુ') || season.includes('જાયદ')) {
        whereClauses.push('(r.season_name LIKE ? OR r.season_name LIKE ?)');
        params.push('%ઉનાળુ%', '%જાયદ%');
      } else {
        whereClauses.push('(r.season_name = ? OR r.season_name LIKE ?)');
        params.push(season, `%${season}%`);
      }
    }
    if (search && search.trim()) {
      whereClauses.push('(c.name LIKE ? OR c.code LIKE ? OR c.category LIKE ?)');
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM rate_tariff r 
        LEFT JOIN crops c ON r.crop_id = c.id
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
    }

    let sql = `
      SELECT r.*, c.name AS crop_name, c.category AS crop_category, c.unit AS crop_unit 
      FROM rate_tariff r 
      LEFT JOIN crops c ON r.crop_id = c.id
      ${whereSql}
      ORDER BY r.crop_id ASC
    `;

    if (page !== undefined) {
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      sql += ` LIMIT ? OFFSET ?`;
      const data = await query(sql, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(sql, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ભાવ પત્રક મેળવવામાં ભૂલ: ' + err.message });
  }
});

// ૨. ભાવ પત્રક દર સાચવો / અપડેટ કરો
router.post('/', async (req, res) => {
  const { year_name, season_name, crop_id, sabhasad_rate, nominal_rate, motor_rate } = req.body;
  const targetYear = year_name || '૨૦૨૬-૨૦૨૭';

  if (isLockedYear(targetYear)) {
    return res.status(403).json({
      success: false,
      message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) માં ભાવ બદલવાની પરવાનગી નથી. ફક્ત વાંચવા અને પ્રિન્ટની છૂટ છે.`
    });
  }

  try {
    const existing = await query(
      'SELECT id FROM rate_tariff WHERE (year_name = ? OR year_name = ?) AND season_name = ? AND crop_id = ?',
      [targetYear, toEnglishDigits(targetYear), season_name, crop_id]
    );

    if (existing && existing.length > 0) {
      await query(
        'UPDATE rate_tariff SET sabhasad_rate = ?, nominal_rate = ?, motor_rate = ? WHERE id = ?',
        [sabhasad_rate, nominal_rate, motor_rate, existing[0].id]
      );
      res.json({ success: true, message: 'ભાવ સફળતાપૂર્વક અપડેટ થયો!' });
    } else {
      const result = await query(
        'INSERT INTO rate_tariff (year_name, season_name, crop_id, sabhasad_rate, nominal_rate, motor_rate) VALUES (?, ?, ?, ?, ?, ?)',
        [targetYear, season_name, crop_id, sabhasad_rate, nominal_rate, motor_rate]
      );
      res.json({ success: true, id: result?.insertId, message: 'નવા ભાવ સફળતાપૂર્વક સાચવાયા!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'ભાવ સાચવવામાં ભૂલ: ' + err.message });
  }
});

// ૩. પાછલા વર્ષમાંથી ભાવ કોપી અને ટકાવારી વધારો (Copy Rates Feature)
router.post('/copy-previous', async (req, res) => {
  const { from_year, from_season, to_year, to_season, percentage_increase } = req.body;
  const targetYear = to_year || '૨૦૨૬-૨૦૨૭';

  if (isLockedYear(targetYear)) {
    return res.status(403).json({
      success: false,
      message: `લૉક કરેલા વર્ષ (${targetYear}) માં ભાવ કોપી કરવાની પરવાનગી નથી.`
    });
  }

  const pct = Number(percentage_increase) || 0;

  try {
    const oldRates = await query(
      'SELECT * FROM rate_tariff WHERE (year_name = ? OR year_name = ?) AND season_name = ?',
      [from_year, toEnglishDigits(from_year), from_season]
    );

    if (!oldRates || oldRates.length === 0) {
      return res.status(400).json({ success: false, message: 'પાછલા વર્ષ/ઋતુ માટે કોઈ ભાવ રેકોર્ડ મળ્યા નથી.' });
    }

    for (const r of oldRates) {
      const newSabhasad = Math.round(Number(r.sabhasad_rate) * (1 + pct / 100));
      const newNominal = Math.round(Number(r.nominal_rate) * (1 + pct / 100));
      const newMotor = Math.round(Number(r.motor_rate) * (1 + pct / 100));

      const existing = await query(
        'SELECT id FROM rate_tariff WHERE (year_name = ? OR year_name = ?) AND season_name = ? AND crop_id = ?',
        [targetYear, toEnglishDigits(targetYear), to_season, r.crop_id]
      );

      if (existing && existing.length > 0) {
        await query(
          'UPDATE rate_tariff SET sabhasad_rate = ?, nominal_rate = ?, motor_rate = ? WHERE id = ?',
          [newSabhasad, newNominal, newMotor, existing[0].id]
        );
      } else {
        await query(
          'INSERT INTO rate_tariff (year_name, season_name, crop_id, sabhasad_rate, nominal_rate, motor_rate) VALUES (?, ?, ?, ?, ?, ?)',
          [targetYear, to_season, r.crop_id, newSabhasad, newNominal, newMotor]
        );
      }
    }

    res.json({
      success: true,
      message: `ભાવ સફળતાપૂર્વક કોપી કરાયા અને ${pct}% નો વધારો લાગુ કરાયો!`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ભાવ કોપી કરવામાં ભૂલ: ' + err.message });
  }
});

// ૪. ભાવ રેકોર્ડ અપડેટ કરો
router.put('/:id', async (req, res) => {
  const { sabhasad_rate, nominal_rate, motor_rate, year_name } = req.body;
  try {
    const [rateRow] = await query('SELECT * FROM rate_tariff WHERE id = ?', [req.params.id]);
    if (!rateRow) {
      return res.status(404).json({ success: false, message: 'ભાવ રેકોર્ડ મળ્યો નથી.' });
    }
    const targetYear = year_name || rateRow.year_name;
    if (isLockedYear(targetYear)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) માં ભાવ બદલવાની પરવાનગી નથી.`
      });
    }
    await query(
      'UPDATE rate_tariff SET sabhasad_rate = ?, nominal_rate = ?, motor_rate = ? WHERE id = ?',
      [sabhasad_rate, nominal_rate, motor_rate, req.params.id]
    );
    res.json({ success: true, message: 'ભાવ સફળતાપૂર્વક અપડેટ થયો!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ભાવ અપડેટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૫. ભાવ રેકોર્ડ ડિલીટ કરો
router.delete('/:id', async (req, res) => {
  try {
    const [rateRow] = await query('SELECT * FROM rate_tariff WHERE id = ?', [req.params.id]);
    if (!rateRow) {
      return res.status(404).json({ success: false, message: 'ભાવ રેકોર્ડ મળ્યો નથી.' });
    }
    if (isLockedYear(rateRow.year_name)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${rateRow.year_name}) ના ભાવ ડિલીટ કરવાની પરવાનગી નથી.`
      });
    }
    await query('DELETE FROM rate_tariff WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'ભાવ રેકોર્ડ સફળતાપૂર્વક ડિલીટ કરાયો!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ભાવ ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

export default router;
