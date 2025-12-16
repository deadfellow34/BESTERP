const db = require('../config/db');
const TripProfitService = require('../services/tripProfitService');
const RatesService = require('../services/ratesService');
const ExpenseModel = require('../models/expenseModel');
const LoadModel = require('../models/loadModel');

/**
 * Profit Controller
 * Displays profit data for all positions based on AMETA calculations
 */
module.exports = {
  /**
   * GET /profit - Main profit listing page
   * Shows all positions with their profit values in EUR
   */
  async index(req, res, next) {
    try {
      // Use global year from res.locals (set by middleware in server.js)
      const availableYears = res.locals.availableYears || [new Date().getFullYear()];
      const selectedYear = res.locals.year || availableYears[0];
      
      // Year prefix for filtering (e.g., "25" for 2025)
      const yearPrefix = selectedYear ? selectedYear.toString().slice(-2) : null;
      const yearFilter = yearPrefix ? ` AND l.position_no LIKE '${yearPrefix}/%'` : '';
        
      // Get all distinct position numbers with the best available data
      // Use COALESCE to get non-empty values from any load in the position
      // Note: loading_city often contains country names (e.g., İNGİLTERE, ALMANYA) in this DB
      const sql = `
        SELECT 
          l.position_no,
          COALESCE(
            (SELECT truck_plate FROM loads WHERE position_no = l.position_no AND truck_plate IS NOT NULL AND truck_plate != '' AND truck_plate != '-' LIMIT 1),
            l.truck_plate
          ) as truck_plate,
          COALESCE(
            (SELECT trailer_plate FROM loads WHERE position_no = l.position_no AND trailer_plate IS NOT NULL AND trailer_plate != '' AND trailer_plate != '-' LIMIT 1),
            l.trailer_plate
          ) as trailer_plate,
          COALESCE(
            (SELECT loading_city FROM loads WHERE position_no = l.position_no AND loading_city IS NOT NULL AND loading_city != '' AND loading_city != '-' LIMIT 1),
            (SELECT loading_country FROM loads WHERE position_no = l.position_no AND loading_country IS NOT NULL AND loading_country != '' AND loading_country != '-' LIMIT 1),
            l.loading_city,
            l.loading_country
          ) as loading_location,
          COALESCE(
            (SELECT loading_address FROM loads WHERE position_no = l.position_no AND loading_address IS NOT NULL AND loading_address != '' AND loading_address != '-' LIMIT 1),
            l.loading_address
          ) as loading_address,
          COALESCE(
            (SELECT unloading_country FROM loads WHERE position_no = l.position_no AND unloading_country IS NOT NULL AND unloading_country != '' AND unloading_country != '-' LIMIT 1),
            l.unloading_country
          ) as unloading_country,
          COALESCE(
            (SELECT loading_date FROM loads WHERE position_no = l.position_no AND loading_date IS NOT NULL AND loading_date != '' LIMIT 1),
            l.loading_date
          ) as loading_date,
          COALESCE(
            (SELECT status FROM loads WHERE position_no = l.position_no AND status IS NOT NULL AND status != '' LIMIT 1),
            l.status
          ) as status,
          COALESCE(
            (SELECT customer_name FROM loads WHERE position_no = l.position_no AND customer_name IS NOT NULL AND customer_name != '' AND customer_name != '-' LIMIT 1),
            l.customer_name
          ) as customer_name,
          COALESCE(
            (SELECT consignee_name FROM loads WHERE position_no = l.position_no AND consignee_name IS NOT NULL AND consignee_name != '' AND consignee_name != '-' LIMIT 1),
            l.consignee_name
          ) as consignee_name,
          COALESCE(
            (SELECT goods_description FROM loads WHERE position_no = l.position_no AND goods_description IS NOT NULL AND goods_description != '' AND goods_description != '-' LIMIT 1),
            l.goods_description
          ) as goods_description,
          COALESCE(
            (SELECT driver_name FROM loads WHERE position_no = l.position_no AND driver_name IS NOT NULL AND driver_name != '' AND driver_name != '-' LIMIT 1),
            l.driver_name
          ) as driver_name,
          (
            SELECT n.name 
            FROM named n 
            INNER JOIN loads ld ON n.load_id = ld.id 
            WHERE ld.position_no = l.position_no 
              AND n.name IS NOT NULL 
              AND n.name != '' 
            ORDER BY n.id DESC 
            LIMIT 1
          ) as type_name
        FROM loads l
        JOIN (
          SELECT position_no, MAX(id) as max_id
          FROM loads
          WHERE position_no IS NOT NULL AND position_no != ''
          GROUP BY position_no
        ) mx ON l.position_no = mx.position_no AND l.id = mx.max_id
        WHERE 1=1 ${yearFilter}
        ORDER BY l.position_no DESC, l.id DESC
      `;

      db.all(sql, [], async (err, positions) => {
        if (err) return next(err);

        // Get current exchange rates
        const rates = await RatesService.getTCMBRates();

        // OPTIMIZED: Batch profit hesaplama (N+1 query sorununu çözer)
        const positionNos = positions.map(p => p.position_no);
        const batchProfits = await TripProfitService.getBatchTripProfits(positionNos);

        // Calculate profit for each position
        const profitData = [];
        let totalProfitEUR = 0;
        let totalRevenueEUR = 0;
        let totalCostsEUR = 0;
        let validPositionCount = 0;

        // Process positions using batch results (no more N+1 queries!)
        for (const pos of positions) {
          const profitResult = batchProfits[pos.position_no];

            if (profitResult) {
              profitData.push({
                position_no: pos.position_no,
                truck_plate: pos.truck_plate || '-',
                trailer_plate: pos.trailer_plate || '-',
                loading_location: pos.loading_location || '-',
                loading_address: pos.loading_address || '-',
                unloading_country: pos.unloading_country || '-',
                loading_date: pos.loading_date || '-',
                status: pos.status || 'active',
                customer_name: pos.customer_name || '-',
                consignee_name: pos.consignee_name || '-',
                goods_description: pos.goods_description || '-',
                driver_name: pos.driver_name || '-',
                type_name: pos.type_name || '-',
                revenueEUR: profitResult.revenueEUR || 0,
                costsEUR: profitResult.costsEUR || 0,
                profitEUR: profitResult.profitEUR || 0,
                marginPercent: profitResult.marginPercent || 0,
                total_km: profitResult.total_km || 0,
                total_packages: profitResult.total_packages || 0,
                total_weight_kg: profitResult.total_weight_kg || 0
              });

              totalProfitEUR += profitResult.profitEUR || 0;
              totalRevenueEUR += profitResult.revenueEUR || 0;
              totalCostsEUR += profitResult.costsEUR || 0;
              validPositionCount++;
            } else {
              // Position has no loads or data
              profitData.push({
                position_no: pos.position_no,
                truck_plate: pos.truck_plate || '-',
                trailer_plate: pos.trailer_plate || '-',
                loading_location: pos.loading_location || '-',
                loading_address: pos.loading_address || '-',
                unloading_country: pos.unloading_country || '-',
                loading_date: pos.loading_date || '-',
                status: pos.status || 'active',
                customer_name: pos.customer_name || '-',
                consignee_name: pos.consignee_name || '-',
                goods_description: pos.goods_description || '-',
                driver_name: pos.driver_name || '-',
                type_name: pos.type_name || '-',
                revenueEUR: 0,
                costsEUR: 0,
                profitEUR: 0,
                marginPercent: 0,
                total_km: 0,
                total_packages: 0,
                total_weight_kg: 0
              });
            }
        }

        // Calculate averages
        const avgProfitEUR = validPositionCount > 0 ? totalProfitEUR / validPositionCount : 0;
        const avgMarginPercent = totalRevenueEUR > 0 ? (totalProfitEUR / totalRevenueEUR) * 100 : 0;

        res.render('profit/index', {
          profitData,
          summary: {
            totalPositions: positions.length,
            validPositions: validPositionCount,
            totalProfitEUR: totalProfitEUR.toFixed(2),
            totalRevenueEUR: totalRevenueEUR.toFixed(2),
            totalCostsEUR: totalCostsEUR.toFixed(2),
            avgProfitEUR: avgProfitEUR.toFixed(2),
            avgMarginPercent: avgMarginPercent.toFixed(2)
          },
          rates: {
            EUR: rates.EUR.toFixed(4),
            USD: rates.USD.toFixed(4),
            GBP: rates.GBP.toFixed(4)
          },
          availableYears,
          selectedYear
        });
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /profit/api/data - API endpoint for profit data (JSON)
   */
  async apiData(req, res, next) {
    try {
      const sql = `
        SELECT DISTINCT position_no
        FROM loads
        WHERE position_no IS NOT NULL AND position_no != ''
        ORDER BY position_no DESC
      `;

      db.all(sql, [], async (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const rates = await RatesService.getTCMBRates();
        const results = [];

        for (const row of rows) {
          try {
            const profitResult = await new Promise((resolve, reject) => {
              TripProfitService.getTripProfit(row.position_no, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });

            if (profitResult) {
              results.push(profitResult);
            }
          } catch (e) {
            // Skip errored positions
          }
        }

        res.json({
          success: true,
          data: results,
          rates: {
            EUR: rates.EUR,
            USD: rates.USD,
            GBP: rates.GBP
          }
        });
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * GET /profit/dashboard - Profit dashboard with charts
   */
  async dashboard(req, res, next) {
    try {
      // Use global year from res.locals (set by middleware in server.js)
      const availableYears = res.locals.availableYears || [new Date().getFullYear()];
      const selectedYear = res.locals.year || availableYears[0];
      
      const rates = await RatesService.getTCMBRates();
      res.render('profit/dashboard', {
        rates: {
          EUR: rates.EUR.toFixed(4),
          USD: rates.USD.toFixed(4),
          GBP: rates.GBP.toFixed(4)
        },
        availableYears,
        selectedYear
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /profit/api/dashboard - API endpoint for dashboard chart data
   */
  async apiDashboard(req, res, next) {
    try {
      const rates = await RatesService.getTCMBRates();
      
      // Get year filter from query
      const year = req.query.year;
      const yearPrefix = year ? year.toString().slice(-2) : null;
      const yearFilter = yearPrefix ? ` AND l.position_no LIKE '${yearPrefix}/%'` : '';

      // Get all positions with their loading dates and type_name
      const sql = `
        SELECT 
          l.position_no,
          COALESCE(
            (SELECT loading_date FROM loads WHERE position_no = l.position_no AND loading_date IS NOT NULL AND loading_date != '' LIMIT 1),
            l.loading_date,
            l.created_at
          ) as loading_date,
          COALESCE(
            (SELECT customer_name FROM loads WHERE position_no = l.position_no AND customer_name IS NOT NULL AND customer_name != '' AND customer_name != '-' LIMIT 1),
            l.customer_name
          ) as customer_name,
          COALESCE(
            (SELECT loading_city FROM loads WHERE position_no = l.position_no AND loading_city IS NOT NULL AND loading_city != '' LIMIT 1),
            (SELECT loading_country FROM loads WHERE position_no = l.position_no AND loading_country IS NOT NULL AND loading_country != '' LIMIT 1),
            l.loading_city,
            l.loading_country
          ) as loading_location,
          COALESCE(
            (SELECT status FROM loads WHERE position_no = l.position_no AND status IS NOT NULL LIMIT 1),
            l.status
          ) as status,
          (
            SELECT n.name 
            FROM named n 
            INNER JOIN loads ld ON n.load_id = ld.id 
            WHERE ld.position_no = l.position_no 
              AND n.name IS NOT NULL 
              AND n.name != '' 
            ORDER BY n.id DESC 
            LIMIT 1
          ) as type_name
        FROM loads l
        JOIN (
          SELECT position_no, MAX(id) as max_id
          FROM loads
          WHERE position_no IS NOT NULL AND position_no != ''
          GROUP BY position_no
        ) mx ON l.position_no = mx.position_no AND l.id = mx.max_id
        WHERE 1=1 ${yearFilter}
        ORDER BY l.position_no DESC
      `;

      db.all(sql, [], async (err, positions) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        // Calculate profit for each position
        const profitByMonth = {};
        const profitByType = {};
        const profitByCustomer = {}; // Group by fatura_kime (customer)
        const profitByLocation = {};
        let totalProfitEUR = 0;
        let totalRevenueEUR = 0;
        let totalCostsEUR = 0;
        let completedCount = 0;
        let activeCount = 0;

        for (const pos of positions) {
          try {
            const profitResult = await new Promise((resolve, reject) => {
              TripProfitService.getTripProfit(pos.position_no, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });

            if (profitResult) {
              const profitEUR = profitResult.profitEUR || 0;
              const revenueEUR = profitResult.revenueEUR || 0;
              const costsEUR = profitResult.costsEUR || 0;

              totalProfitEUR += profitEUR;
              totalRevenueEUR += revenueEUR;
              totalCostsEUR += costsEUR;

              // Status count
              if (pos.status === 'completed') {
                completedCount++;
              } else {
                activeCount++;
              }

              // Group by month
              const date = pos.loading_date ? new Date(pos.loading_date) : new Date();
              if (!isNaN(date.getTime())) {
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!profitByMonth[monthKey]) {
                  profitByMonth[monthKey] = { profit: 0, revenue: 0, costs: 0, count: 0 };
                }
                profitByMonth[monthKey].profit += profitEUR;
                profitByMonth[monthKey].revenue += revenueEUR;
                profitByMonth[monthKey].costs += costsEUR;
                profitByMonth[monthKey].count++;
              }

              // Group by type (from named table)
              const typeName = pos.type_name && pos.type_name !== '-' ? pos.type_name : 'Bilinmiyor';
              if (!profitByType[typeName]) {
                profitByType[typeName] = { profit: 0, revenue: 0, count: 0, positions: [] };
              }
              profitByType[typeName].profit += profitEUR;
              profitByType[typeName].revenue += revenueEUR;
              profitByType[typeName].count++;
              profitByType[typeName].positions.push(pos.position_no);

              // Group by location
              const location = pos.loading_location && pos.loading_location !== '-' ? pos.loading_location : 'Bilinmiyor';
              if (!profitByLocation[location]) {
                profitByLocation[location] = { profit: 0, revenue: 0, count: 0, positions: [] };
              }
              profitByLocation[location].profit += profitEUR;
              profitByLocation[location].revenue += revenueEUR;
              profitByLocation[location].count++;
              profitByLocation[location].positions.push(pos.position_no);

              // Group by customer (fatura_kime) with individual load revenues
              // Also determine FTL vs Parsiyel based on position
              if (profitResult.loads && profitResult.loads.length > 0) {
                function isValidCustomerLabel(val) {
                  if (!val) return false;
                  const trimmed = String(val).trim();
                  return trimmed !== '' && trimmed !== '-' && trimmed !== '""' && trimmed !== '"';
                }
                function getCustomerLabel(load) {
                  const fk = load && load.fatura_kime;
                  if (isValidCustomerLabel(fk)) return String(fk).trim();
                  const cn = load && load.customer_name;
                  if (isValidCustomerLabel(cn)) return String(cn).trim();
                  return null;
                }

                // Count unique customers in this position to determine FTL/Parsiyel
                // FTL = Only one unique customer in the entire position (regardless of load count)
                // Parsiyel = Multiple unique customers sharing the same position
                const customersInPosition = new Set();
                profitResult.loads.forEach(l => {
                  const name = getCustomerLabel(l);
                  if (name) {
                    customersInPosition.add(name);
                  }
                });
                const isFTL = customersInPosition.size === 1; // Only 1 unique customer = FTL
                
                // Track which customers we've already counted for this position (for FTL/LTL tracking)
                const countedCustomersForPosition = new Set();
                
                for (const load of profitResult.loads) {
                  const customerName = getCustomerLabel(load);
                  if (!customerName) continue;
                  const loadRevenue = load.revenueEUR || 0;
                  
                  if (!profitByCustomer[customerName]) {
                    profitByCustomer[customerName] = { revenue: 0, count: 0, ftlCount: 0, ltlCount: 0, ftlNavlunEUR: 0, ltlNavlunEUR: 0, positions: [] };
                  }
                  profitByCustomer[customerName].revenue += loadRevenue;
                  profitByCustomer[customerName].count++;

                  // Navlun totals (EUR) split by FTL/LTL at position level
                  const loadNavlunEUR = load.navlunEUR || 0;
                  if (isFTL) {
                    profitByCustomer[customerName].ftlNavlunEUR += loadNavlunEUR;
                  } else {
                    profitByCustomer[customerName].ltlNavlunEUR += loadNavlunEUR;
                  }
                  
                  // Track FTL vs LTL counts - count per POSITION, not per load
                  // Only increment once per customer per position
                  if (!countedCustomersForPosition.has(customerName)) {
                    countedCustomersForPosition.add(customerName);
                    if (isFTL) {
                      profitByCustomer[customerName].ftlCount++;
                    } else {
                      profitByCustomer[customerName].ltlCount++;
                    }
                  }
                  
                  if (!profitByCustomer[customerName].positions.includes(pos.position_no)) {
                    profitByCustomer[customerName].positions.push(pos.position_no);
                  }
                }
              }
            }
          } catch (e) {
            // Skip errored positions
          }
        }

        // Sort months chronologically
        const sortedMonths = Object.keys(profitByMonth).sort();
        const monthlyData = sortedMonths.map(month => ({
          month,
          label: formatMonthLabel(month),
          ...profitByMonth[month]
        }));

        // Get top customers by total revenue (fatura_kime based)
        const topCustomers = Object.entries(profitByCustomer)
          .map(([name, data]) => ({
            name,
            ...data,
            avgRevenue: data.count > 0 ? data.revenue / data.count : 0,
            avgFtlNavlunEUR: data.ftlCount > 0 ? (data.ftlNavlunEUR || 0) / data.ftlCount : 0
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 15);

        // Get top types by average profit per trip (keep for backward compatibility)
        const topTypes = Object.entries(profitByType)
          .map(([name, data]) => ({
            name,
            ...data,
            avgProfit: data.count > 0 ? data.profit / data.count : 0
          }))
          .sort((a, b) => b.avgProfit - a.avgProfit)
          .slice(0, 10);

        // Get top locations by profit
        const topLocations = Object.entries(profitByLocation)
          .sort((a, b) => b[1].profit - a[1].profit)
          .slice(0, 10)
          .map(([name, data]) => ({ name, ...data }));

        // Cost breakdown - get expenses with position numbers
        const expenseSql = `
          SELECT 
            pe.expense_type,
            pe.position_no,
            CAST(pe.cost_amount AS REAL) as amount,
            pe.cost_currency as currency
          FROM position_expenses pe
          WHERE pe.cost_amount IS NOT NULL AND pe.cost_amount != ''
        `;

        db.all(expenseSql, [], (expErr, expenseRows) => {
          const costBreakdown = {};
          if (expenseRows) {
            expenseRows.forEach(row => {
              const type = formatExpenseType(row.expense_type);
              const currency = 'EUR';

              const rawAmount = (row.amount || 0);
              const rawCurrency = (row.currency || '').toString().trim().toUpperCase();

              let amountForChart = rawAmount;
              // Domain rule: diger_masraflar amounts are entered in TL in this DB.
              // Convert TL -> EUR for the chart, regardless of stored/missing currency.
              if (row.expense_type === 'diger_masraflar') {
                amountForChart = rawAmount / rates.EUR;
              }
              // Domain rule: turk_transport amounts are entered in GBP in this DB.
              // Some rows may have missing/incorrect currency; treat as GBP unless explicitly TRY/TL.
              else if (row.expense_type === 'turk_transport') {
                if (rawCurrency === 'TRY' || rawCurrency === 'TL') {
                  amountForChart = rawAmount / rates.EUR;
                } else {
                  amountForChart = rawAmount * (rates.GBP / rates.EUR);
                }
              } else if (rawCurrency === 'GBP') {
                amountForChart = rawAmount * (rates.GBP / rates.EUR);
              } else if (rawCurrency === 'USD') {
                amountForChart = rawAmount * (rates.USD / rates.EUR);
              } else if (rawCurrency === 'TRY' || rawCurrency === 'TL') {
                amountForChart = rawAmount / rates.EUR;
              } else if (rawCurrency === 'EUR' || rawCurrency === '') {
                // EUR or unknown => treat as EUR
                amountForChart = rawAmount;
              } else {
                // Unknown currency => treat as EUR
                amountForChart = rawAmount;
              }

              if (!costBreakdown[type]) {
                costBreakdown[type] = { total: 0, positions: [], currency };
              }
              costBreakdown[type].total += (amountForChart || 0);
              if (row.position_no && !costBreakdown[type].positions.includes(row.position_no)) {
                costBreakdown[type].positions.push(row.position_no);
              }
            });
          }

          // SGS (fixed): 20 EUR per position (same as AMETA calc)
          // Use positions from the current filter (e.g., year=2025).
          const sgsPerPositionEUR = 20;
          const allPositionNos = (positions || []).map(p => p.position_no).filter(Boolean);
          costBreakdown['SGS'] = {
            total: (allPositionNos.length * sgsPerPositionEUR),
            positions: allPositionNos,
            currency: 'EUR'
          };

          res.json({
            success: true,
            summary: {
              totalPositions: positions.length,
              completedCount,
              activeCount,
              totalProfitEUR: totalProfitEUR.toFixed(2),
              totalRevenueEUR: totalRevenueEUR.toFixed(2),
              totalCostsEUR: totalCostsEUR.toFixed(2),
              avgProfitEUR: positions.length > 0 ? (totalProfitEUR / positions.length).toFixed(2) : '0.00',
              marginPercent: totalRevenueEUR > 0 ? ((totalProfitEUR / totalRevenueEUR) * 100).toFixed(1) : '0.0'
            },
            charts: {
              monthly: monthlyData,
              topTypes,
              topCustomers,
              topLocations,
              costBreakdown: Object.entries(costBreakdown).map(([type, data]) => ({ 
                type, 
                total: data.total,
                currency: data.currency,
                positions: data.positions 
              }))
            },
            rates: {
              EUR: rates.EUR,
              USD: rates.USD,
              GBP: rates.GBP
            }
          });
        });
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

// Helper functions
function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

function formatExpenseType(type) {
  const types = {
    'turk_transport': 'Turk Transport ',
    'diger_masraflar': 'Diğer Masraflar',
    'ordino': 'Ordino',
    'sigorta': 'Sigorta',
    'gumruk': 'Gümrük',
    'diger': 'Diğer'
  };
  return types[type] || type || 'Diğer';
}
