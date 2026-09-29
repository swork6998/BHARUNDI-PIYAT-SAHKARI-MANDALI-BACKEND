import express from 'express';
import { query } from '../config/db.js';
import { isLockedYear, toEnglishDigits, toGujaratiDigits, getYearsUpTo } from '../utils/yearLock.js';

const router = express.Router();

// ૧. રોકડ રસીદો મેળવો (Server-Side Pagination & Filter by Year)
router.get('/receipts', async (req, res) => {
  const { year, exact_year, search, page, limit, from_date, to_date, fromDate, toDate } = req.query;
  try {
    let whereClauses = [];
    const params = [];

    const yearToFilter = exact_year || (year && year !== 'all' ? year : null);
    if (yearToFilter) {
      whereClauses.push('(cr.year_name = ? OR cr.year_name = ?)');
      params.push(toGujaratiDigits(yearToFilter), toEnglishDigits(yearToFilter));
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      const sEng = `%${toEnglishDigits(trimmed)}%`;
      const sGuj = `%${toGujaratiDigits(trimmed)}%`;
      whereClauses.push('(cr.receipt_no LIKE ? OR cr.receipt_no LIKE ? OR m.name LIKE ? OR m.member_no LIKE ? OR m.member_no LIKE ? OR cr.narration LIKE ? OR v.name LIKE ? OR rb.name LIKE ?)');
      params.push(sEng, sGuj, s, sEng, sGuj, s, s, s);
    }

    const fDate = from_date || fromDate;
    const tDate = to_date || toDate;
    if (fDate) {
      whereClauses.push('cr.date >= ?');
      params.push(fDate);
    }
    if (tDate) {
      whereClauses.push('cr.date <= ?');
      params.push(tDate);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let total = 0;
    if (page !== undefined) {
      const countSql = `
        SELECT COUNT(*) AS total 
        FROM cash_receipts cr 
        LEFT JOIN members m ON cr.member_id = m.id 
        LEFT JOIN villages v ON m.village_id = v.id 
        LEFT JOIN receipt_books rb ON cr.book_id = rb.id 
        ${whereSql}
      `;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
    }

    let sql = `
      SELECT cr.*, m.name AS member_name, m.member_no, v.name AS village_name, rb.name AS book_name 
      FROM cash_receipts cr 
      LEFT JOIN members m ON cr.member_id = m.id 
      LEFT JOIN villages v ON m.village_id = v.id 
      LEFT JOIN receipt_books rb ON cr.book_id = rb.id 
      ${whereSql}
      ORDER BY cr.id DESC
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
    res.status(500).json({ success: false, message: 'રસીદો મેળવવામાં ભૂલ: ' + err.message });
  }
});

// ૨. નવી રોકડ રસીદ બનાવો (Cash Receipt / Rasid)
router.post('/receipts', async (req, res) => {
  const { receipt_no, date, book_id, member_id, amount, pay_mode, narration, receiver, year_name, financial_year } = req.body;
  
  const targetYear = year_name || financial_year || '૨૦૨૬-૨૦૨૭';
  if (isLockedYear(targetYear)) {
    return res.status(403).json({
      success: false,
      message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) માં નવી રસીદ બનાવવાની પરવાનગી નથી. ફક્ત વાંચવા અને પ્રિન્ટની છૂટ છે.`
    });
  }

  try {
    const result = await query(
      `INSERT INTO cash_receipts (receipt_no, date, book_id, member_id, amount, pay_mode, narration, receiver, year_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [receipt_no, date || new Date(), book_id, member_id, amount, pay_mode || 'રોકડ', narration, receiver || 'મંત્રી શ્રી', targetYear]
    );

    // રસીદ બુકમાં વર્તમાન નંબર વધારો
    await query('UPDATE receipt_books SET current_no = current_no + 1 WHERE id = ?', [book_id]);

    res.json({ success: true, id: result?.insertId, message: 'રોકડ રસીદ સફળતાપૂર્વક સાચવાઈ ગઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રસીદ બનાવવામાં ભૂલ: ' + err.message });
  }
});

// રસીદ સુધારો (Update Receipt)
router.put('/receipts/:id', async (req, res) => {
  const { id } = req.params;
  const { receipt_no, date, book_id, member_id, amount, pay_mode, narration, receiver, year_name } = req.body;
  try {
    const [rec] = await query('SELECT * FROM cash_receipts WHERE id = ?', [id]);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'રસીદ મળી નથી.' });
    }
    const targetYear = year_name || rec.year_name;
    if (isLockedYear(targetYear)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) ની રસીદમાં ફેરફાર કરવાની પરવાનગી નથી.`
      });
    }

    await query(
      `UPDATE cash_receipts SET 
        receipt_no = COALESCE(?, receipt_no),
        date = COALESCE(?, date),
        book_id = COALESCE(?, book_id),
        member_id = COALESCE(?, member_id),
        amount = COALESCE(?, amount),
        pay_mode = COALESCE(?, pay_mode),
        narration = COALESCE(?, narration),
        receiver = COALESCE(?, receiver)
      WHERE id = ?`,
      [receipt_no, date, book_id, member_id, amount, pay_mode, narration, receiver, id]
    );

    res.json({ success: true, message: 'રોકડ રસીદ સફળતાપૂર્વક સુધારી લેવાઈ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રસીદ સુધારવામાં ભૂલ: ' + err.message });
  }
});

