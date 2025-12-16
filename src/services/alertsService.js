/**
 * Missing Data Alerts Service
 * Identifies positions with incomplete or missing information
 */

const db = require('../config/db');

/**
 * Fatura kime alanının geçerli bir firma adı olup olmadığını kontrol eder
 * " ve - karakterleri firma adı olarak sayılmaz
 */
function isValidFaturaKime(val) {
  if (!val) return false;
  const trimmed = String(val).trim();
  return trimmed !== '' && trimmed !== '"' && trimmed !== '-' && trimmed !== '""';
}

/**
 * Alert types with severity levels
 */
const ALERT_TYPES = {
  MISSING_SEAL: { type: 'seal', label: 'Mühür Numarası Girilmemiş.', severity: 'high', icon: '🔒' },
  MISSING_LOADING_DATE: { type: 'loading_date', label: 'Yükleme Tarihi Eksik', severity: 'medium', icon: '📅' },
  MISSING_EXIT_DATE: { type: 'exit_date', label: 'Çıkış Tarihi Eksik', severity: 'medium', icon: '🚪' },
  MISSING_INVOICE: { type: 'invoice', label: 'Fatura Bilgisi Ekli değil.', severity: 'low', icon: '📄' },
  MISSING_GOODS: { type: 'goods', label: 'Mal Açıklaması Eksik', severity: 'low', icon: '📦' },
  NO_DOCUMENTS: { type: 'documents', label: 'Evrak Yüklenmemiş', severity: 'low', icon: '📎' },
  MISSING_TESLIM_CMR: { type: 'teslim_cmr', label: 'Teslim CMR Yüklenmemiş.', severity: 'high', icon: '🚛' },
  MISSING_NAVLUN: { type: 'navlun', label: 'Navlun Faturası Yüklenmemiş.', severity: 'medium', icon: '💰' },
  MISSING_NAVLUN_FATURA_NO: { type: 'navlun_fatura_no', label: 'Navlun Fatura Numarası Girilmedi', severity: 'medium', icon: '🧾' },
  MISSING_T1_GMR: { type: 't1_gmr', label: 'T1/GMR Ekli değil.', severity: 'high', icon: '📋' },
  MISSING_MRN: { type: 'mrn', label: 'MRN No Ekli değil.', severity: 'high', icon: '🔢' }
};

/**
 * Get all alerts for incomplete positions
 * @param {string} yearPrefix - Optional year prefix to filter (e.g., "25" for 2025)
 * @returns {Promise<Array>} Array of alert objects
 */
