// QuoteService removed — keep a harmless stub
module.exports = {
  getHistoricalAverages(cb) { cb(null, { total_revenue:0, total_km:0, total_weight:0, avgPerKm:0, avgPerTon:0 }); },
  estimate({ km, weight }, cb) { cb(null, { suggested: 0, byKm:0, byTon:0, avgs: { total_revenue:0, total_km:0, total_weight:0, avgPerKm:0, avgPerTon:0 } }); }
};
