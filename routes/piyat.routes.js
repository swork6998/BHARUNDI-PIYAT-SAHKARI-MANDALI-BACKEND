import express from 'express';
import { query } from '../config/db.js';
import { isLockedYear, toEnglishDigits, toGujaratiDigits, getYearsUpTo } from '../utils/yearLock.js';

const router = express.Router();

// ૧. તમામ પિયત એન્ટ્રીઓ મેળવો (Server-Side Pagination & Filter by Year)
router.get('/', async (req, res) => {
  const { year, exact_year, season, village_id, is_billed, search, page, limit } = req.query;
  try {
    let whereClauses = ['1=1'];
    const params = [];

    const yearToFilter = exact_year || (year && year !== 'all' ? year : null);
    if (yearToFilter) {
      whereClauses.push('(p.year_name = ? OR p.year_name = ?)');
      params.push(toGujaratiDigits(yearToFilter), toEnglishDigits(yearToFilter));
    }
    if (season && season !== 'all') {
      if (season.includes('ખરીફ') || season.includes('ચોમાસુ')) {
        whereClauses.push('(p.season_name LIKE ? OR p.season_name LIKE ?)');
        params.push('%ખરીફ%', '%ચોમાસુ%');
      } else if (season.includes('રવિ') || season.includes('શિયાળુ')) {
        whereClauses.push('(p.season_name LIKE ? OR p.season_name LIKE ?)');
        params.push('%રવિ%', '%શિયાળુ%');
      } else if (season.includes('ઉનાળુ') || season.includes('જાયદ')) {
        whereClauses.push('(p.season_name LIKE ? OR p.season_name LIKE ?)');
        params.push('%ઉનાળુ%', '%જાયદ%');
      } else {
        whereClauses.push('(p.season_name = ? OR p.season_name LIKE ?)');
        params.push(season, `%${season}%`);
      }
    }
    if (village_id && village_id !== 'all') {
      whereClauses.push('m.village_id = ?');
      params.push(village_id);
    }
    if (is_billed !== undefined && is_billed !== 'all') {
      if (is_billed === 'true' || is_billed === true || is_billed === 'billed') {
        whereClauses.push('p.is_billed = 1');
      } else {
        whereClauses.push('(p.is_billed = 0 OR p.is_billed IS NULL)');
      }
    }
    if (search && search.trim()) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      const sEng = `%${toEnglishDigits(trimmed)}%`;
      const sGuj = `%${toGujaratiDigits(trimmed)}%`;
      whereClauses.push('(p.entry_no LIKE ? OR p.entry_no LIKE ? OR p.bill_no LIKE ? OR p.bill_no LIKE ? OR m.name LIKE ? OR m.member_no LIKE ? OR m.member_no LIKE ? OR p.block_no LIKE ? OR c.name LIKE ? OR v.name LIKE ?)');
      params.push(sEng, sGuj, sEng, sGuj, s, sEng, sGuj, s, s, s);
    }
    const fDate = req.query.from_date || req.query.fromDate;
    const tDate = req.query.to_date || req.query.toDate;
    if (fDate && tDate) {
      whereClauses.push('((COALESCE(p.bill_date, p.entry_date) BETWEEN ? AND ?) OR (p.entry_date BETWEEN ? AND ?) OR (p.bill_date BETWEEN ? AND ?))');
      params.push(fDate, tDate, fDate, tDate, fDate, tDate);
    } else if (fDate) {
      whereClauses.push('(COALESCE(p.bill_date, p.entry_date) >= ? OR p.entry_date >= ? OR p.bill_date >= ?)');
      params.push(fDate, fDate, fDate);
    } else if (tDate) {
      whereClauses.push('(COALESCE(p.bill_date, p.entry_date) <= ? OR p.entry_date <= ? OR p.bill_date <= ?)');
      params.push(tDate, tDate, tDate);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM piyat_entries p 
        LEFT JOIN members m ON p.member_id = m.id 
        LEFT JOIN villages v ON m.village_id = v.id 
        LEFT JOIN crops c ON p.crop_id = c.id 
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
    }

    let sql = `
      SELECT p.*, m.name AS member_name, m.member_no, v.name AS village_name, c.name AS crop_name 
      FROM piyat_entries p 
      LEFT JOIN members m ON p.member_id = m.id 
      LEFT JOIN villages v ON m.village_id = v.id 
      LEFT JOIN crops c ON p.crop_id = c.id 
      ${whereSql}
      ORDER BY p.id DESC
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
    res.status(500).json({ success: false, message: 'પિયત એન્ટ્રી મેળવવામાં ભૂલ: ' + err.message });
  }
});

// ૨. સિંગલ પિયત એન્ટ્રી ઉમેરો
router.post('/single', async (req, res) => {
  const {
    entry_no,
    entry_date,
    year_name,
    season_name,
    member_id,
    block_no,
    crop_id,
    area_vigha,
    water_type,
    pani_count,
    rate,
  } = req.body;

  const targetYear = year_name || '૨૦૨૬-૨૦૨૭';
  if (isLockedYear(targetYear)) {
    return res.status(403).json({
      success: false,
      message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) માં નવી પિયત એન્ટ્રી ઉમેરવાની પરવાનગી નથી. ફક્ત વાંચવા અને પ્રિન્ટની છૂટ છે.`
    });
  }

  const area = Number(area_vigha) || 1;
  const count = Number(pani_count) || 1;
  const r = Number(rate) || 0;
  const base_amount = area * count * r;
  const cess_20 = Math.round(base_amount * 0.20);
  const total_amount = base_amount + cess_20;

  try {
    const result = await query(
      `INSERT INTO piyat_entries (
        entry_no, entry_date, year_name, season_name, member_id, block_no, crop_id, 
        area_vigha, water_type, pani_count, rate, base_amount, cess_20, total_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry_no,
        entry_date || new Date(),
        targetYear,
        season_name,
        member_id,
        block_no,
        crop_id,
        area,
        water_type || 'વહેતા પાણી',
        count,
        r,
        base_amount,
        cess_20,
        total_amount,
        'બિલ બાકી',
      ]
    );

    res.json({ success: true, id: result?.insertId, message: 'પિયત એન્ટ્રી સફળતાપૂર્વક સાચવાઈ ગઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પિયત એન્ટ્રી કરવામાં ભૂલ: ' + err.message });
  }
});

// ૩. મલ્ટી / બેચ પિયત ગ્રીડ એન્ટ્રી (Batch Entry)
router.post('/batch', async (req, res) => {
  const { entries, year_name, season_name } = req.body;

  const targetYear = year_name || '૨૦૨૬-૨૦૨૭';
  if (isLockedYear(targetYear)) {
    return res.status(403).json({
      success: false,
      message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) માં બેચ એન્ટ્રી ઉમેરવાની પરવાનગી નથી. ફક્ત વાંચવા અને પ્રિન્ટની છૂટ છે.`
    });
  }

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ success: false, message: 'કોઈ એન્ટ્રી મોકલેલ નથી.' });
  }

  try {
    for (const item of entries) {
      const area = Number(item.area_vigha) || 1;
      const count = Number(item.pani_count) || 1;
      const r = Number(item.rate) || 0;
      const base_amount = area * count * r;
      const cess_20 = Math.round(base_amount * 0.20);
      const total_amount = base_amount + cess_20;

      await query(
        `INSERT INTO piyat_entries (
          entry_no, entry_date, year_name, season_name, member_id, block_no, crop_id, 
          area_vigha, water_type, pani_count, rate, base_amount, cess_20, total_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.entry_no || Date.now().toString().slice(-5),
          item.entry_date || new Date(),
          targetYear,
          season_name,
          item.member_id,
          item.block_no,
          item.crop_id,
          area,
          item.water_type || 'વહેતા પાણી',
          count,
          r,
          base_amount,
          cess_20,
          total_amount,
          'બિલ બાકી',
        ]
      );
    }

    res.json({ success: true, message: `કુલ ${entries.length} પિયત એન્ટ્રીઓ સફળતાપૂર્વક સાચવાઈ ગઈ!` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'બેચ એન્ટ્રીમાં ભૂલ: ' + err.message });
  }
});

// ૪. પિયત બિલ નંબર જનરેટ કરો (Generate Bills in Batch)
router.post('/generate-bills', async (req, res) => {
  const { year_name, season_name, start_bill_no, bill_date } = req.body;
  const targetYear = year_name || '૨૦૨૬-૨૦૨૭';

  if (isLockedYear(targetYear)) {
    return res.status(403).json({
      success: false,
      message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) માં નવા બિલ જનરેટ કરવાની પરવાનગી નથી.`
    });
  }

  let currentNo = Number(start_bill_no) || 1001;

  try {
    const unbilled = await query(
      'SELECT id FROM piyat_entries WHERE (year_name = ? OR year_name = ?) AND season_name = ? AND is_billed = FALSE ORDER BY id ASC',
      [targetYear, toEnglishDigits(targetYear), season_name]
    );

    if (!unbilled || unbilled.length === 0) {
      return res.json({ success: true, count: 0, message: 'બધા બિલ પહેલેથી જ જનરેટ થયેલા છે.' });
    }

    for (const row of unbilled) {
      await query(
        'UPDATE piyat_entries SET bill_no = ?, bill_date = ?, is_billed = TRUE, status = ? WHERE id = ?',
        [String(currentNo), bill_date || new Date(), 'અંશતઃ બાકી', row.id]
      );
      currentNo++;
    }

    res.json({
      success: true,
      count: unbilled.length,
      message: `કુલ ${unbilled.length} પિયત બિલો સફળતાપૂર્વક જનરેટ થયા! (બિલ નં. ${start_bill_no} થી ${currentNo - 1})`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'બિલ જનરેશનમાં ભૂલ: ' + err.message });
  }
});

