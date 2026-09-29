/**
 * વર્ષ અને લૉકિંગ સહાયક (Year & Lock Helper)
 * ચાલુ વર્ષ ૨૦૨૬-૨૦૨૭ સિવાયના તમામ પાછલા વર્ષો લૉક છે (ફક્ત વાંચવા અને પ્રિન્ટ માટે).
 */

export function toEnglishDigits(str) {
  if (!str) return '';
  const guj = {'૦':'0', '૧':'1', '૨':'2', '૩':'3', '૪':'4', '૫':'5', '૬':'6', '૭':'7', '૮':'8', '૯':'9'};
  return String(str).replace(/[૦-૯]/g, d => guj[d]);
}

export function toGujaratiDigits(str) {
  if (!str) return '';
  const guj = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];
  return String(str).replace(/[0-9]/g, d => guj[parseInt(d, 10)]);
}

import { query } from '../config/db.js';

let cachedYears = [];

export async function refreshYearLockCache() {
  try {
    const rows = await query('SELECT id, year_name, is_current, is_locked FROM financial_years');
    if (rows && rows.length > 0) {
      cachedYears = rows;
    }
  } catch (err) {
    console.warn('Could not refresh year lock cache:', err.message);
  }
}

// Initial cache load
refreshYearLockCache();

export function isLockedYear(year) {
  if (!year) return false;
  const norm = toEnglishDigits(String(year)).trim();
  const guj = toGujaratiDigits(norm);

  if (cachedYears.length > 0) {
    const found = cachedYears.find(y => {
      const yNorm = toEnglishDigits(y.year_name || '').trim();
      return yNorm === norm || y.year_name === year || y.year_name === guj;
    });
    if (found) {
      // Any year marked as locked (is_locked=1) OR not current (is_current=0) is locked
      return Boolean(found.is_locked) || !Boolean(found.is_current);
    }

    // Check if it matches current active year
    const curr = cachedYears.find(y => Boolean(y.is_current));
    if (curr) {
      return norm !== toEnglishDigits(curr.year_name || '').trim();
    }
  }

  // Fallback if cache is empty during initial cold-start
  return false;
}

/**
 * નાણાકીય વર્ષમાંથી શરૂઆતનું વર્ષ (Start Year) કાઢો
 * દા.ત. '૨૦૨૫-૨૦૨૬' -> 2025
 */
export function parseStartYear(yearStr) {
  if (!yearStr) return null;
  const eng = toEnglishDigits(String(yearStr)).trim();
  const match = eng.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * પસંદ કરેલા વર્ષ સુધીના (તે વર્ષ અને તેનાથી અગાઉના તમામ) વર્ષોની યાદી મેળવો.
 * આનાથી ૨૦૨૫-૨૦૨૬ પસંદ કરતા ૨૦૨૫-૨૦૨૬, ૨૦૨૪-૨૦૨૫, ૨૦૨૩-૨૦૨૪, ૨૦૨૨-૨૦૨૩ ના રેકોર્ડ્સ મળે છે
 * અને ચાલુ વર્ષ ૨૦૨૬-૨૦૨૭ ના રેકોર્ડ્સ ફિલ્ટર થઈ જાય છે.
 */
export function getYearsUpTo(selectedYear) {
  if (!selectedYear) return { yearStrings: [], cutoffDate: null, startYear: null };
  const selStartYear = parseStartYear(selectedYear);
  if (!selStartYear) {
    return {
      yearStrings: [selectedYear, toEnglishDigits(selectedYear)],
      cutoffDate: null,
      startYear: null
    };
  }

  const yearStrings = [];
  // ૨૦૨૦ થી શરૂ કરીને પસંદ કરેલ વર્ષ સુધીના તમામ વર્ષો ઉમેરો
  for (let y = 2020; y <= selStartYear; y++) {
    const nextY = y + 1;
    const eng = `${y}-${nextY}`;
    const guj = `${toGujaratiDigits(y)}-${toGujaratiDigits(nextY)}`;
    yearStrings.push(guj, eng);
  }

  // કટઓફ તારીખ: પસંદ કરેલ વર્ષની આખર તારીખ (૩૧ માર્ચ)
  const cutoffDate = `${selStartYear + 1}-03-31 23:59:59`;

  return {
    yearStrings,
    cutoffDate,
    startYear: selStartYear
  };
}

