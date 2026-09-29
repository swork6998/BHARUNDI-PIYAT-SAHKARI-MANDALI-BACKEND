import express from 'express';
import { query } from '../config/db.js';
import { getYearsUpTo, toEnglishDigits, toGujaratiDigits } from '../utils/yearLock.js';

const router = express.Router();

// ૧. તમામ સભાસદો મેળવો (Server-Side Pagination & Filter by Year)
router.get('/', async (req, res) => {
  const { year, village_id, category, search, page, limit } = req.query;
  try {
    let whereClauses = [];
    const params = [];

    if (year) {
      const { cutoffDate } = getYearsUpTo(year);
      if (cutoffDate) {
        whereClauses.push('(m.join_date IS NULL OR m.join_date <= ?)');
        params.push(cutoffDate);
      }
    }
    if (village_id && village_id !== 'all') {
      whereClauses.push('m.village_id = ?');
      params.push(village_id);
    }
    if (category && category !== 'all') {
      whereClauses.push('m.category = ?');
      params.push(category);
    }
    if (search && search.trim()) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      const sEng = `%${toEnglishDigits(trimmed)}%`;
      const sGuj = `%${toGujaratiDigits(trimmed)}%`;
      whereClauses.push('(m.name LIKE ? OR m.member_no LIKE ? OR m.member_no LIKE ? OR m.phone LIKE ? OR m.phone LIKE ? OR m.father_name LIKE ? OR v.name LIKE ?)');
      params.push(s, sEng, sGuj, sEng, sGuj, s, s);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM members m 
        LEFT JOIN villages v ON m.village_id = v.id 
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
    }

    let sql = `
      SELECT m.*, v.name AS village_name 
      FROM members m 
      LEFT JOIN villages v ON m.village_id = v.id 
      ${whereSql}
      ORDER BY CAST(m.member_no AS UNSIGNED) ASC
    `;

    let members = [];
    let p = 1, l = 25;
    if (page !== undefined) {
      p = Math.max(1, parseInt(page, 10) || 1);
      l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      sql += ` LIMIT ? OFFSET ?`;
      members = await query(sql, [...params, l, offset]);
    } else {
      members = await query(sql, params);
    }

    // બ્લોક વિગતો પણ જોડીને આપો
    const memberIds = (members || []).map((m) => m.id);
    let blocks = [];
    if (memberIds.length > 0) {
      const ph = memberIds.map(() => '?').join(',');
      blocks = await query(`SELECT * FROM member_blocks WHERE member_id IN (${ph})`, memberIds);
    }

    const enriched = members?.map((m) => ({
      ...m,
      blocks: blocks?.filter((b) => b.member_id === m.id) || [],
    })) || [];

    if (page !== undefined) {
      return res.json({
        success: true,
        data: enriched,
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    res.json({ success: true, data: enriched, total: enriched.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'સભાસદો મેળવવામાં ભૂલ: ' + err.message });
  }
});

// ૧.૧. તમામ ખેડૂત જમીન અને બ્લોક વિગત (Server-Side Pagination & Filters)
router.get('/blocks', async (req, res) => {
  const { village_id, search, page, limit } = req.query;
  try {
    let whereClauses = [];
    const params = [];

    if (village_id && village_id !== 'all') {
      whereClauses.push('(m.village_id = ? OR v.name = (SELECT name FROM villages WHERE id = ?))');
      params.push(village_id, village_id);
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      const sEng = `%${toEnglishDigits(trimmed)}%`;
      const sGuj = `%${toGujaratiDigits(trimmed)}%`;
      whereClauses.push('(m.name LIKE ? OR m.member_no LIKE ? OR m.member_no LIKE ? OR mb.block_no LIKE ? OR mb.survey_no LIKE ? OR mb.cultivator_name LIKE ? OR c.name LIKE ? OR sc.name LIKE ?)');
      params.push(s, sEng, sGuj, s, s, s, s, s);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM member_blocks mb
        LEFT JOIN members m ON mb.member_id = m.id
        LEFT JOIN villages v ON m.village_id = v.id
        LEFT JOIN canals c ON mb.canal_id = c.id
        LEFT JOIN sub_canals sc ON mb.sub_canal_id = sc.id
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
    }

    let sql = `
      SELECT mb.*, m.name AS member_name, m.member_no, m.phone, 
             v.name AS village_name, v.id AS village_id, 
             c.name AS canal_name, sc.name AS sub_canal_name
      FROM member_blocks mb
      LEFT JOIN members m ON mb.member_id = m.id
      LEFT JOIN villages v ON m.village_id = v.id
      LEFT JOIN canals c ON mb.canal_id = c.id
      LEFT JOIN sub_canals sc ON mb.sub_canal_id = sc.id
      ${whereSql}
      ORDER BY CAST(m.member_no AS UNSIGNED) ASC, mb.id ASC
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
    res.status(500).json({ success: false, message: 'જમીન બ્લોક મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/blocks', async (req, res) => {
  const { member_id, memberId, block_no, survey_no, area_vigha, area, canal_id, canalId, sub_canal_id, subCanalId, cultivator_name } = req.body;
  try {
    const result = await query(
      'INSERT INTO member_blocks (member_id, block_no, survey_no, area_vigha, canal_id, sub_canal_id, cultivator_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [member_id || memberId, block_no, survey_no || '', area_vigha || area || 1, canal_id || canalId || null, sub_canal_id || subCanalId || null, cultivator_name || 'પોતે']
    );
    res.json({ success: true, id: result?.insertId, message: 'જમીન બ્લોક વિગત સફળતાપૂર્વક ઉમેરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'જમીન બ્લોક ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/blocks/:id', async (req, res) => {
  const { member_id, memberId, block_no, survey_no, area_vigha, area, canal_id, canalId, sub_canal_id, subCanalId, cultivator_name } = req.body;
  try {
    await query(
      `UPDATE member_blocks SET 
        block_no = COALESCE(?, block_no), 
        survey_no = ?, 
        area_vigha = ?, 
        canal_id = ?, 
        sub_canal_id = ?, 
        cultivator_name = ? 
      WHERE id = ?`,
      [block_no, survey_no || '', area_vigha || area || 1, canal_id || canalId || null, sub_canal_id || subCanalId || null, cultivator_name || 'પોતે', req.params.id]
    );
    res.json({ success: true, message: 'જમીન બ્લોક વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'જમીન બ્લોક સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/blocks/:id', async (req, res) => {
  try {
    await query('DELETE FROM member_blocks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'જમીન બ્લોક વિગત સફળતાપૂર્વક ડિલીટ કરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'જમીન બ્લોક ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૨. ચોક્કસ સભાસદ મેળવો
router.get('/:id', async (req, res) => {
  try {
    const members = await query('SELECT * FROM members WHERE id = ?', [req.params.id]);
    if (!members || members.length === 0) {
      return res.status(404).json({ success: false, message: 'સભાસદ મળ્યો નથી.' });
    }
    const blocks = await query('SELECT * FROM member_blocks WHERE member_id = ?', [req.params.id]);
    res.json({ success: true, data: { ...members[0], blocks: blocks || [] } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'સભાસદ વિગત મેળવવામાં ભૂલ: ' + err.message });
  }
});

// ૩. નવો સભાસદ ઉમેરો
router.post('/', async (req, res) => {
  const {
    member_no,
    name,
    father_name,
    village_id,
    category,
    phone,
    status,
    join_date,
    shares_count,
    share_amount,
    opening_balance,
    balance_type,
    bank_name,
    bank_ac_no,
    ifsc,
    nominee_name,
    nominee_relation,
    nominee_age,
    blocks,
  } = req.body;

  try {
    const result = await query(
      `INSERT INTO members (
        member_no, name, father_name, village_id, category, phone, status, join_date, 
        shares_count, share_amount, opening_balance, balance_type, 
        bank_name, bank_ac_no, ifsc, nominee_name, nominee_relation, nominee_age
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        member_no,
        name,
        father_name || '',
        village_id,
        category || 'સભાસદ',
        phone || '',
        status || 'ચાલુ',
        join_date || new Date(),
        shares_count || 0,
        share_amount || 0,
        opening_balance || 0,
        balance_type || 'જમા',
        bank_name || '',
        bank_ac_no || '',
        ifsc || '',
        nominee_name || '',
        nominee_relation || '',
        nominee_age || null,
      ]
    );

    const newMemberId = result?.insertId;

    // જો બ્લોક્સ મોકલેલા હોય તો તેને પણ દાખલ કરો
    if (newMemberId && blocks && Array.isArray(blocks)) {
      for (const b of blocks) {
        await query(
          'INSERT INTO member_blocks (member_id, block_no, survey_no, area_vigha, canal_id, sub_canal_id, cultivator_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newMemberId, b.block_no, b.survey_no || '', b.area_vigha || 1, b.canal_id || null, b.sub_canal_id || null, b.cultivator_name || 'પોતે']
        );
      }
    }

    res.json({ success: true, id: newMemberId, message: 'સભાસદ સફળતાપૂર્વક ઉમેરાયા!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'સભાસદ ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

// ૪. સભાસદ વિગત અપડેટ કરો
router.put('/:id', async (req, res) => {
  const {
    member_no,
    name,
    father_name,
    village_id,
    category,
    phone,
    status,
    join_date,
    shares_count,
    share_amount,
    opening_balance,
    balance_type,
    bank_name,
    bank_ac_no,
    ifsc,
    nominee_name,
    nominee_relation,
    nominee_age,
    blocks
  } = req.body;

  try {
    await query(
      `UPDATE members SET 
        member_no = COALESCE(?, member_no),
        name = COALESCE(?, name),
        father_name = ?,
        village_id = COALESCE(?, village_id),
        category = COALESCE(?, category),
        phone = ?,
        status = COALESCE(?, status),
        join_date = COALESCE(?, join_date),
        shares_count = COALESCE(?, shares_count),
        share_amount = COALESCE(?, share_amount),
        opening_balance = COALESCE(?, opening_balance),
        balance_type = COALESCE(?, balance_type),
        bank_name = ?,
        bank_ac_no = ?,
        ifsc = ?,
        nominee_name = ?,
        nominee_relation = ?,
        nominee_age = ?
      WHERE id = ?`,
      [
        member_no,
        name,
        father_name || '',
        village_id,
        category,
        phone || '',
        status,
        join_date,
        shares_count,
        share_amount,
        opening_balance,
        balance_type,
        bank_name || '',
        bank_ac_no || '',
        ifsc || '',
        nominee_name || '',
        nominee_relation || '',
        nominee_age || null,
        req.params.id
      ]
    );

    // જો બ્લોક્સ મોકલેલા હોય તો તેને અપડેટ કરો
    if (blocks && Array.isArray(blocks)) {
      await query('DELETE FROM member_blocks WHERE member_id = ?', [req.params.id]);
      for (const b of blocks) {
        await query(
          'INSERT INTO member_blocks (member_id, block_no, survey_no, area_vigha, canal_id, sub_canal_id, cultivator_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, b.block_no, b.survey_no || '', b.area_vigha || 1, b.canal_id || null, b.sub_canal_id || null, b.cultivator_name || 'પોતે']
        );
      }
    }

    res.json({ success: true, message: 'સભાસદ વિગત સફળતાપૂર્વક સુધારી લેવાઈ છે!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'સુધારો કરવામાં ભૂલ: ' + err.message });
  }
});

// ૫. સભાસદ રદ / ડિલીટ કરો
router.delete('/:id', async (req, res) => {
  try {
    const [piyat] = await query('SELECT COUNT(*) AS c FROM piyat_entries WHERE member_id = ?', [req.params.id]);
    if (piyat?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ સભાસદના નામે ${piyat.c} પિયત એન્ટ્રીઓ નોંધાયેલ હોવાથી સભાસદ ડિલીટ કરી શકાય નહીં.`
      });
    }
    const [rc] = await query('SELECT COUNT(*) AS c FROM cash_receipts WHERE member_id = ?', [req.params.id]);
    if (rc?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ સભાસદના નામે ${rc.c} રોકડ રસીદો બનેલી હોવાથી સભાસદ ડિલીટ કરી શકાય નહીં.`
      });
    }

    await query('DELETE FROM member_blocks WHERE member_id = ?', [req.params.id]);
    await query('DELETE FROM members WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'સભાસદ સફળતાપૂર્વક ડિલીટ કરાયા.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

export default router;
