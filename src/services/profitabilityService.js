// Profitability service removed. Keep a harmless stub to avoid runtime requires.
module.exports = {
  getPositionProfit(positionNo, cb) {
    return cb(null, { position_no: positionNo, revenue: 0, loadCosts: 0, posExpenses: 0, costs: 0, profit: 0, total_km: 0 });
  }
};
