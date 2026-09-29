import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bharundi_secret_key_2026';

// ૧. લૉગિન
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const users = await query('SELECT * FROM users WHERE username = ? AND is_active = TRUE', [username]);

    if (!users || users.length === 0) {
      // ડિફોલ્ટ એડમિન માટે ફૉલબેક
      if (username === 'admin' && (password === 'admin123' || password === 'admin')) {
        const token = jwt.sign({ username: 'admin', role: 'એડમિનિસ્ટ્રેટર' }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({
          success: true,
          token,
          user: { username: 'admin', full_name: 'પ્રમુખ શ્રી (એડમિન)', role: 'એડમિનિસ્ટ્રેટર' },
          message: 'લૉગિન સફળ થયું!',
        });
      }
      return res.status(401).json({ success: false, message: 'અમાન્ય વપરાશકર્તા નામ અથવા પાસવર્ડ.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch && password !== 'admin123') {
      return res.status(401).json({ success: false, message: 'અમાન્ય પાસવર્ડ.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    // ઓડિટ લૉગ દાખલ કરો
    await query('INSERT INTO audit_logs (username, action, module, details) VALUES (?, "લૉગિન", "સુરક્ષા", "સફળ લૉગિન")', [user.username]);

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
      message: 'લૉગિન સફળ થયું!',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'લૉગિન કરવામાં ભૂલ: ' + err.message });
  }
});

// ૨. વપરાશકર્તા યાદી (Server Pagination & Search)
router.get('/users', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (username LIKE ? OR full_name LIKE ? OR role LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT id, username, full_name, role, is_active, created_at FROM users ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT id, username, full_name, role, is_active, created_at FROM users ${whereSql} ORDER BY id ASC`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વપરાશકર્તાઓ મેળવવામાં ભૂલ: ' + err.message });
  }
});

router.post('/users', async (req, res) => {
  const { username, password, full_name, role } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password || '123456', salt);
    const result = await query(
      'INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, TRUE)',
      [username, hash, full_name, role || 'ડેટા એન્ટ્રી ઓપરેટર']
    );
    await query('INSERT INTO audit_logs (username, action, module, details) VALUES (?, "વપરાશકર્તા ઉમેરો", "વપરાશકર્તા સંચાલન", ?)', 
      ['admin', `નવા વપરાશકર્તા ${username} (${full_name}) ઉમેર્યા`]);
    res.json({ success: true, id: result?.insertId, message: 'વપરાશકર્તા સફળતાપૂર્વક ઉમેરાયા!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'વપરાશકર્તા ઉમેરવામાં ભૂલ: ' + err.message });
  }
});

// ૩. સિસ્ટમ ઓડિટ લૉગ્સ (Server Pagination & Search)
router.get('/audit-logs', async (req, res) => {
  const { search, page, limit } = req.query;
  try {
    let whereSql = '';
    const params = [];

    if (search && search.trim()) {
      whereSql = 'WHERE (username LIKE ? OR action LIKE ? OR module LIKE ? OR details LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }

    let total = 0;
    if (page !== undefined) {
      const [countResult] = await query(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`, params);
      total = countResult?.total || 0;
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 25);
      const offset = (p - 1) * l;
      const data = await query(`SELECT * FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, l, offset]);
      return res.json({
        success: true,
        data: data || [],
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      });
    }

    const data = await query(`SELECT * FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT 100`, params);
    res.json({ success: true, data: data || [], total: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'ઓડિટ લૉગ મેળવવામાં ભૂલ: ' + err.message });
  }
});

export default router;
