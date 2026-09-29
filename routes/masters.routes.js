import express from 'express';
import { query } from '../config/db.js';
import { refreshYearLockCache } from '../utils/yearLock.js';

const router = express.Router();

// ૧. વર્ષ માસ્ટર (Server Pagination & Search)
router.get('/years', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE year_name LIKE ?';
      params.push(`%${search.trim()}%`);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM financial_years ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM financial_years ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM financial_years ${whereSql} ORDER BY id DESC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વર્ષ મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/years', async (req, res) => {
  const { year_name, start_date, end_date, is_current, is_locked } = req.body;
  try {
    const isCurr = is_current ? 1 : 0;
    const isLock = is_locked !== undefined ? (is_locked ? 1 : 0) : (isCurr ? 0 : 1);

    if (isCurr) {
      await query('UPDATE financial_years SET is_current = 0, is_locked = 1');
    }

    const result = await query(
      'INSERT INTO financial_years (year_name, start_date, end_date, is_current, is_locked) VALUES (?, ?, ?, ?, ?)',
      [year_name, start_date, end_date, isCurr, isLock]
    );
    await refreshYearLockCache();
    res.json({ success: true, id: result?.insertId, message: 'નવું નાણાકીય વર્ષ સફળતાપૂર્વક ઉમેરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વર્ષ ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/years/:id', async (req, res) => {
  const { year_name, start_date, end_date, is_current, is_locked } = req.body;
  try {
    const isCurr = is_current ? 1 : 0;
    const isLock = is_locked !== undefined ? (is_locked ? 1 : 0) : (isCurr ? 0 : 1);

    if (isCurr) {
      await query('UPDATE financial_years SET is_current = 0, is_locked = 1 WHERE id != ?', [req.params.id]);
    }

    await query(
      'UPDATE financial_years SET year_name = ?, start_date = ?, end_date = ?, is_current = ?, is_locked = ? WHERE id = ?',
      [year_name, start_date, end_date, isCurr, isLock, req.params.id]
    );
    await refreshYearLockCache();
    res.json({ success: true, message: 'વર્ષ વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વર્ષ સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.put('/years/:id/set-current', async (req, res) => {
  try {
    const { id } = req.params;
    await query('UPDATE financial_years SET is_current = 0, is_locked = 1');
    await query('UPDATE financial_years SET is_current = 1, is_locked = 0 WHERE id = ?', [id]);
    await refreshYearLockCache();
    const [updated] = await query('SELECT * FROM financial_years WHERE id = ?', [id]);
    res.json({
      success: true,
      data: updated,
      message: `${updated?.year_name} ને ચાલુ સક્રિય વર્ષ બનાવવામાં આવ્યું!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ચાલુ વર્ષ સેટ કરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/years/:id/toggle-lock', async (req, res) => {
  try {
    const { id } = req.params;
    const [yr] = await query('SELECT * FROM financial_years WHERE id = ?', [id]);
    if (!yr) {
      return res.status(404).json({ success: false, message: 'વર્ષ મળ્યું નથી.' });
    }
    if (yr.is_current) {
      return res.status(400).json({
        success: false,
        message: 'ચાલુ સક્રિય વર્ષને લૉક કરી શકાશે નહીં. પહેલાં અન્ય વર્ષને સક્રિય કરો.'
      });
    }
    const newLock = yr.is_locked ? 0 : 1;
    await query('UPDATE financial_years SET is_locked = ? WHERE id = ?', [newLock, id]);
    await refreshYearLockCache();
    res.json({
      success: true,
      is_locked: newLock,
      message: newLock
        ? `${yr.year_name} સફળતાપૂર્વક લૉક કરવામાં આવ્યું (ફક્ત વાંચવા/પ્રિન્ટ માટે).`
        : `${yr.year_name} સફળતાપૂર્વક અનલૉક કરવામાં આવ્યું.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વર્ષ લૉક બદલવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/years/:id', async (req, res) => {
  try {
    const [yr] = await query('SELECT * FROM financial_years WHERE id = ?', [req.params.id]);
    if (!yr) {
      return res.status(404).json({ success: false, message: 'વર્ષ મળ્યું નથી.' });
    }
    if (yr.is_current) {
      return res.status(400).json({ success: false, message: 'ચાલુ વર્ષને ડિલીટ કરી શકાય નહીં.' });
    }
    const [piyat] = await query('SELECT COUNT(*) AS c FROM piyat_entries WHERE year_name = ?', [yr.year_name]);
    if (piyat?.c > 0) {
      return res.status(400).json({ success: false, message: `આ વર્ષ (${yr.year_name}) હેઠળ ${piyat.c} પિયત એન્ટ્રીઓ હોવાથી ડિલીટ કરી શકાશે નહીં.` });
    }
    await query('DELETE FROM financial_years WHERE id = ?', [req.params.id]);
    await refreshYearLockCache();
    res.json({ success: true, message: 'વર્ષ સફળતાપૂર્વક ડિલીટ કરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વર્ષ ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૨. ગામ માસ્ટર (Server Pagination & Search)
router.get('/villages', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (code LIKE ? OR name LIKE ? OR taluka LIKE ? OR district LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM villages ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM villages ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM villages ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ગામ મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/villages', async (req, res) => {
  const { code, name, taluka, district } = req.body;
  try {
    const result = await query(
      'INSERT INTO villages (code, name, taluka, district) VALUES (?, ?, ?, ?)',
      [code, name, taluka || 'ઓલપાડ', district || 'સુરત']
    );
    res.json({ success: true, id: result?.insertId, message: 'ગામ સફળતાપૂર્વક ઉમેરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ગામ ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/villages/:id', async (req, res) => {
  const { code, name, taluka, district } = req.body;
  try {
    await query(
      'UPDATE villages SET code = ?, name = ?, taluka = ?, district = ? WHERE id = ?',
      [code, name, taluka || 'ઓલપાડ', district || 'સુરત', req.params.id]
    );
    res.json({ success: true, message: 'ગામ વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ગામ સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/villages/:id', async (req, res) => {
  try {
    const [mem] = await query('SELECT COUNT(*) AS c FROM members WHERE village_id = ?', [req.params.id]);
    if (mem?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ ગામ સાથે જોડાયેલા ${mem.c} સભાસદો હોવાથી ગામ ડિલીટ કરી શકાય નહીં.`
      });
    }
    await query('DELETE FROM villages WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'ગામ સફળતાપૂર્વક ડિલીટ કરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ગામ ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૩. નહેર અને શાખા નહેર (Server Pagination & Search)
router.get('/canals', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (code LIKE ? OR name LIKE ? OR source LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM canals ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const canals = await query(`SELECT * FROM canals ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      const subCanals = await query('SELECT * FROM sub_canals ORDER BY id ASC');
      return res.json({
        success: true,
        canals: canals || [],
        data: canals || [],
        subCanals: subCanals || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const canals = await query(`SELECT * FROM canals ${whereSql} ORDER BY id ASC`, params);
    const subCanals = await query('SELECT * FROM sub_canals ORDER BY id ASC');
    res.json({ success: true, canals: canals || [], data: canals || [], subCanals: subCanals || [], total: canals?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'નહેર વિગત મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/canals', async (req, res) => {
  const { code, name, length_km, length, capacity, source } = req.body;
  try {
    const result = await query(
      'INSERT INTO canals (code, name, length_km, capacity, source) VALUES (?, ?, ?, ?, ?)',
      [code, name, length_km || length, capacity, source]
    );
    res.json({ success: true, id: result?.insertId, message: 'નહેર સફળતાપૂર્વક ઉમેરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'નહેર ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/canals/:id', async (req, res) => {
  const { code, name, length_km, length, capacity, source } = req.body;
  try {
    await query(
      'UPDATE canals SET code = ?, name = ?, length_km = ?, capacity = ?, source = ? WHERE id = ?',
      [code, name, length_km || length, capacity, source, req.params.id]
    );
    res.json({ success: true, message: 'નહેર વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'નહેર સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/canals/:id', async (req, res) => {
  try {
    const [sc] = await query('SELECT COUNT(*) AS c FROM sub_canals WHERE canal_id = ?', [req.params.id]);
    if (sc?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ મુખ્ય નહેર હેઠળ ${sc.c} શાખા નહેરો જોડાયેલી હોવાથી નહેર ડિલીટ કરી શકાય નહીં.`
      });
    }
    await query('DELETE FROM canals WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'નહેર સફળતાપૂર્વક ડિલીટ કરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'નહેર ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

router.get('/sub-canals', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (sc.code LIKE ? OR sc.name LIKE ? OR sc.outlets LIKE ? OR c.name LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(
        `SELECT COUNT(*) AS total FROM sub_canals sc LEFT JOIN canals c ON sc.canal_id = c.id ${whereSql}`,
        params
      );
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(
        `SELECT sc.*, c.name AS canal_name, c.name AS canalName FROM sub_canals sc LEFT JOIN canals c ON sc.canal_id = c.id ${whereSql} ORDER BY sc.id ASC LIMIT ? OFFSET ?`,
        [...params, l, offset]
      );
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(
      `SELECT sc.*, c.name AS canal_name, c.name AS canalName FROM sub_canals sc LEFT JOIN canals c ON sc.canal_id = c.id ${whereSql} ORDER BY sc.id ASC`,
      params
    );
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શાખા નહેર મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/sub-canals', async (req, res) => {
  const { canal_id, canalId, code, name, outlets } = req.body;
  const cId = canal_id || canalId;
  try {
    const result = await query(
      'INSERT INTO sub_canals (canal_id, code, name, outlets) VALUES (?, ?, ?, ?)',
      [cId, code, name, outlets]
    );
    res.json({ success: true, id: result?.insertId, message: 'શાખા નહેર સફળતાપૂર્વક ઉમેરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શાખા નહેર ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/sub-canals/:id', async (req, res) => {
  const { canal_id, canalId, code, name, outlets } = req.body;
  const cId = canal_id || canalId;
  try {
    await query(
      'UPDATE sub_canals SET canal_id = ?, code = ?, name = ?, outlets = ? WHERE id = ?',
      [cId, code, name, outlets, req.params.id]
    );
    res.json({ success: true, message: 'શાખા નહેર સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શાખા નહેર સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/sub-canals/:id', async (req, res) => {
  try {
    await query('DELETE FROM sub_canals WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'શાખા નહેર સફળતાપૂર્વક ડિલીટ કરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શાખા નહેર ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૪. પાક માસ્ટર (Server Pagination & Search)
router.get('/crops', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (code LIKE ? OR name LIKE ? OR category LIKE ? OR unit LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM crops ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM crops ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM crops ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પાક મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/crops', async (req, res) => {
  const { code, name, category, unit } = req.body;
  try {
    const result = await query(
      'INSERT INTO crops (code, name, category, unit) VALUES (?, ?, ?, ?)',
      [code, name, category || 'વાર્ષિક પાક', unit || 'વીઘા']
    );
    res.json({ success: true, id: result?.insertId, message: 'પાક સફળતાપૂર્વક ઉમેરાયો!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પાક ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/crops/:id', async (req, res) => {
  const { code, name, category, unit } = req.body;
  try {
    await query(
      'UPDATE crops SET code = ?, name = ?, category = ?, unit = ? WHERE id = ?',
      [code, name, category || 'વાર્ષિક પાક', unit || 'વીઘા', req.params.id]
    );
    res.json({ success: true, message: 'પાક વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પાક સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/crops/:id', async (req, res) => {
  try {
    const [piyat] = await query('SELECT COUNT(*) AS c FROM piyat_entries WHERE crop_id = ?', [req.params.id]);
    if (piyat?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ પાક હેઠળ ${piyat.c} પિયત એન્ટ્રીઓ નોંધાયેલ હોવાથી પાક ડિલીટ કરી શકાય નહીં.`
      });
    }
    await query('DELETE FROM crops WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'પાક સફળતાપૂર્વક ડિલીટ કરાયો!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પાક ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૫. ઋતુ માસ્ટર (Server Pagination & Search)
router.get('/seasons', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (code LIKE ? OR name LIKE ? OR from_month LIKE ? OR to_month LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM seasons ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM seasons ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM seasons ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ઋતુ મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/seasons', async (req, res) => {
  const { code, name, fromMonth, toMonth, from_month, to_month } = req.body;
  try {
    const result = await query(
      'INSERT INTO seasons (code, name, from_month, to_month) VALUES (?, ?, ?, ?)',
      [code, name, fromMonth || from_month || '', toMonth || to_month || '']
    );
    res.json({ success: true, id: result?.insertId, message: 'ઋતુ સફળતાપૂર્વક ઉમેરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ઋતુ ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/seasons/:id', async (req, res) => {
  const { code, name, fromMonth, toMonth, from_month, to_month } = req.body;
  try {
    await query(
      'UPDATE seasons SET code = ?, name = ?, from_month = ?, to_month = ? WHERE id = ?',
      [code, name, fromMonth || from_month || '', toMonth || to_month || '', req.params.id]
    );
    res.json({ success: true, message: 'ઋતુ વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ઋતુ સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/seasons/:id', async (req, res) => {
  try {
    const [rates] = await query('SELECT COUNT(*) AS c FROM rate_tariff WHERE season_name = (SELECT name FROM seasons WHERE id = ?)', [req.params.id]);
    if (rates?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ ઋતુ સાથે જોડાયેલા ભાવ પત્રક દર હોવાથી ઋતુ ડિલીટ કરી શકાય નહીં.`
      });
    }
    await query('DELETE FROM seasons WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'ઋતુ સફળતાપૂર્વક ડિલીટ કરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ઋતુ ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૬. બેંક માસ્ટર (Server Pagination & Search)
router.get('/banks', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (code LIKE ? OR name LIKE ? OR branch LIKE ? OR ifsc LIKE ? OR ac_no LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM banks ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM banks ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM banks ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'બેંક મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/banks', async (req, res) => {
  const { code, name, branch, ifsc, ac_no, acNo } = req.body;
  try {
    const result = await query(
      'INSERT INTO banks (code, name, branch, ifsc, ac_no) VALUES (?, ?, ?, ?, ?)',
      [code, name, branch, ifsc, ac_no || acNo]
    );
    res.json({ success: true, id: result?.insertId, message: 'બેંક સફળતાપૂર્વક ઉમેરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'બેંક ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/banks/:id', async (req, res) => {
  const { code, name, branch, ifsc, ac_no, acNo } = req.body;
  try {
    await query(
      'UPDATE banks SET code = ?, name = ?, branch = ?, ifsc = ?, ac_no = ? WHERE id = ?',
      [code, name, branch, ifsc, ac_no || acNo, req.params.id]
    );
    res.json({ success: true, message: 'બેંક વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'બેંક સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/banks/:id', async (req, res) => {
  try {
    await query('DELETE FROM banks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'બેંક સફળતાપૂર્વક ડિલીટ કરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'બેંક ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૭. મંડળી પ્રોફાઇલ
router.get('/company-profile', async (req, res) => {
  try {
    const data = await query('SELECT * FROM society_profile LIMIT 1');
    res.json({ success: true, data: data?.[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'મંડળી માહિતી મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.put('/company-profile', async (req, res) => {
  const { name, sub_title, reg_no, pramukh, mantri, phone, address } = req.body;
  try {
    await query(
      'UPDATE society_profile SET name = ?, sub_title = ?, reg_no = ?, pramukh = ?, mantri = ?, phone = ?, address = ? WHERE id = 1',
      [name, sub_title, reg_no, pramukh, mantri, phone, address]
    );
    res.json({ success: true, message: 'મંડળી માહિતી સફળતાપૂર્વક અપડેટ થઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'અપડેટ કરવામાં ભૂલ: ' + err.message });
  }
});

export default router;
