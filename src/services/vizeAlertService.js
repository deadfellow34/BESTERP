/**
 * VizeBest Alert Service
 * Sends daily email notifications for expiring documents (within 90 days)
 */

const nodemailer = require('nodemailer');
const VizeBestModel = require('../models/vizebestModel');

const VizeAlertService = {
  /**
   * Parse date string in various formats
   * @param {string} dateStr - Date string
   * @returns {Date|null}
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    
    // DD.MM.YYYY or DD/MM/YYYY
    const dmyMatch = /^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})$/.exec(s);
    if (dmyMatch) {
      return new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    }
    
    // YYYY-MM-DD
    const ymdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (ymdMatch) {
      return new Date(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3]));
    }
    
    return null;
  },

  /**
   * Calculate days until expiry
   * @param {string} dateStr - Expiry date string
   * @returns {number|null} - Days until expiry (negative if expired)
   */
  getDaysUntilExpiry(dateStr) {
    const date = this.parseDate(dateStr);
    if (!date) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.ceil((date.getTime() - today.getTime()) / msPerDay);
  },

  /**
   * Check if date is within warning period (90 days or already expired)
   * @param {string} dateStr - Date string
   * @returns {boolean}
   */
  isWarning(dateStr) {
    const days = this.getDaysUntilExpiry(dateStr);
    if (days === null) return false;
    return days <= 90;
  },

  /**
   * Calculate age from birth date
   * @param {string} dateStr - Birth date string
   * @returns {number|null}
   */
  calculateAge(dateStr) {
    const dob = this.parseDate(dateStr);
    if (!dob) return null;
    
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  },

  /**
   * Get all expiring documents grouped by driver
   * @returns {Promise<Array>} - Array of warnings
   */
  getExpiringDocuments() {
    return new Promise((resolve, reject) => {
      VizeBestModel.getAll((err, rows) => {
        if (err) return reject(err);
        
        const warnings = [];
        const fieldLabels = {
          ukvisa: 'İngiltere Vize',
          schengen: 'Schengen Vize',
          license_exp: 'Ehliyet Geçerlilik',
          insurance_exp: 'Seyahat Sigorta',
          src5: 'SRC5/ADR',
          psycho: 'Psikoteknik',
          tacho: 'Takograf/Kart',
          passport_exp: 'Pasaport Bitiş'
        };
        
        (rows || []).forEach(row => {
          const driverWarnings = [];
          
          // Check each date field
          Object.keys(fieldLabels).forEach(field => {
            const value = row[field];
            if (value && this.isWarning(value)) {
              const days = this.getDaysUntilExpiry(value);
              driverWarnings.push({
                field: fieldLabels[field],
                value: value,
                daysLeft: days,
                status: days < 0 ? 'SÜRESI DOLDU' : (days === 0 ? 'BUGÜN DOLUYOR' : `${days} gün kaldı`)
              });
            }
          });
          
          // Check age (65+)
          if (row.dob) {
            const age = this.calculateAge(row.dob);
            if (age !== null && age >= 65) {
              driverWarnings.push({
                field: 'Yaş Uyarısı',
                value: row.dob,
                daysLeft: null,
                status: `${age} yaşında (65+ uyarı)`
              });
            }
          }
          
          if (driverWarnings.length > 0) {
            warnings.push({
              driverName: row.name || 'İsimsiz Şoför',
              driverId: row.id,
              warnings: driverWarnings
            });
          }
        });
        
        resolve(warnings);
      });
    });
  },

  /**
   * Create email transporter
   * @returns {Object} - nodemailer transporter
   */
  createTransporter() {
    return nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.yandex.com',
      port: parseInt(process.env.MAIL_PORT) || 465,
      secure: process.env.MAIL_SECURE === 'true' || true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
      }
    });
  },

  /**
   * Generate HTML email content
   * @param {Array} warnings - Array of driver warnings
   * @returns {string} - HTML content
   */
  generateEmailHtml(warnings) {
    const today = new Date().toLocaleDateString('tr-TR');
    warnings.sort((a, b) => a.driverName.localeCompare(b.driverName, 'tr'));
    const totalWarnings = warnings.reduce((sum, d) => sum + d.warnings.length, 0);

    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body style="margin:0;padding:16px;font-family:Arial,sans-serif;background:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:950px;margin:0 auto;">
<tr>
<td style="background:#1e293b;border-radius:10px;padding:12px 20px;border:1px solid #334155;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:16px;font-weight:bold;color:#f8fafc;">🚨 VizeBest Uyarı Raporu</td>
<td style="color:#94a3b8;font-size:12px;text-align:center;">${today}</td>
<td style="text-align:right;">
<span style="font-size:18px;font-weight:bold;color:#38bdf8;">${warnings.length}</span>
<span style="font-size:10px;color:#64748b;margin-right:12px;"> ŞOFÖR</span>
<span style="font-size:18px;font-weight:bold;color:#38bdf8;">${totalWarnings}</span>
<span style="font-size:10px;color:#64748b;"> UYARI</span>
</td>
</tr>
</table>
</td>
</tr>
<tr><td style="height:12px;"></td></tr>
<tr>
<td style="background:#1e293b;border-radius:10px;overflow:hidden;border:1px solid #334155;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr style="background:#0f172a;">
<td style="padding:10px 14px;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;width:180px;border-bottom:1px solid #334155;">Şoför Adı</td>
<td style="padding:10px 14px;font-size:11px;font-weight:bold;color:#94a3b8;text-transform:uppercase;border-bottom:1px solid #334155;">Yaklaşan Belgeler</td>
</tr>`;

    warnings.forEach((driver, idx) => {
      const bgColor = idx % 2 === 0 ? '#1e293b' : '#253347';
      html += `<tr style="background:${bgColor};">
<td style="padding:8px 14px;color:#f1f5f9;font-weight:bold;font-size:13px;border-bottom:1px solid #334155;vertical-align:middle;">${driver.driverName}</td>
<td style="padding:6px 14px;border-bottom:1px solid #334155;vertical-align:middle;">`;
      
      driver.warnings.forEach(w => {
        let bgStyle = 'background:#a16207;color:#fefce8;';
        if (w.daysLeft === null) bgStyle = 'background:#9333ea;color:#faf5ff;';
        else if (w.daysLeft < 0) bgStyle = 'background:#dc2626;color:#fff;';
        else if (w.daysLeft <= 30) bgStyle = 'background:#ea580c;color:#fff;';
        
        html += `<span style="display:inline-block;${bgStyle}border-radius:5px;padding:5px 10px;margin:2px 3px 2px 0;font-size:13px;font-weight:600;white-space:nowrap;">${w.field}: <strong style="font-size:14px;">${w.value}</strong> <span style="opacity:0.8;font-size:11px;">(${w.status})</span></span>`;
      });
      
      html += `</td></tr>`;
    });

    html += `</table>
</td>
</tr>
<tr><td style="text-align:center;padding:12px;color:#475569;font-size:10px;">Best Freight © ${new Date().getFullYear()}</td></tr>
</table>
</body>
</html>`;
    return html;
  },

  /**
   * Send alert email with retry
   * @param {string} toEmail - Recipient email address
   * @param {number} retries - Number of retries (default 3)
   * @returns {Promise<Object>} - Send result
   */
  async sendAlertEmail(toEmail, retries = 3) {
    try {
      const warnings = await this.getExpiringDocuments();
      
      if (warnings.length === 0) {
        console.log('[VizeAlert] Uyarı yok, mail gönderilmedi.');
        return { success: true, message: 'No warnings to send', sent: false };
      }
      
      const transporter = this.createTransporter();
      const html = this.generateEmailHtml(warnings);
      
      const mailOptions = {
        from: `"VizeBest Uyarı" <${process.env.MAIL_USER}>`,
        to: toEmail,
        subject: `🚨 VizeBest - ${warnings.length} Şoför Uyarı`,
        html: html
      };
      
      // Retry logic for temporary failures
      let lastError;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const info = await transporter.sendMail(mailOptions);
          console.log('[VizeAlert] Mail gönderildi:', info.messageId);
          return { 
            success: true, 
            message: 'Email sent successfully', 
            sent: true,
            messageId: info.messageId,
            warningCount: warnings.length
          };
        } catch (err) {
          lastError = err;
          // Check if it's a temporary error (4xx)
          if (err.responseCode >= 400 && err.responseCode < 500 && attempt < retries) {
            const waitMs = attempt * 5000; // 5s, 10s, 15s
            console.log(`[VizeAlert] Geçici hata (${err.responseCode}), ${waitMs/1000}s sonra tekrar denenecek...`);
            await new Promise(r => setTimeout(r, waitMs));
          } else {
            throw err;
          }
        }
      }
      throw lastError;
    } catch (error) {
      console.error('[VizeAlert] Mail gönderme hatası:', error);
      return { 
        success: false, 
        message: error.message, 
        sent: false 
      };
    }
  },

  /**
   * Get warnings summary (for API endpoint)
   * @returns {Promise<Object>}
   */
  async getWarningsSummary() {
    try {
      const warnings = await this.getExpiringDocuments();
      return {
        success: true,
        totalDrivers: warnings.length,
        totalWarnings: warnings.reduce((sum, d) => sum + d.warnings.length, 0),
        drivers: warnings
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

module.exports = VizeAlertService;
