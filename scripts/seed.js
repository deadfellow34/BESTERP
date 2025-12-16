const db = require('./src/config/db');

const companies = [
  // Excel'deki tanıdık isimlerden başlayalım
  'CUMMINS TR',
  'PERKINS POWER',
  'MECC ALTE',
  'DEEP SEA ELECTRONICS',
  'ÇAĞLAYAN JENERATÖR',
  'REMZİ MOTOR',
  'SOMA ENERJİ',
  'FURKAN MAKİNA',
  'POLİMER KİMYA',
  'TURKISH CHEMICALS',
  'NOBEL KİMYA',
  'TURKUVAZ LOJİSTİK',
  'TIRTIL OYUNCAK',
  'HOMER KİMYA',
  'SINIRSIZ TEKSTİL',
  'SONMAR DENİZCİLİK',
  'TÜLAY BİNİCİ TEKSTİL',
  'VESUVIUS REFRAKTER',
  'INKAS GLOBAL',
  'PANDORA AMBALAJ',
  'SKY LOJİSTİK',
  'Z ATÖLYE TASARIM',
  'MAÇKA TEKSTİL',
  'NUANS OFİS',
  'OXFORD UNIVERSITY PRESS TR',
  'GEDİK KAYNAK',
  'MUSTACHE ACCESSORIES',
  'NCP LOJİSTİK',
  'PALME YAYINCILIK',

  // Best Freight ekosistemi tadında biraz daha dolduralım
  'BEST ULUSLARARASI NAKLİYAT',
  'BEST FREIGHT UK LTD',
  'TURAN YAYMAN NAKLİYAT',
  'AYTUĞ YAYMAN DIŞ TİCARET',
  'ANADOLU METAL',
  'MARMARA KİMYA',
  'EGE PLASTİK',
  'KARADENİZ GIDA',
  'TRAKYA CAM',
  'ANKA OTOMOTİV',
  'BOSPHORUS SHIPPING',
  'EUROTRANS LOGISTICS',
  'ISTANBUL TEXTILES',
  'ANADOLU PAPER',
  'MARMARA FOODS',
  'BALKAN LOJİSTİK',
  'DOVER WAREHOUSE LTD',
  'CALAIS DISTRIBUTION',
  'LONDON CHEMICALS',
  'MANCHESTER FOODS',
  'BIRMINGHAM METALS',
  'LEEDS PLASTICS',
  'GLASGOW EXPORT',
  'EDIRNE DEPO HİZMETLERİ',
  'KAPIKULE GÜMRÜK MÜŞAVİRLİĞİ',
  'İZMİR SERBEST BÖLGE LOJİSTİK',
  'KOCAELİ KİMYA ORGANİZE',
  'GEBZE DEPO LOJİSTİK',
  'BURSA OTOMOTİV SANAYİ'
];

const sql = 'INSERT OR IGNORE INTO companies (name) VALUES (?)';

let index = 0;

function insertNext() {
  if (index >= companies.length) {
    console.log('Firma seed işlemi bitti.');
    db.close(() => process.exit(0));
    return;
  }

  const name = companies[index++];
  db.run(sql, [name], (err) => {
    if (err) {
      console.error('Hata (firma eklenemedi):', name, '-', err.message);
    } else {
      console.log('Eklendi:', name);
    }
    insertNext();
  });
}

insertNext();