function getAlerts(yearPrefix = null) {
  return new Promise((resolve, reject) => {
    // Year filter for position_no
    const yearFilter = yearPrefix ? ` AND l.position_no LIKE '${yearPrefix}/%'` : '';
    
    // Get all open positions (not completed)
    const sql = `
      SELECT 
        l.id,
        l.position_no,
        l.uid,
        l.customer_name,
        l.consignee_name,
        l.truck_plate,
        l.trailer_plate,
        l.driver_name,
        l.seal_code,
        l.mrn_no,
        l.loading_date,
        l.exit_date,
        l.arrival_date,
        l.goods_description,
        l.fatura_no,
        l.fatura_kime,
        l.navlun_amount,
        l.navlun_currency,
        l.status,
        l.no_expense,
        l.created_at
      FROM loads l
      WHERE (l.status IS NULL OR l.status != 'completed')${yearFilter}
      ORDER BY l.created_at DESC
    `;

    db.all(sql, [], (err, loads) => {
      if (err) return reject(err);

      // Group by position_no
      const positions = {};
      loads.forEach(load => {
        if (!positions[load.position_no]) {
          positions[load.position_no] = {
            position_no: load.position_no,
            loads: [],
            alerts: [],
            created_at: load.created_at
          };
        }
        positions[load.position_no].loads.push(load);
      });

      const positionNos = Object.keys(positions);
      
      if (positionNos.length === 0) {
        return resolve([]);
      }

      const placeholders = positionNos.map(() => '?').join(',');

      // Check documents
      const docSql = `
        SELECT position_no, category, COUNT(*) as cnt 
        FROM documents 
        WHERE position_no IN (${placeholders})
        GROUP BY position_no, category
      `;

      db.all(docSql, positionNos, (docErr, docRows) => {
        if (docErr) return reject(docErr);

        // Map documents by position and category
        const docMap = {};
        const cmrMap = {};
        const navlunMap = {};
        const t1GmrCmrMap = {};
        (docRows || []).forEach(r => {
          if (!docMap[r.position_no]) docMap[r.position_no] = 0;
          docMap[r.position_no] += r.cnt;
          
          if (r.category === 'CMR') {
            cmrMap[r.position_no] = r.cnt;
          }
          if (r.category === 'Navlun') {
            navlunMap[r.position_no] = r.cnt;
          }
          if (r.category === 'T1/GMR') {
            t1GmrCmrMap[r.position_no] = r.cnt;
          }
        });

        // Analyze each position for missing data
        const allAlerts = [];

        positionNos.forEach(posNo => {
          const pos = positions[posNo];
          const representativeLoad = pos.loads[0];
          const posAlerts = [];

          // Check for missing seal
          const hasSeal = pos.loads.some(l => l.seal_code && String(l.seal_code).trim() !== '');
          if (!hasSeal) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_SEAL });
          }

          // Check for missing loading date
          const hasLoadingDate = pos.loads.some(l => l.loading_date);
          if (!hasLoadingDate) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_LOADING_DATE });
          }

          // Check for missing exit date
          const hasExitDate = pos.loads.some(l => l.exit_date);
          if (!hasExitDate) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_EXIT_DATE });
          }

          // Check for missing goods description
          const hasGoods = pos.loads.some(l => l.goods_description && String(l.goods_description).trim() !== '');
          if (!hasGoods) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_GOODS });
          }

          // Check for documents
          const hasDocs = (docMap[posNo] || 0) > 0;
          if (!hasDocs) {
            posAlerts.push({ ...ALERT_TYPES.NO_DOCUMENTS });
          }

          // Check for Teslim CMR
          const hasTeslimCMR = (cmrMap[posNo] || 0) > 0;
          if (!hasTeslimCMR) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_TESLIM_CMR });
          }

          // Check for Navlun
          const hasNavlun = (navlunMap[posNo] || 0) > 0;
          if (!hasNavlun) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_NAVLUN });
          }

          // Check for T1/GMR
          const hasT1Gmr = (t1GmrCmrMap[posNo] || 0) > 0;
          if (!hasT1Gmr) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_T1_GMR });
          }

          // Check for MRN No
          const hasMrn = pos.loads.some(l => l.mrn_no && String(l.mrn_no).trim() !== '');
          if (!hasMrn) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_MRN });
          }

          // Check for Navlun Fatura No - if navlun info exists but fatura_no is missing
          // Her yük için ayrı ayrı kontrol et - navlun bilgisi olan yükte fatura no da olmalı
          const hasNavlunWithoutFaturaNo = pos.loads.some(l => {
            const hasNavlunInfo = (l.navlun_amount && String(l.navlun_amount).trim() !== '') || isValidFaturaKime(l.fatura_kime);
            const hasFaturaNo = l.fatura_no && String(l.fatura_no).trim() !== '';
            return hasNavlunInfo && !hasFaturaNo;
          });
          if (hasNavlunWithoutFaturaNo) {
            posAlerts.push({ ...ALERT_TYPES.MISSING_NAVLUN_FATURA_NO });
          }

          // Add to all alerts if there are any
          if (posAlerts.length > 0) {
            // Collect unique senders and receivers
            const senders = [...new Set(pos.loads.map(l => l.customer_name).filter(n => n && n.trim()))];
            const receivers = [...new Set(pos.loads.map(l => l.consignee_name).filter(n => n && n.trim()))];
            
            // Find truck plate, trailer plate and driver from any load
            const truckPlate = pos.loads.find(l => l.truck_plate && String(l.truck_plate).trim())?.truck_plate || '';
            const trailerPlate = pos.loads.find(l => l.trailer_plate && String(l.trailer_plate).trim())?.trailer_plate || '';
            const driverName = pos.loads.find(l => l.driver_name && String(l.driver_name).trim())?.driver_name || '';
            
            allAlerts.push({
              position_no: posNo,
              customer: representativeLoad.customer_name || '-',
              truck: truckPlate,
              trailer: trailerPlate,
              driver: driverName,
              senders: senders,
              receivers: receivers,
              created_at: pos.created_at,
              alerts: posAlerts,
              alert_count: posAlerts.length,
              has_high_severity: posAlerts.some(a => a.severity === 'high')
            });
          }
        });

        // Sort by severity (high first) then by alert count
        allAlerts.sort((a, b) => {
          if (a.has_high_severity && !b.has_high_severity) return -1;
          if (!a.has_high_severity && b.has_high_severity) return 1;
          return b.alert_count - a.alert_count;
        });

        resolve(allAlerts);
      });
    });
  });
}

/**
 * Get summary statistics for alerts
 * @param {string} yearPrefix - Optional year prefix to filter (e.g., "25" for 2025)
 * @returns {Promise<Object>} Alert summary
 */
function getAlertSummary(yearPrefix = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const alerts = await getAlerts(yearPrefix);
      
      const summary = {
        total_positions_with_alerts: alerts.length,
        total_alerts: alerts.reduce((sum, a) => sum + a.alert_count, 0),
        high_severity_count: alerts.filter(a => a.has_high_severity).length,
        by_type: {}
      };

      // Count by type
      alerts.forEach(pos => {
        pos.alerts.forEach(alert => {
          if (!summary.by_type[alert.type]) {
            summary.by_type[alert.type] = { count: 0, label: alert.label, icon: alert.icon, severity: alert.severity };
          }
          summary.by_type[alert.type].count++;
        });
      });

      resolve(summary);
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
  getAlerts,
  getAlertSummary,
  ALERT_TYPES
};
