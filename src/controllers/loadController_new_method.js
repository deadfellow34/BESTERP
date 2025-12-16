  // /loads/position/:positionNo - all loads for this position
  showPositionLoads(req, res, next) {
    const positionNo = req.params.positionNo;

    LoadModel.getByPositionNo(positionNo, (err, loads) => {
      if (err) return next(err);

      if (!loads || loads.length === 0) {
        return res.status(404).render('error', {
          message: `Pozisyon ${positionNo} bulunamadı.`,
        });
      }

      res.render('loads/position', {
        positionNo,
        loads,
      });
    });
  },
