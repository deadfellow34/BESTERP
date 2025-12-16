/**
 * Date Utilities
 * Standardizes all date formatting to DD.MM.YYYY format across the application
 */

/**
 * Format a date to DD.MM.YYYY
 * @param {Date|string|null} date - Date object or string
 * @returns {string} Formatted date or empty string
 */
function formatDate(date) {
  if (!date) return '';
  
  let d;
  if (date instanceof Date) {
    d = date;
  } else {
    d = parseDate(date);
  }
  
  if (!d || isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}.${month}.${year}`;
}

/**
 * Format a date for HTML date input (YYYY-MM-DD)
 * @param {Date|string|null} date - Date object or string
 * @returns {string} Formatted date for input[type=date]
 */
function formatDateForInput(date) {
  if (!date) return '';
  
  let d;
  if (date instanceof Date) {
    d = date;
  } else {
    d = parseDate(date);
  }
  
  if (!d || isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${year}-${month}-${day}`;
}

/**
 * Parse a date string in various formats
 * Supported formats: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
 * @param {string} dateStr - Date string
 * @returns {Date|null} Parsed date or null
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const s = String(dateStr).trim();
  if (!s) return null;
  
  // Try DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})$/.exec(s);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // Try YYYY-MM-DD
  const ymdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // Try ISO format
  const isoDate = new Date(s);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }
  
  return null;
}

/**
 * Format date with time (DD.MM.YYYY HH:MM)
 * @param {Date|string|null} date - Date object or string
 * @returns {string} Formatted date with time
 */
function formatDateTime(date) {
  if (!date) return '';
  
  let d;
  if (date instanceof Date) {
    d = date;
  } else {
    d = parseDate(date);
  }
  
  if (!d || isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

/**
 * Get today's date formatted as DD.MM.YYYY
 * @returns {string} Today's date
 */
function today() {
  return formatDate(new Date());
}

/**
 * Get today's date for input fields (YYYY-MM-DD)
 * @returns {string} Today's date for input
 */
function todayForInput() {
  return formatDateForInput(new Date());
}

/**
 * Convert YYYY-MM-DD to DD.MM.YYYY
 * @param {string} isoDate - ISO date string
 * @returns {string} Formatted date
 */
function isoToDisplay(isoDate) {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }
  return isoDate;
}

/**
 * Convert DD.MM.YYYY to YYYY-MM-DD
 * @param {string} displayDate - Display date string
 * @returns {string} ISO date string
 */
function displayToIso(displayDate) {
  if (!displayDate) return '';
  const match = /^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})$/.exec(displayDate);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    return `${match[3]}-${month}-${day}`;
  }
  return displayDate;
}

/**
 * Calculate days between two dates
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {number} Days difference
 */
function daysBetween(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : parseDate(date1);
  const d2 = date2 instanceof Date ? date2 : parseDate(date2);
  
  if (!d1 || !d2) return 0;
  
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((d2.getTime() - d1.getTime()) / msPerDay);
}

/**
 * Add days to a date
 * @param {Date|string} date 
 * @param {number} days 
 * @returns {Date} New date
 */
function addDays(date, days) {
  const d = date instanceof Date ? new Date(date) : parseDate(date);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Get current date/time in GMT+3 (Turkey timezone)
 * @returns {Date} Current date in GMT+3
 */
function getNowGMT3() {
  const now = new Date();
  // Get UTC time and add 3 hours for Turkey timezone
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3 * 60 * 60 * 1000));
}

module.exports = {
  formatDate,
  formatDateForInput,
  parseDate,
  formatDateTime,
  today,
  todayForInput,
  isoToDisplay,
  displayToIso,
  daysBetween,
  addDays,
  getNowGMT3
};
