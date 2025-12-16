// QuoteController removed — provide stub handlers returning 410
module.exports = {
  form(req, res) { return res.status(410).send('Rate calculator feature removed'); },
  calculate(req, res) { return res.status(410).send('Rate calculator feature removed'); }
};
const QuoteService = require('../services/quoteService');

const QuoteController = {
  form(req, res) {
    res.render('quote/index', { result: null, error: null, input: null });
  },

  calculate(req, res, next) {
    try {
      const km = Number(req.body.km || 0);
      const weight = Number(req.body.weight || 0);
      if (!km || km <= 0) return res.render('quote/index', { result: null, error: 'Lütfen geçerli km girin.', input: { km, weight } });
      QuoteService.estimate({ km, weight }, (err, data) => {
        if (err) return next(err);
        return res.render('quote/index', { result: data, error: null, input: { km, weight } });
      });
    } catch (e) {
      next(e);
    }
  }
};

module.exports = QuoteController;