// રસીદ રદ / ડિલીટ કરો
router.delete('/receipts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rec] = await query('SELECT year_name FROM cash_receipts WHERE id = ?', [id]);
    if (rec && isLockedYear(rec.year_name)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${rec.year_name}) ની રસીદ ડિલીટ કરવાની પરવાનગી નથી.`
      });
    }
    await query('DELETE FROM cash_receipts WHERE id = ?', [id]);
    res.json({ success: true, message: 'રસીદ સફળતાપૂર્વક ડિલીટ કરાઈ.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રસીદ ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૩. વાઉચરો મેળવો (Server-Side Pagination & Filter by Year)
router.get('/vouchers', async (req, res) => {
  const { year, exact_year, search, type, page, limit, from_date, to_date, fromDate, toDate } = req.query;
  try {
    let whereClauses = [];
    const params = [];

    const yearToFilter = exact_year || (year && year !== 'all' ? year : null);
    if (yearToFilter) {
      whereClauses.push('(year_name = ? OR year_name = ?)');
      params.push(toGujaratiDigits(yearToFilter), toEnglishDigits(yearToFilter));
    }

    if (type && type !== 'all') {
      whereClauses.push('(type = ? OR type LIKE ?)');
      params.push(type, `%${type}%`);
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      const sEng = `%${toEnglishDigits(trimmed)}%`;
      const sGuj = `%${toGujaratiDigits(trimmed)}%`;
      whereClauses.push('(voucher_no LIKE ? OR voucher_no LIKE ? OR debit_account LIKE ? OR credit_account LIKE ? OR paid_to LIKE ? OR narration LIKE ? OR type LIKE ?)');
      params.push(sEng, sGuj, s, s, s, s, s);
    }

    const fDate = from_date || fromDate;
    const tDate = to_date || toDate;
    if (fDate) {
      whereClauses.push('date >= ?');
      params.push(fDate);
    }
    if (tDate) {
      whereClauses.push('date <= ?');
      params.push(tDate);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let total = 0;
    if (page !== undefined) {
      const countSql = `SELECT COUNT(*) AS total FROM vouchers ${whereSql}`;
      const [countResult] = await query(countSql, params);
      total = countResult?.total || 0;
    }

    let sql = `SELECT * FROM vouchers ${whereSql} ORDER BY id DESC`;

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
    res.status(500).json({ success: false, message: 'વાઉચરો મેળવવામાં ભૂલ: ' + err.message });
  }
});

// ૪. નવું વાઉચર ઉમેરો (Payment / Contra / Journal)
router.post('/vouchers', async (req, res) => {
  const { voucher_no, date, type, debit_account, credit_account, amount, narration, paid_to, year_name, financial_year } = req.body;
  
  const targetYear = year_name || financial_year || '૨૦૨૬-૨૦૨૭';
  if (isLockedYear(targetYear)) {
    return res.status(403).json({
      success: false,
      message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) માં વાઉચર ઉમેરવાની પરવાનગી નથી. ફક્ત વાંચવા અને પ્રિન્ટની છૂટ છે.`
    });
  }

  try {
    const result = await query(
      `INSERT INTO vouchers (voucher_no, date, type, debit_account, credit_account, amount, narration, paid_to, year_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [voucher_no, date || new Date(), type, debit_account, credit_account, amount, narration, paid_to || '', targetYear]
    );
    res.json({ success: true, id: result?.insertId, message: 'વાઉચર સફળતાપૂર્વક સાચવાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વાઉચર સાચવવામાં ભૂલ: ' + err.message });
  }
});

// વાઉચર સુધારો (Update Voucher)
router.put('/vouchers/:id', async (req, res) => {
  const { id } = req.params;
  const { voucher_no, date, type, debit_account, credit_account, amount, narration, paid_to, year_name } = req.body;
  try {
    const [v] = await query('SELECT * FROM vouchers WHERE id = ?', [id]);
    if (!v) {
      return res.status(404).json({ success: false, message: 'વાઉચર મળ્યું નથી.' });
    }
    const targetYear = year_name || v.year_name;
    if (isLockedYear(targetYear)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${targetYear}) ના વાઉચરમાં ફેરફાર કરવાની પરવાનગી નથી.`
      });
    }

    await query(
      `UPDATE vouchers SET 
        voucher_no = COALESCE(?, voucher_no),
        date = COALESCE(?, date),
        type = COALESCE(?, type),
        debit_account = COALESCE(?, debit_account),
        credit_account = COALESCE(?, credit_account),
        amount = COALESCE(?, amount),
        narration = COALESCE(?, narration),
        paid_to = COALESCE(?, paid_to)
      WHERE id = ?`,
      [voucher_no, date, type, debit_account, credit_account, amount, narration, paid_to, id]
    );

    res.json({ success: true, message: 'વાઉચર સફળતાપૂર્વક સુધારી લેવાયું!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વાઉચર સુધારવામાં ભૂલ: ' + err.message });
  }
});