// પિયત એન્ટ્રી સુધારો (Update Piyat Entry)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    entry_no,
    entry_date,
    year_name,
    season_name,
    member_id,
    block_no,
    crop_id,
    area_vigha,
    water_type,
    pani_count,
    rate,
    bill_no,
    bill_date,
    status
  } = req.body;

  try {
    const [entry] = await query('SELECT * FROM piyat_entries WHERE id = ?', [id]);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'પિયત એન્ટ્રી મળી નથી.' });
    }
    const targetYear = year_name || entry.year_name;
    if (isLockedYear(targetYear)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) ની પિયત એન્ટ્રીમાં ફેરફાર કરવાની પરવાનગી નથી.`
      });
    }

    const area = Number(area_vigha ?? entry.area_vigha) || 1;
    const count = Number(pani_count ?? entry.pani_count) || 1;
    const r = Number(rate ?? entry.rate) || 0;
    const base_amount = area * count * r;
    const cess_20 = Math.round(base_amount * 0.20);
    const total_amount = base_amount + cess_20;

    await query(
      `UPDATE piyat_entries SET 
        entry_no = COALESCE(?, entry_no),
        entry_date = COALESCE(?, entry_date),
        season_name = COALESCE(?, season_name),
        member_id = COALESCE(?, member_id),
        block_no = COALESCE(?, block_no),
        crop_id = COALESCE(?, crop_id),
        area_vigha = ?,
        water_type = COALESCE(?, water_type),
        pani_count = ?,
        rate = ?,
        base_amount = ?,
        cess_20 = ?,
        total_amount = ?,
        bill_no = ?,
        bill_date = ?,
        status = COALESCE(?, status)
      WHERE id = ?`,
      [
        entry_no,
        entry_date,
        season_name,
        member_id,
        block_no,
        crop_id,
        area,
        water_type,
        count,
        r,
        base_amount,
        cess_20,
        total_amount,
        bill_no ?? entry.bill_no,
        bill_date ?? entry.bill_date,
        status,
        id
      ]
    );

    res.json({ success: true, message: 'પિયત એન્ટ્રી સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પિયત એન્ટ્રી સુધારવામાં ભૂલ: ' + err.message });
  }
});

// પિયત એન્ટ્રી ડિલીટ કરો
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [entry] = await query('SELECT year_name FROM piyat_entries WHERE id = ?', [id]);
    if (entry && isLockedYear(entry.year_name)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${entry.year_name}) ની પિયત એન્ટ્રી ડિલીટ કરવાની પરવાનગી નથી.`
      });
    }
    await query('DELETE FROM piyat_entries WHERE id = ?', [id]);
    res.json({ success: true, message: 'પિયત એન્ટ્રી સફળતાપૂર્વક ડિલીટ કરાઈ.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પિયત એન્ટ્રી ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૫. પિયત અહેવાલ - પાક વાર સારાંશ
router.get('/reports/crop-summary', async (req, res) => {
  const { year, exact_year, season } = req.query;
  try {
    let sql = `
      SELECT c.name AS crop_name, 
             COUNT(p.id) AS total_entries, 
             SUM(p.area_vigha) AS total_area, 
             SUM(p.pani_count) AS total_pani, 
             SUM(p.total_amount) AS total_amount 
      FROM piyat_entries p 
      LEFT JOIN crops c ON p.crop_id = c.id 
      WHERE 1=1
    `;
    const params = [];
    if (exact_year) {
      sql += ' AND (p.year_name = ? OR p.year_name = ?)';
      params.push(exact_year, toEnglishDigits(exact_year));
    } else if (year) {
      const { yearStrings } = getYearsUpTo(year);
      if (yearStrings.length > 0) {
        const ph = yearStrings.map(() => '?').join(',');
        sql += ` AND p.year_name IN (${ph})`;
        params.push(...yearStrings);
      }
    }
    if (season) {
      sql += ' AND p.season_name = ?';
      params.push(season);
    }
    sql += ' GROUP BY c.name';

    const data = await query(sql, params);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'અહેવાલ મેળવવામાં ભૂલ: ' + err.message });
  }
});

export default router;
