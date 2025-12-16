const db = require('../config/db');
const ExpenseModel = require('../models/expenseModel');
const RatesService = require('./ratesService');

// Returns a TripProfit object for a given position_no
// TripProfit: { position_no, revenue, loadCosts, expenses, profit, marginPercent, total_km, total_weight_kg, total_packages }
const TripProfitService = {
  /**
   * BATCH: Birden fazla pozisyon için profit hesapla (N+1 query sorununu çözer)
   * @param {string[]} positionNos - Pozisyon numaraları dizisi
   * @returns {Promise<Object>} - { position_no: profitResult } şeklinde map
   */
  async getBatchTripProfits(positionNos) {
    if (!positionNos || positionNos.length === 0) return {};
    
    const rates = await RatesService.getTCMBRates();
    const results = {};
    
    // Tüm pozisyonlar için tek sorguda loads çek (sadece gerekli kolonlar)
    const placeholders = positionNos.map(() => '?').join(',');
    const loadsPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT position_no, navlun_amount, navlun_currency, ydg_amount, ordino_cost, gross_weight, packages FROM loads WHERE position_no IN (${placeholders})`,
        positionNos,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });
    
    // Tüm pozisyonlar için tek sorguda expenses çek (sadece gerekli kolonlar)
    const expensesPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT position_no, expense_type, cost_amount, cost_currency FROM position_expenses WHERE position_no IN (${placeholders})`,
        positionNos,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });
    
    // Tüm pozisyonlar için tek sorguda km çek
    const kmPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT position_no, COALESCE(SUM(total_km),0) as total_km FROM position_km WHERE position_no IN (${placeholders}) GROUP BY position_no`,
        positionNos,
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });
    
    try {
      const [allLoads, allExpenses, allKm] = await Promise.all([loadsPromise, expensesPromise, kmPromise]);
      
      // Pozisyon bazında grupla
      const loadsByPos = {};
      const expensesByPos = {};
      const kmByPos = {};
      
      allLoads.forEach(l => {
        if (!loadsByPos[l.position_no]) loadsByPos[l.position_no] = [];
        loadsByPos[l.position_no].push(l);
      });
      
      allExpenses.forEach(e => {
        if (!expensesByPos[e.position_no]) expensesByPos[e.position_no] = [];
        expensesByPos[e.position_no].push(e);
      });
      
      allKm.forEach(k => {
        kmByPos[k.position_no] = Number(k.total_km || 0);
      });
      
      // Her pozisyon için profit hesapla (in-memory, DB sorgusu yok)
      for (const positionNo of positionNos) {
        const loads = loadsByPos[positionNo] || [];
        if (loads.length === 0) {
          results[positionNo] = null;
          continue;
        }
        
        results[positionNo] = this._calculateProfit(positionNo, loads, expensesByPos[positionNo] || [], kmByPos[positionNo] || 0, rates);
      }
      
      return results;
    } catch (err) {
      console.error('[TripProfitService] Batch profit error:', err.message);
      return {};
    }
  },
  
  /**
   * In-memory profit hesaplama (DB sorgusu yapmaz)
   */
  _calculateProfit(positionNo, loads, expenses, total_km, rates) {
    let genelToplamTL = 0;
    let ordinoCostTL = 0;
    
    loads.forEach(load => {
      const navlun = parseFloat(load.navlun_amount) || 0;
      const ydgAmount = parseFloat(load.ydg_amount) || 0;
      const ordino = parseFloat(load.ordino_cost) || 0;
      const currency = (load.navlun_currency || 'EUR').toUpperCase();
      let rate = 1;
      if (currency === 'USD') rate = rates.USD;
      else if (currency === 'EUR') rate = rates.EUR;
      else if (currency === 'GBP') rate = rates.GBP;
      else if (currency === 'TRY' || currency === 'TL') rate = 1;

      genelToplamTL += (navlun * rate) + (ydgAmount * rates.EUR) + ordino;
      ordinoCostTL += ordino;
    });
    
    const acentaSgsExpenseEUR = 20;
    let turkTransportExpenseGBP = 0;
    let digerMasraflarTL = 0;
    
    expenses.forEach(exp => {
      if (exp.expense_type === 'turk_transport') {
        turkTransportExpenseGBP += parseFloat(exp.cost_amount) || 0;
      } else if (exp.expense_type === 'diger_masraflar') {
        digerMasraflarTL += parseFloat(exp.cost_amount) || 0;
      }
    });
    
    const turkTransportExpenseEUR = turkTransportExpenseGBP * (rates.GBP / rates.EUR);
    const digerMasraflarEUR = digerMasraflarTL / rates.EUR;
    const ordinoCostEUR = ordinoCostTL / rates.EUR;

    // Ordino is excluded from total costs (Toplam Gider)
    const giderToplamEUR = acentaSgsExpenseEUR + turkTransportExpenseEUR + digerMasraflarEUR;
    const giderToplamTL = (acentaSgsExpenseEUR * rates.EUR) + (turkTransportExpenseGBP * rates.GBP) + digerMasraflarTL;
    
    const kalanTL = genelToplamTL - giderToplamTL;
    const kalanEUR = kalanTL / rates.EUR;
    
    const total_weight_kg = loads.reduce((acc, r) => acc + (Number(r.gross_weight || 0)), 0);
    const total_packages = loads.reduce((acc, r) => acc + (Number(r.packages || 0)), 0);
    
    const revenueEUR = genelToplamTL / rates.EUR;
    
    return {
      position_no: positionNo,
      revenueEUR: Number(revenueEUR.toFixed(2)),
      costsEUR: Number(giderToplamEUR.toFixed(2)),
      profitEUR: Number(kalanEUR.toFixed(2)),
      marginPercent: revenueEUR !== 0 ? Number(((kalanEUR / revenueEUR) * 100).toFixed(2)) : null,
      total_km,
      total_weight_kg,
      total_packages,
      genelToplamTL: Number(genelToplamTL.toFixed(2)),
      giderToplamTL: Number(giderToplamTL.toFixed(2)),
    };
  },

  async getTripProfit(positionNo, callback) {
    try {
      // Fetch loads for the position (sadece gerekli kolonlar)
      const sqlLoads = `SELECT id, position_no, fatura_kime, customer_name, navlun_amount, navlun_currency, ydg_amount, ordino_cost, gross_weight, packages FROM loads WHERE position_no = ?`;
      db.all(sqlLoads, [positionNo], async (lErr, loads) => {
        if (lErr) return callback(lErr);
        if (!loads || loads.length === 0) return callback(null, null);

        // Get rates (shared service handles caching)
        const rates = await RatesService.getTCMBRates();

        // Genel toplam (TL): navlun*rate + ydg*EUR_rate + ordino_cost (TL assumed)
        let genelToplamTL = 0;
        let ordinoCostTL = 0;
        loads.forEach(load => {
          const navlun = parseFloat(load.navlun_amount) || 0;
          const ydgAmount = parseFloat(load.ydg_amount) || 0;
          const ordino = parseFloat(load.ordino_cost) || 0;
          const currency = (load.navlun_currency || 'EUR').toUpperCase();
          let rate = 1;
          if (currency === 'USD') rate = rates.USD;
          else if (currency === 'EUR') rate = rates.EUR;
          else if (currency === 'GBP') rate = rates.GBP;
          else if (currency === 'TRY' || currency === 'TL') rate = 1;

          genelToplamTL += (navlun * rate) + (ydgAmount * rates.EUR) + ordino;
          ordinoCostTL += ordino;
        });

        // Expenses from position_expenses
        ExpenseModel.getByPositionNo(positionNo, (eErr, expensesRows) => {
          if (eErr) return callback(eErr);

          const acentaSgsExpenseEUR = 20; // fixed as in AMETA
          let turkTransportExpenseGBP = 0;
          let digerMasraflarTL = 0;

          if (expensesRows && expensesRows.length) {
            expensesRows.forEach(exp => {
              if (exp.expense_type === 'turk_transport') {
                turkTransportExpenseGBP += parseFloat(exp.cost_amount) || 0;
              } else if (exp.expense_type === 'diger_masraflar') {
                digerMasraflarTL += parseFloat(exp.cost_amount) || 0;
              }
            });
          }

          // Convert to EUR
          const turkTransportExpenseEUR = turkTransportExpenseGBP * (rates.GBP / rates.EUR);
          const digerMasraflarEUR = digerMasraflarTL / rates.EUR;
          const ordinoCostEUR = ordinoCostTL / rates.EUR;

          // Ordino is excluded from total costs (Toplam Gider)
          const giderToplamEUR = acentaSgsExpenseEUR + turkTransportExpenseEUR + digerMasraflarEUR;
          const giderToplamTL = (acentaSgsExpenseEUR * rates.EUR) + (turkTransportExpenseGBP * rates.GBP) + digerMasraflarTL;

          const kalanTL = genelToplamTL - giderToplamTL;
          const kalanEUR = kalanTL / rates.EUR;

          // Additional aggregates
          const total_weight_kg = loads.reduce((acc, r) => acc + (Number(r.gross_weight || 0)), 0);
          const total_packages = loads.reduce((acc, r) => acc + (Number(r.packages || 0)), 0);

          // total_km
          const sqlPosKm = `SELECT COALESCE(SUM(total_km),0) as total_km FROM position_km WHERE position_no = ?`;
          db.get(sqlPosKm, [positionNo], (kErr, kRow) => {
            if (kErr) return callback(kErr);
            const total_km = kRow ? Number(kRow.total_km || 0) : 0;

            const result = {
              position_no: positionNo,
              // AMETA-based values (EUR)
              revenueEUR: null, // detailed revenue per AMETA not separated here
              costsEUR: Number(giderToplamEUR.toFixed(2)),
              profitEUR: Number(kalanEUR.toFixed(2)),
              marginPercent: null,
              total_km,
              total_weight_kg,
              total_packages,
              // keep raw TL values for debugging
              genelToplamTL: Number(genelToplamTL.toFixed(2)),
              giderToplamTL: Number(giderToplamTL.toFixed(2)),
              // Include loads with individual revenue for customer grouping
              loads: loads.map(load => {
                const navlun = parseFloat(load.navlun_amount) || 0;
                const ydgAmount = parseFloat(load.ydg_amount) || 0;
                const ordino = parseFloat(load.ordino_cost) || 0;
                const currency = (load.navlun_currency || 'EUR').toUpperCase();
                let rate = 1;
                if (currency === 'USD') rate = rates.USD;
                else if (currency === 'EUR') rate = rates.EUR;
                else if (currency === 'GBP') rate = rates.GBP;
                else if (currency === 'TRY' || currency === 'TL') rate = 1;
                const loadTotalTL = (navlun * rate) + (ydgAmount * rates.EUR) + ordino;

                let navlunEUR = 0;
                if (currency === 'EUR') navlunEUR = navlun;
                else if (currency === 'USD') navlunEUR = navlun * (rates.USD / rates.EUR);
                else if (currency === 'GBP') navlunEUR = navlun * (rates.GBP / rates.EUR);
                else if (currency === 'TRY' || currency === 'TL') navlunEUR = navlun / rates.EUR;
                else navlunEUR = (navlun * rate) / rates.EUR;
                return {
                  id: load.id,
                  fatura_kime: load.fatura_kime || '',
                  customer_name: load.customer_name || '',
                  navlun_amount: navlun,
                  navlun_currency: currency,
                  ydg_amount: ydgAmount,
                  ordino_cost: ordino,
                  revenueEUR: Number((loadTotalTL / rates.EUR).toFixed(2)),
                  navlunEUR: Number((navlunEUR || 0).toFixed(2))
                };
              })
            };

            // Try to compute marginPercent if revenue known: estimate revenueEUR as (genelToplamTL / rates.EUR)
            const revenueEUR = genelToplamTL / rates.EUR;
            result.revenueEUR = Number(revenueEUR.toFixed(2));
            result.marginPercent = revenueEUR !== 0 ? Number(((result.profitEUR / revenueEUR) * 100).toFixed(2)) : null;

            return callback(null, result);
          });
        });
      });
    } catch (err) {
      return callback(err);
    }
  }
};

module.exports = TripProfitService;