// વાઉચર ડિલીટ કરો
router.delete('/vouchers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [v] = await query('SELECT year_name FROM vouchers WHERE id = ?', [id]);
    if (v && isLockedYear(v.year_name)) {
      return res.status(403).json({
        success: false,
        message: `પાછલા લૉક કરેલા વર્ષ (${v.year_name}) નું વાઉચર ડિલીટ કરવાની પરવાનગી નથી.`
      });
    }
    await query('DELETE FROM vouchers WHERE id = ?', [id]);
    res.json({ success: true, message: 'વાઉચર સફળતાપૂર્વક ડિલીટ કરાયું.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વાઉચર ડિલીટ કરવામાં ભૂલ: ' + err.message });
  }
});

// ૫. દૈનિક રોજમેળ (Daily Rojmel Day Book)
router.get('/rojmel', async (req, res) => {
  const { date, year } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    let recSql = `SELECT cr.id, cr.receipt_no AS doc_no, cr.amount, cr.narration, m.name AS account_name, 'રોકડ આવક' AS trn_type 
                  FROM cash_receipts cr 
                  LEFT JOIN members m ON cr.member_id = m.id 
                  WHERE cr.date = ?`;
    const recParams = [targetDate];
    if (year) {
      const { yearStrings } = getYearsUpTo(year);
      if (yearStrings.length > 0) {
        const ph = yearStrings.map(() => '?').join(',');
        recSql += ` AND (cr.year_name IN (${ph}) OR cr.year_name IS NULL)`;
        recParams.push(...yearStrings);
      }
    }
    const receipts = await query(recSql, recParams);

    let vouchSql = `SELECT id, voucher_no AS doc_no, amount, narration, debit_account AS account_name, type AS trn_type 
                    FROM vouchers 
                    WHERE date = ?`;
    const vouchParams = [targetDate];
    if (year) {
      const { yearStrings } = getYearsUpTo(year);
      if (yearStrings.length > 0) {
        const ph = yearStrings.map(() => '?').join(',');
        vouchSql += ` AND (year_name IN (${ph}) OR year_name IS NULL)`;
        vouchParams.push(...yearStrings);
      }
    }
    const vouchers = await query(vouchSql, vouchParams);

    const totalJama = receipts?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
    const totalUdhar = vouchers?.reduce((sum, v) => sum + Number(v.amount), 0) || 0;
    const openingCash = 45250;
    const closingCash = openingCash + totalJama - totalUdhar;

    res.json({
      success: true,
      date: targetDate,
      openingCash,
      jama: receipts || [],
      totalJama,
      udhar: vouchers || [],
      totalUdhar,
      closingCash,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'રોજમેળ મેળવવામાં ભૂલ: ' + err.message });
  }
});

export default router;
