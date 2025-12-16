const express = require('express');
const router = express.Router();
const MailRecipientModel = require('../models/mailRecipientModel');
const db = require('../config/db');
const { ensureAuth } = require('../middleware/authMiddleware');

// GET /mail-data - Mail Data sayfasını göster
router.get('/', ensureAuth, (req, res, next) => {
  MailRecipientModel.getAll((err, mailRecipients) => {
    if (err) return next(err);

    // aggregate by alici_adi into { alici_adi, to:[], cc:[], is_active, created_at, ids:[] }
    const map = {};
    (mailRecipients || []).forEach(r => {
      const name = (r.alici_adi || '').toString().trim();
      if (!name) return;
      if (!map[name]) map[name] = { alici_adi: name, to: [], cc: [], ids: [], any_active: false, latest_created_at: r.created_at };
      const t = (r.recipient_type || 'to').toString().toLowerCase();
      if (t === 'cc') map[name].cc.push({ id: r.id, email: r.email, is_active: r.is_active });
      else map[name].to.push({ id: r.id, email: r.email, is_active: r.is_active });
      map[name].ids.push(r.id);
      if (r.is_active === 1) map[name].any_active = true;
      if (r.created_at && (!map[name].latest_created_at || new Date(r.created_at) > new Date(map[name].latest_created_at))) map[name].latest_created_at = r.created_at;
    });

    const grouped = Object.values(map).sort((a,b) => a.alici_adi.localeCompare(b.alici_adi, 'tr'));

    // fetch distinct customer names for dropdown suggestions
    db.all(`SELECT DISTINCT customer_name FROM loads WHERE customer_name IS NOT NULL AND TRIM(customer_name) <> ''`, [], (dbErr, rows) => {
      if (dbErr) return next(dbErr);
      let customers = (rows || []).map(r => r.customer_name).filter(Boolean);

      // Also include companies from companies table as fallback/augmentation
      const CompanyModel = require('../models/companyModel');
      CompanyModel.getAll((cErr, companies) => {
        if (!cErr && companies && companies.length > 0) {
          const companyNames = companies.map(c => c.name).filter(Boolean);
          customers = customers.concat(companyNames);
        }

        // dedupe and sort
        customers = Array.from(new Set(customers.map(s => s.trim()))).filter(Boolean).sort((a,b)=> a.localeCompare(b, 'tr'));

        res.render('mailData', {
          mailRecipients: grouped,
          customers: customers,
          success: req.query.success,
          error: req.query.error
        });
      });
    });
  });
});

// POST /mail-data/:name/delete-all - delete all records for a given alici_adi
router.post('/:name/delete-all', ensureAuth, (req, res, next) => {
  const name = req.params.name;
  if (!name) return res.redirect('/mail-data?error=Geçersiz isim');
  MailRecipientModel.deleteByAliciAdi(name, (err) => {
    if (err) {
      console.error('Mail recipient toplu silme hatası:', err);
      return res.redirect('/mail-data?error=Silme işlemi başarısız');
    }
    res.redirect('/mail-data?success=Kayıtlar silindi');
  });
});

// POST /mail-data - Yeni mail alıcısı ekle
router.post('/', ensureAuth, (req, res, next) => {
  const { alici_adi, email, type, sender_company } = req.body;
  
  if (!alici_adi || !email) {
    return res.redirect('/mail-data?error=Alıcı adı ve email zorunludur');
  }
  
  MailRecipientModel.create(alici_adi.trim(), email.trim(), (type || 'to'), (sender_company || null), (err, result) => {
    if (err) {
      console.error('Mail recipient ekleme hatası:', err);
      return res.redirect('/mail-data?error=Kayıt eklenirken hata oluştu');
    }
    
    res.redirect('/mail-data?success=Kayıt başarıyla eklendi');
  });
});

// POST /mail-data/:id/delete - Mail alıcısını sil
router.post('/:id/delete', ensureAuth, (req, res, next) => {
  const id = req.params.id;
  
  MailRecipientModel.delete(id, (err) => {
    if (err) {
      console.error('Mail recipient silme hatası:', err);
      return res.redirect('/mail-data?error=Silme işlemi başarısız');
    }
    
    res.redirect('/mail-data?success=Kayıt silindi');
  });
});

// POST /mail-data/:id/toggle - Aktif/Pasif durumunu değiştir
router.post('/:id/toggle', ensureAuth, (req, res, next) => {
  const id = req.params.id;
  
  MailRecipientModel.toggleActive(id, (err) => {
    if (err) {
      console.error('Mail recipient toggle hatası:', err);
      return res.redirect('/mail-data?error=Durum değiştirilemedi');
    }
    
    res.redirect('/mail-data?success=Durum değiştirildi');
  });
});

// API: GET /mail-data/emails?name=... -> returns JSON list of emails for given alici_adi
router.get('/emails', ensureAuth, (req, res, next) => {
  const name = req.query.name;
  const sender = req.query.sender || '';
  if (!name) return res.json({ emails: [] });

  if (sender) {
    MailRecipientModel.getByAliciAdiForSender(name, sender, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // map to simple email list (only active)
      const emails = (rows || []).filter(r => r.is_active === 1).map(r => r.email);
      return res.json({ emails });
    });
  } else {
    MailRecipientModel.getByAliciAdi(name, (err, emails) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ emails: emails || [] });
    });
  }
});

// GET /mail-data/emails-full?name=... -> returns rows (id,email,is_active)
router.get('/emails-full', ensureAuth, (req, res, next) => {
  const name = req.query.name;
  const sender = req.query.sender || '';
  if (!name) return res.json({ emails: [] });
  if (sender) {
    MailRecipientModel.getByAliciAdiForSender(name, sender, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ emails: rows || [] });
    });
  } else {
    MailRecipientModel.getByAliciAdiFull(name, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ emails: rows || [] });
    });
  }
});

// POST /mail-data/add-email -> add an email for given alici_adi
router.post('/add-email', ensureAuth, (req, res, next) => {
  const { alici_adi, email, type, sender_company } = req.body;
  if (!alici_adi || !email) return res.status(400).json({ success: false, error: 'alici_adi ve email gerekli' });
  MailRecipientModel.create(alici_adi.trim(), email.trim(), (type || 'to'), (sender_company || null), (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, row });
  });
});

module.exports = router;
