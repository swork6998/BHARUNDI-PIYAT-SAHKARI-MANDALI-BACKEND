import express from 'express';
import { query } from '../config/db.js';
import { getYearsUpTo, toEnglishDigits, toGujaratiDigits } from '../utils/yearLock.js';

const router = express.Router();

// ૧. તમામ શેર પ્રમાણપત્રો મેળવો (Server-Side Pagination & Filter by Year)
router.get('/', async (req, res) => {
  const { year, search, page, limit } = req.query;
  try {
    let whereClauses = [];
    const params = [];

    if (year) {
      const { cutoffDate } = getYearsUpTo(year);
      if (cutoffDate) {
        whereClauses.push('(s.issue_date IS NULL OR s.issue_date <= ?)');
        params.push(cutoffDate);
      }
    }
    if (req.query.member_id) {
      whereClauses.push('s.member_id = ?');
      params.push(req.query.member_id);
    }
    if (search && search.trim()) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      const sEng = `%${toEnglishDigits(trimmed)}%`;
      const sGuj = `%${toGujaratiDigits(trimmed)}%`;
      whereClauses.push('(s.certi_no LIKE ? OR m.name LIKE ? OR m.member_no LIKE ? OR m.member_no LIKE ? OR v.name LIKE ? OR s.from_no LIKE ? OR s.to_no LIKE ?)');
      params.push(s, s, sEng, sGuj, s, sEng, sEng);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM shares s 
        LEFT JOIN members m ON s.member_id = m.id 
        LEFT JOIN villages v ON m.village_id = v.id 
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
    }

    let sql = `
      SELECT s.*, m.name AS member_name, m.member_no, v.name AS village_name 
      FROM shares s 
      LEFT JOIN members m ON s.member_id = m.id 
      LEFT JOIN villages v ON m.village_id = v.id 
      ${whereSql}
      ORDER BY s.id DESC
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
    res.status(500).json({ success: false, message: 'શેર વિગત મેળવવામાં ભૂલ: ' + err.message });
  }
});

// ૨. નવા શેર ફાળવણી (Allotment)
router.post('/issue', async (req, res) => {
  const { certi_no, member_id, from_no, to_no, share_count, face_value, amount, issue_date, tharav_date } = req.body;
  try {
    const result = await query(
      `INSERT INTO shares (certi_no, member_id, from_no, to_no, share_count, face_value, amount, issue_date, tharav_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ચાલુ')`,
      [certi_no, member_id, from_no, to_no, share_count, face_value || 100, amount, issue_date || new Date(), tharav_date]
    );

    // સભાસદના પ્રોફાઇલમાં શેર સંખ્યા અને રકમ ઉમેરો
    await query(
      'UPDATE members SET shares_count = shares_count + ?, share_amount = share_amount + ? WHERE id = ?',
      [share_count, amount, member_id]
    );

    res.json({ success: true, id: result?.insertId, message: 'નવા શેર સફળતાપૂર્વક ફાળવવામાં આવ્યા!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શેર ફાળવણીમાં ભૂલ: ' + err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { certi_no, member_id, from_no, to_no, share_count, face_value, amount, issue_date, tharav_date, status } = req.body;
  try {
    const [oldShare] = await query('SELECT * FROM shares WHERE id = ?', [req.params.id]);
    if (!oldShare) {
      return res.status(404).json({ success: false, message: 'શેર રેકોર્ડ મળ્યો નથી.' });
    }

    const oldCnt = Number(oldShare.share_count) || 0;
    const oldAmt = Number(oldShare.amount) || 0;
    const newCnt = Number(share_count ?? oldCnt);
    const newAmt = Number(amount ?? oldAmt);
    const oldMemberId = oldShare.member_id;
    const newMemberId = member_id ? Number(member_id) : oldMemberId;

    if (oldMemberId === newMemberId) {
      const diffCnt = newCnt - oldCnt;
      const diffAmt = newAmt - oldAmt;
      await query('UPDATE members SET shares_count = shares_count + ?, share_amount = share_amount + ? WHERE id = ?', [diffCnt, diffAmt, oldMemberId]);
    } else {
      await query('UPDATE members SET shares_count = shares_count - ?, share_amount = share_amount - ? WHERE id = ?', [oldCnt, oldAmt, oldMemberId]);
      await query('UPDATE members SET shares_count = shares_count + ?, share_amount = share_amount + ? WHERE id = ?', [newCnt, newAmt, newMemberId]);
    }

    await query(
      `UPDATE shares SET 
        certi_no = COALESCE(?, certi_no),
        member_id = ?,
        from_no = ?,
        to_no = ?,
        share_count = ?,
        face_value = ?,
        amount = ?,
        issue_date = ?,
        tharav_date = ?,
        status = COALESCE(?, status)
      WHERE id = ?`,
      [
        certi_no,
        newMemberId,
        from_no ?? oldShare.from_no,
        to_no ?? oldShare.to_no,
        newCnt,
        face_value || 100,
        newAmt,
        issue_date || oldShare.issue_date,
        tharav_date || oldShare.tharav_date,
        status,
        req.params.id
      ]
    );

    res.json({ success: true, message: 'શેર વિગત સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શેર સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [oldShare] = await query('SELECT * FROM shares WHERE id = ?', [req.params.id]);
    if (!oldShare) {
      return res.status(404).json({ success: false, message: 'શેર રેકોર્ડ મળ્યો નથી.' });
    }

    const oldCnt = Number(oldShare.share_count) || 0;
    const oldAmt = Number(oldShare.amount) || 0;
    await query('UPDATE members SET shares_count = GREATEST(0, shares_count - ?), share_amount = GREATEST(0, share_amount - ?) WHERE id = ?', [oldCnt, oldAmt, oldShare.member_id]);

    await query('DELETE FROM shares WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'શેર પ્રમાણપત્ર સફળતાપૂર્વક ડિલીટ કરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શેર ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૩. શેર ફેરબદલ (Transfer)
router.post('/transfer', async (req, res) => {
  const { from_member_id, to_member_id, certi_no, share_count, amount, tharav_date } = req.body;
  try {
    // જૂના સભાસદમાંથી બાદ કરો
    await query(
      'UPDATE members SET shares_count = shares_count - ?, share_amount = share_amount - ? WHERE id = ?',
      [share_count, amount, from_member_id]
    );
    // નવા સભાસદમાં ઉમેરો
    await query(
      'UPDATE members SET shares_count = shares_count + ?, share_amount = share_amount + ? WHERE id = ?',
      [share_count, amount, to_member_id]
    );
    // શેર રેકોર્ડમાં નવો માલિક અપડેટ કરો
    await query(
      'UPDATE shares SET member_id = ?, tharav_date = ? WHERE certi_no = ?',
      [to_member_id, tharav_date || new Date(), certi_no]
    );

    res.json({ success: true, message: 'શેર ફેરબદલ સફળતાપૂર્વક પૂર્ણ થઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'શેર ફેરબદલમાં ભૂલ: ' + err.message });
  }
});

// ૪. ડિવિડન્ડ ગણતરી (Dividend Calculation)
router.post('/dividend/calculate', async (req, res) => {
  const { year_name, percentage } = req.body;
  const pct = Number(percentage) || 12;

  try {
    // પહેલા સભાસદો મેળવો જેમની પાસે શેર મૂડી છે
    const membersWithShares = await query(
      'SELECT id, share_amount FROM members WHERE share_amount > 0 AND status = "ચાલુ"'
    );

    if (!membersWithShares || membersWithShares.length === 0) {
      return res.status(400).json({ success: false, message: 'શેર ધરાવતા કોઈ સભાસદ મળ્યા નથી.' });
    }

    // જૂની ગણતરી ડિલીટ કરો
    await query('DELETE FROM dividends WHERE year_name = ?', [year_name]);

    for (const m of membersWithShares) {
      const divAmt = Math.round((Number(m.share_amount) * pct) / 100);
      await query(
        'INSERT INTO dividends (year_name, percentage, member_id, share_amount, dividend_amount, status) VALUES (?, ?, ?, ?, ?, "બાકી")',
        [year_name, pct, m.id, m.share_amount, divAmt]
      );
    }

    res.json({
      success: true,
      message: `વર્ષ ${year_name} માટે ${pct}% લેખે કુલ ${membersWithShares.length} સભાસદોનું ડિવિડન્ડ સફળતાપૂર્વક ગણાઈ ગયું!`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ડિવિડન્ડ ગણતરીમાં ભૂલ: ' + err.message });
  }
});

// ૫. ડિવિડન્ડ રજીસ્ટર મેળવો (Server Pagination & Search)
router.get('/dividend/register', async (req, res) => {
  const { year, search, page, limit } = req.query;
  try {
    let whereClauses = ['(d.year_name = ? OR d.year_name = ?)'];
    const targetYear = year || '૨૦૨૫-૨૦૨૬';
    const params = [targetYear, toEnglishDigits(targetYear)];

    if (search && search.trim()) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      const sEng = `%${toEnglishDigits(trimmed)}%`;
      const sGuj = `%${toGujaratiDigits(trimmed)}%`;
      whereClauses.push('(m.name LIKE ? OR m.member_no LIKE ? OR m.member_no LIKE ? OR v.name LIKE ?)');
      params.push(s, sEng, sGuj, s);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM dividends d 
        LEFT JOIN members m ON d.member_id = m.id 
        LEFT JOIN villages v ON m.village_id = v.id 
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const sql = `
        SELECT d.*, m.name AS member_name, m.member_no, m.bank_name, m.bank_ac_no, v.name AS village_name 
        FROM dividends d 
        LEFT JOIN members m ON d.member_id = m.id 
        LEFT JOIN villages v ON m.village_id = v.id 
        ${whereSql}
        ORDER BY CAST(m.member_no AS UNSIGNED) ASC
        LIMIT ? OFFSET ?
      `;
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

    const sql = `
      SELECT d.*, m.name AS member_name, m.member_no, m.bank_name, m.bank_ac_no, v.name AS village_name 
      FROM dividends d 
      LEFT JOIN members m ON d.member_id = m.id 
      LEFT JOIN villages v ON m.village_id = v.id 
      ${whereSql}
      ORDER BY CAST(m.member_no AS UNSIGNED) ASC
    `;
    const data = await query(sql, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ડિવિડન્ડ રજીસ્ટર મેળવવામાં ભૂલ: ' + err.message });
  }
});

export default router;
