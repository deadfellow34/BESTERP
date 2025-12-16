const db = require('../config/db');
const StatsService = require('../services/statsService');
const TripProfitService = require('../services/tripProfitService');
const TruckNoteModel = require('../models/truckNoteModel');

const VehicleController = {
  async show(req, res, next) {
    // require login to view this page
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    const id = req.params.id;
    
    // Get year from query or use current year
    const year = req.query.year || res.locals.year || new Date().getFullYear();
    const yearPrefix = String(year).slice(-2); // 2025 -> "25"
    const yearPattern = yearPrefix + '/%';
    
    try {
      // helper to safely render and catch template errors
      const safeRender = (view, ctx) => {
        try {
          return res.render(view, Object.assign({ year }, ctx));
        } catch (renderErr) {
          return next(renderErr);
        }
      };
      // get truck row
      const sqlTruck = 'SELECT id, plate, driver_name FROM trucks WHERE id = ?';
      db.get(sqlTruck, [id], (err, truck) => {
        try {
          if (err) return next(err);
          if (!truck) return res.status(404).send('Araç bulunamadı');

          StatsService.getVehicleStatsById(id, yearPrefix, (sErr, stats) => {
            try {
              if (sErr) return next(sErr);

              // pagination settings
              const page = parseInt(req.query.page, 10) || 1;
              const pageSize = 20;
              const offset = (page - 1) * pageSize;

              // total count - filtered by year
              const sqlCount = 'SELECT COUNT(DISTINCT position_no) as total FROM loads WHERE truck_plate = ? AND position_no LIKE ?';
              db.get(sqlCount, [truck.plate, yearPattern], (cErr, cRow) => {
                try {
                  if (cErr) return next(cErr);
                  const totalTrips = cRow && cRow.total ? Number(cRow.total) : 0;
                  const totalPages = totalTrips > 0 ? Math.max(1, Math.ceil(totalTrips / pageSize)) : 1;

                  // fetch distinct position_no for this page - filtered by year
                  const sqlPos = 'SELECT DISTINCT position_no FROM loads WHERE truck_plate = ? AND position_no LIKE ? ORDER BY loading_date DESC LIMIT ? OFFSET ?';
                  db.all(sqlPos, [truck.plate, yearPattern, pageSize, offset], (pErr, rows) => {
                    try {
                      if (pErr) return next(pErr);
                      const posList = (rows || []).map(r => r.position_no);
                      if (posList.length === 0) {
                        return safeRender('vehicles/show', { truck, stats, recentTrips: [], page, totalPages, totalTrips, notes: [] });
                      }

                      const placeholders = posList.map(() => '?').join(',');
                      const sqlAgg = '' +
                        'SELECT position_no, MAX(driver_name) as driver_name, MAX(loading_city) as loading_city, MAX(unloading_city) as unloading_city, ' +
                        'SUM(COALESCE(gross_weight,0)) as gross_weight, SUM(COALESCE(packages,0)) as packages ' +
                        'FROM loads ' +
                        'WHERE position_no IN (' + placeholders + ') ' +
                        'GROUP BY position_no ' +
                        'ORDER BY MAX(loading_date) DESC';

                      db.all(sqlAgg, posList, (aErr, aggRows) => {
                        try {
                          if (aErr) return next(aErr);

                          const pkPlaceholders = posList.map(() => '?').join(',');
                          const sqlPk = 'SELECT position_no, segments, total_km, loading_count, unloading_count, exit_count, europe_count, herstal FROM position_km WHERE position_no IN (' + pkPlaceholders + ')';
                          db.all(sqlPk, posList, (pkErr, pkRows) => {
                            try {
                              if (pkErr) return next(pkErr);
                              const pkMap = {};
                              (pkRows || []).forEach(k => { pkMap[k.position_no] = k; });

                              const sqlLoads = 'SELECT position_no, uid, fatura_kime, fatura_no, ordino_cost, loading_city, driver_name, ihr_poz, trailer_plate FROM loads WHERE position_no IN (' + pkPlaceholders + ')';
                              db.all(sqlLoads, posList, (lErr, loadRows) => {
                                try {
                                  if (lErr) return next(lErr);
                                  const loadsMap = {};
                                  (loadRows || []).forEach(l => {
                                    if (!loadsMap[l.position_no]) loadsMap[l.position_no] = [];
                                    loadsMap[l.position_no].push(l);
                                  });

                                  const tasks = (aggRows || []).map(ar => {
                                    return new Promise((resolve) => {
                                      TripProfitService.getTripProfit(ar.position_no, (tErr, tp) => {
                                        const base = Object.assign({}, ar, { km: pkMap[ar.position_no] || null, loads: loadsMap[ar.position_no] || [] });
                                        try {
                                          const firstLoad = (base.loads && base.loads.length) ? base.loads[0] : null;
                                          if (!base.ihr_poz) base.ihr_poz = firstLoad && firstLoad.ihr_poz ? firstLoad.ihr_poz : null;
                                          if (!base.trailer_plate) base.trailer_plate = firstLoad && firstLoad.trailer_plate ? firstLoad.trailer_plate : null;
                                        } catch (e) {
                                          // ignore
                                        }
                                        if (tErr) {
                                          resolve(Object.assign(base, { profitDataError: true, tripProfit: null }));
                                        } else {
                                          resolve(Object.assign(base, { tripProfit: tp }));
                                        }
                                      });
                                    });
                                  });

                                  Promise.all(tasks).then(results => {
                                    try {
                                      const orderIndex = posList.reduce((acc, p, idx) => { acc[p] = idx; return acc; }, {});
                                      results.sort((a,b) => (orderIndex[a.position_no] - orderIndex[b.position_no]));

                                      // fetch notes for this truck and include them in the render context
                                      TruckNoteModel.getNotesForTruck(truck.id, (nErr, notes) => {
                                        if (nErr) {
                                          // ignore errors retrieving notes but continue rendering
                                          notes = [];
                                        }
                                        return safeRender('vehicles/show', { truck, stats, recentTrips: results, page, totalPages, totalTrips, notes });
                                      });
                                    } catch (e) {
                                      return next(e);
                                    }
                                  }).catch(e => next(e));
                                } catch (e) {
                                  return next(e);
                                }
                              });
                            } catch (e) {
                              return next(e);
                            }
                          });
                        } catch (e) {
                          return next(e);
                        }
                      });
                    } catch (e) {
                      return next(e);
                    }
                  });
                } catch (e) {
                  return next(e);
                }
              });
            } catch (e) {
              return next(e);
            }
          });
        } catch (e) {
          return next(e);
        }
      });
    } catch (e) {
      return next(e);
    }
  },

  index(req, res, next) {
    const db = require('../config/db');
    
    // Get year from query or use current year
    const year = req.query.year || res.locals.year || new Date().getFullYear();
    const yearPrefix = String(year).slice(-2); // 2025 -> "25"
    const yearPattern = yearPrefix + '/%';
    
    const sql = 'SELECT id, plate, driver_name FROM trucks WHERE active = 1 ORDER BY plate ASC';
    db.all(sql, [], (err, rows) => {
      if (err) return next(err);
      
      if (!rows || rows.length === 0) {
        return res.render('vehicles/index', { trucks: [], year });
      }
      
      // Get trip counts for each truck filtered by year
      const trucks = rows.map(r => ({ ...r, trip_count: 0 }));
      let remaining = trucks.length;
      
      trucks.forEach((truck, idx) => {
        const countSql = 'SELECT COUNT(DISTINCT position_no) as cnt FROM loads WHERE truck_plate = ? AND position_no LIKE ?';
        db.get(countSql, [truck.plate, yearPattern], (cErr, cRow) => {
          if (!cErr && cRow) {
            trucks[idx].trip_count = cRow.cnt || 0;
          }
          remaining--;
          if (remaining === 0) {
            return res.render('vehicles/index', { trucks, year });
          }
        });
      });
    });
  }
,

  addNote(req, res, next) {
    const id = req.params.id;
    // only logged-in users can add notes
    if (!req.session || !req.session.user) return res.redirect('/login');
    const text = (req.body && req.body.note) ? String(req.body.note).trim() : '';
    if (!text) return res.redirect('/vehicles/' + id);

    const user = req.session.user.username;
    TruckNoteModel.addNote(id, text, user, (err) => {
      if (err) return next(err);
      return res.redirect('/vehicles/' + id);
    });
  }

  ,

  updateNote(req, res, next) {
    // only logged-in users can edit notes
    if (!req.session || !req.session.user) return res.redirect('/login');
    const id = req.params.id;
    const noteId = req.params.noteId;
    const text = (req.body && req.body.note) ? String(req.body.note).trim() : '';
    if (!text) return res.redirect('/vehicles/' + id);

    TruckNoteModel.updateNote(noteId, text, (err) => {
      if (err) return next(err);
      return res.redirect('/vehicles/' + id);
    });
  }
  ,

  deleteNote(req, res, next) {
    // only logged-in users can delete notes
    if (!req.session || !req.session.user) return res.redirect('/login');
    const id = req.params.id;
    const noteId = req.params.noteId;

    TruckNoteModel.deleteNote(noteId, (err) => {
      if (err) return next(err);
      return res.redirect('/vehicles/' + id);
    });
  }
};

module.exports = VehicleController;
