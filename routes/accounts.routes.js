import express from 'express';
import { query } from '../config/db.js';

const router = express.Router();

// ૧. ખાતા ગ્રુપ માસ્ટર (Server Pagination & Search)
router.get('/groups', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (name LIKE ? OR type LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM account_groups ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM account_groups ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM account_groups ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ખાતા ગ્રુપ મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/groups', async (req, res) => {
  const { name, type } = req.body;
  try {
    const result = await query('INSERT INTO account_groups (name, type) VALUES (?, ?)', [name, type]);
    res.json({ success: true, id: result?.insertId, message: 'ખાતા ગ્રુપ સફળતાપૂર્વક ઉમેરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ગ્રુપ ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/groups/:id', async (req, res) => {
  const { name, type } = req.body;
  try {
    await query('UPDATE account_groups SET name = ?, type = ? WHERE id = ?', [name, type, req.params.id]);
    res.json({ success: true, message: 'ખાતા ગ્રુપ સફળતાપૂર્વક સુધારી લેવાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ગ્રુપ સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/groups/:id', async (req, res) => {
  try {
    const [ga] = await query('SELECT COUNT(*) AS c FROM general_accounts WHERE group_id = ?', [req.params.id]);
    if (ga?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ ગ્રુપ હેઠળ ${ga.c} જનરલ ખાતાઓ નોંધાયેલા હોવાથી ગ્રુપ ડિલીટ કરી શકાય નહીં.`
      });
    }
    await query('DELETE FROM account_groups WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'ખાતા ગ્રુપ સફળતાપૂર્વક ડિલીટ કરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ગ્રુપ ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૨. જનરલ ખાતાવહી (General Accounts - Hdmst with Server Pagination & Search)
router.get('/general', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (ga.code LIKE ? OR ga.name LIKE ? OR ag.name LIKE ? OR ag.type LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM general_accounts ga 
        LEFT JOIN account_groups ag ON ga.group_id = ag.id 
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;

      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const sql = `
        SELECT ga.*, ag.name AS group_name, ag.type AS group_type 
        FROM general_accounts ga 
        LEFT JOIN account_groups ag ON ga.group_id = ag.id 
        ${whereSql}
        ORDER BY ga.id ASC
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
      SELECT ga.*, ag.name AS group_name, ag.type AS group_type 
      FROM general_accounts ga 
      LEFT JOIN account_groups ag ON ga.group_id = ag.id 
      ${whereSql}
      ORDER BY ga.id ASC
    `;
    const data = await query(sql, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'જનરલ ખાતાઓ મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/general', async (req, res) => {
  const { code, name, group_id, opening_debit, opening_credit } = req.body;
  try {
    const result = await query(
      'INSERT INTO general_accounts (code, name, group_id, opening_debit, opening_credit) VALUES (?, ?, ?, ?, ?)',
      [code, name, group_id, opening_debit || 0, opening_credit || 0]
    );
    res.json({ success: true, id: result?.insertId, message: 'જનરલ ખાતું સફળતાપૂર્વક ઉમેરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ખાતું ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/general/:id', async (req, res) => {
  const { code, name, group_id, opening_debit, opening_credit } = req.body;
  try {
    await query(
      'UPDATE general_accounts SET code = ?, name = ?, group_id = ?, opening_debit = ?, opening_credit = ? WHERE id = ?',
      [code, name, group_id, opening_debit || 0, opening_credit || 0, req.params.id]
    );
    res.json({ success: true, message: 'જનરલ ખાતું સફળતાપૂર્વક સુધારી લેવાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'જનરલ ખાતું સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/general/:id', async (req, res) => {
  try {
    const [sa] = await query('SELECT COUNT(*) AS c FROM sub_accounts WHERE head_account_id = ?', [req.params.id]);
    if (sa?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ ખાતા સાથે ${sa.c} પેટા ખાતાઓ જોડાયેલા હોવાથી ખાતું ડિલીટ કરી શકાય નહીં.`
      });
    }
    await query('DELETE FROM general_accounts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'જનરલ ખાતું સફળતાપૂર્વક ડિલીટ કરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'જનરલ ખાતું ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૩. પેટા ખાતાવહી (Sub Accounts - Famst with Server Pagination)
router.get('/sub', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (code LIKE ? OR name LIKE ? OR head_name LIKE ? OR party_type LIKE ? OR phone LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const countSql = `SELECT COUNT(*) AS total FROM sub_accounts ${whereSql}`;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;

      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const sql = `SELECT * FROM sub_accounts ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`;
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

    const data = await query(`SELECT * FROM sub_accounts ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પેટા ખાતાઓ મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/sub', async (req, res) => {
  const { code, name, head_account_id, head_name, party_type, phone, balance_type, balance } = req.body;
  try {
    const result = await query(
      'INSERT INTO sub_accounts (code, name, head_account_id, head_name, party_type, phone, balance_type, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [code, name, head_account_id || 1, head_name || 'સામાન્ય', party_type || 'વેપારી', phone || '', balance_type || 'ઉધાર', balance || 0]
    );
    res.json({ success: true, id: result?.insertId, message: 'પેટા ખાતું સફળતાપૂર્વક ઉમેરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પેટા ખાતું ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/sub/:id', async (req, res) => {
  const { code, name, head_account_id, head_name, party_type, phone, balance_type, balance } = req.body;
  try {
    await query(
      'UPDATE sub_accounts SET code = ?, name = ?, head_account_id = ?, head_name = ?, party_type = ?, phone = ?, balance_type = ?, balance = ? WHERE id = ?',
      [code, name, head_account_id || 1, head_name || 'સામાન્ય', party_type || 'વેપારી', phone || '', balance_type || 'ઉધાર', balance || 0, req.params.id]
    );
    res.json({ success: true, message: 'પેટા ખાતું સફળતાપૂર્વક સુધારી લેવાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પેટા ખાતું સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/sub/:id', async (req, res) => {
  try {
    await query('DELETE FROM sub_accounts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'પેટા ખાતું સફળતાપૂર્વક ડિલીટ કરાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'પેટા ખાતું ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૪. રસીદ બુક માસ્ટર (Server Pagination & Search)
router.get('/receipt-books', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (code LIKE ? OR name LIKE ? OR status LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM receipt_books ${whereSql}`, params);
      total = countResult?.total || 0;

      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM receipt_books ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM receipt_books ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રસીદ બુક મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/receipt-books', async (req, res) => {
  const { code, name, start_no, end_no, current_no, status } = req.body;
  try {
    const result = await query(
      'INSERT INTO receipt_books (code, name, start_no, end_no, current_no, status) VALUES (?, ?, ?, ?, ?, ?)',
      [code, name, start_no, end_no, current_no || start_no, status || 'ચાલુ']
    );
    res.json({ success: true, id: result?.insertId, message: 'રસીદ બુક સફળતાપૂર્વક ઉમેરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રસીદ બુક ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

router.put('/receipt-books/:id', async (req, res) => {
  const { code, name, start_no, end_no, current_no, status } = req.body;
  try {
    await query(
      'UPDATE receipt_books SET code = ?, name = ?, start_no = ?, end_no = ?, current_no = ?, status = ? WHERE id = ?',
      [code, name, start_no, end_no, current_no, status || 'ચાલુ', req.params.id]
    );
    res.json({ success: true, message: 'રસીદ બુક સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રસીદ બુક સુધારવામાં ભૂલ: ' + err.message });
  }
});

router.delete('/receipt-books/:id', async (req, res) => {
  try {
    const [rc] = await query('SELECT COUNT(*) AS c FROM cash_receipts WHERE book_id = ?', [req.params.id]);
    if (rc?.c > 0) {
      return res.status(400).json({
        success: false,
        message: `આ રસીદ બુક હેઠળ ${rc.c} રોકડ રસીદો બનેલી હોવાથી રસીદ બુક ડિલીટ કરી શકાય નહીં.`
      });
    }
    await query('DELETE FROM receipt_books WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'રસીદ બુક સફળતાપૂર્વક ડિલીટ કરાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રસીદ બુક ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

export default router;
