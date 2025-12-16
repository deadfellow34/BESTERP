// Archived copy of `loadController_new_method.js`
// Moved to archive on 2025-11-18 to avoid duplicate controllers. Kept for reference.

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

    // Model tarafı artık `uid` alanını sağlayıp eksikse DB'ye kaydedecektir.
    // Burada, view'da kullanmak için `uid4` alanını ayarlıyoruz (öncelikle DB'deki `uid`),
    // eğer yine de eksikse geçici rastgele 4 haneli UID üretiriz.
    const usedUids = new Set();
    const generateUid4 = () => {
      let uid;
      do {
        uid = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      } while (usedUids.has(uid));
      usedUids.add(uid);
      return uid;
    };

    loads.forEach(load => {
      if (load.uid) {
        load.uid4 = String(load.uid).padStart(4, '0');
        usedUids.add(load.uid4);
      } else {
        load.uid4 = generateUid4();
      }
    });

    res.render('loads/position', {
      positionNo,
      loads,
    });
  });
},
