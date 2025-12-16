/**
 * Date Utilities (Client-Side)
 * Standardizes all date formatting to DD.MM.YYYY format
 */

window.DateUtils = {
  /**
   * Format a date to DD.MM.YYYY
   * @param {Date|string|null} date - Date object or string
   * @returns {string} Formatted date or empty string
   */
  format: function(date) {
    if (!date) return '';
    
    var d;
    if (date instanceof Date) {
      d = date;
    } else {
      d = this.parse(date);
    }
    
    if (!d || isNaN(d.getTime())) return '';
    
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    
    return day + '.' + month + '.' + year;
  },

  /**
   * Format a date for HTML date input (YYYY-MM-DD)
   * @param {Date|string|null} date - Date object or string
   * @returns {string} Formatted date for input[type=date]
   */
  formatForInput: function(date) {
    if (!date) return '';
    
    var d;
    if (date instanceof Date) {
      d = date;
    } else {
      d = this.parse(date);
    }
    
    if (!d || isNaN(d.getTime())) return '';
    
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    
    return year + '-' + month + '-' + day;
  },

  /**
   * Parse a date string in various formats
   * Supported formats: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
   * @param {string} dateStr - Date string
   * @returns {Date|null} Parsed date or null
   */
  parse: function(dateStr) {
    if (!dateStr) return null;
    
    var s = String(dateStr).trim();
    if (!s) return null;
    
    // Try DD.MM.YYYY or DD/MM/YYYY
    var dmyMatch = /^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})$/.exec(s);
    if (dmyMatch) {
      var day = parseInt(dmyMatch[1], 10);
      var month = parseInt(dmyMatch[2], 10) - 1;
      var year = parseInt(dmyMatch[3], 10);
      var d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    
    // Try YYYY-MM-DD
    var ymdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (ymdMatch) {
      year = parseInt(ymdMatch[1], 10);
      month = parseInt(ymdMatch[2], 10) - 1;
      day = parseInt(ymdMatch[3], 10);
      d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    
    // Try ISO format
    var isoDate = new Date(s);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }
    
    return null;
  },

  /**
   * Format date with time (DD.MM.YYYY HH:MM)
   * @param {Date|string|null} date - Date object or string
   * @returns {string} Formatted date with time
   */
  formatDateTime: function(date) {
    if (!date) return '';
    
    var d;
    if (date instanceof Date) {
      d = date;
    } else {
      d = this.parse(date);
    }
    
    if (!d || isNaN(d.getTime())) return '';
    
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    
    return day + '.' + month + '.' + year + ' ' + hours + ':' + minutes;
  },

  /**
   * Get today's date formatted as DD.MM.YYYY
   * @returns {string} Today's date
   */
  today: function() {
    return this.format(new Date());
  },

  /**
   * Get today's date for input fields (YYYY-MM-DD)
   * @returns {string} Today's date for input
   */
  todayForInput: function() {
    return this.formatForInput(new Date());
  },

  /**
   * Convert YYYY-MM-DD to DD.MM.YYYY
   * @param {string} isoDate - ISO date string
   * @returns {string} Formatted date
   */
  isoToDisplay: function(isoDate) {
    if (!isoDate) return '';
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
    if (match) {
      return match[3] + '.' + match[2] + '.' + match[1];
    }
    return isoDate;
  },

  /**
   * Convert DD.MM.YYYY to YYYY-MM-DD
   * @param {string} displayDate - Display date string
   * @returns {string} ISO date string
   */
  displayToIso: function(displayDate) {
    if (!displayDate) return '';
    var match = /^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})$/.exec(displayDate);
    if (match) {
      var day = match[1].padStart(2, '0');
      var month = match[2].padStart(2, '0');
      return match[3] + '-' + month + '-' + day;
    }
    return displayDate;
  },

  /**
   * Calculate days between two dates
   * @param {Date|string} date1 
   * @param {Date|string} date2 
   * @returns {number} Days difference
   */
  daysBetween: function(date1, date2) {
    var d1 = date1 instanceof Date ? date1 : this.parse(date1);
    var d2 = date2 instanceof Date ? date2 : this.parse(date2);
    
    if (!d1 || !d2) return 0;
    
    var msPerDay = 1000 * 60 * 60 * 24;
    return Math.ceil((d2.getTime() - d1.getTime()) / msPerDay);
  },

  /**
   * Add days to a date
   * @param {Date|string} date 
   * @param {number} days 
   * @returns {Date} New date
   */
  addDays: function(date, days) {
    var d = date instanceof Date ? new Date(date) : this.parse(date);
    if (!d) return null;
    d.setDate(d.getDate() + days);
    return d;
  },

  /**
   * Initialize all date inputs to show DD.MM.YYYY format
   * Attach listeners to convert between display and ISO format
   */
  initDateInputs: function() {
    var self = this;
    document.querySelectorAll('input[type="date"]').forEach(function(input) {
      // Store original value
      var originalValue = input.value;
      
      // On blur, we could show formatted value (not needed for type=date)
      // This is mainly for text inputs that should display DD.MM.YYYY
    });

    // For text inputs with data-date-format attribute
    document.querySelectorAll('input[data-date-format="dd.mm.yyyy"]').forEach(function(input) {
      // Format existing value
      if (input.value) {
        input.value = self.format(input.value);
      }
    });
  }
};

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  DateUtils.initDateInputs();
});
