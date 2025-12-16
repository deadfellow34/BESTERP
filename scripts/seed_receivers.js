const db = require('./src/config/db');

const companies = [
  'TIRTIL KİTAP YAYIN VE MAĞAZACILIK',
  'REMZİ KİTABEVİ NESRİYAT',
  'TURKUVAZ MÜZİK KİTAP MAĞAZACILIK',
  'NİLAR TARIM VE TOHUMCULUK AŞ',
  'AKSA JENERATÖR SAN AŞ',
  'HOMER KİTABEVİ',
  'SINIRSIZ EĞİTİM HİZMETLERİ',
  'FEDERAL MOGUL POWERTRAIN OTOMOTIV',
  'VESUVIUS ISTANBUL REFRAKTER',
  'KOROZO AMBALAJ SAN VE TIC AŞ',
  'BIESTERFELD PLASTIK TIC AS',
  'ÇAĞLAYAN KİTABEVİ',
  'AZELİS TR KİMYA ENDUSTRİ',
  'BASF TR',
  'Z ATÖLYE EĞİTİM YAYINCILIK',
  'NOBEL TİP KİTABEVİ',
  'PANDORA YAYIN VE KİTAP HIZMETLERİ',
  'TURKISH AIRLINES INC',
  'FURKAN KİMYA LTD',
  'SKY DIŞ TİC AŞ',
  'INKAS İNGİLİZCE NESRİYAT',
  'PALME YAYIN DAĞITIM PAZARLAMA',
  'GOODYEAR LASTİKLERİ TAS',
  'OTOKAR OTOMOTİV VE SAVUNMA SANAYİ AŞ',
  'ASYA TRADING FZE',
  'AMCOR FLEXIBLES ISTANBUL',
  'KEY TEKNİK YAPI MALZEMELERİ',
  'OXFORD YAYINCILIK LTD',
  'EVERGEE MÜHENDİSLİK LTD ŞTİ',
  'LİMİT OTOMOBİL MOTOSİKLET',
  'PARTEKS',
  'PARTEKS KAĞIT ENDUSTRISI AŞ',
  'SOMA KİMYA SAN VE TİC AŞ',
  'FİNAL İTHALAT VE İHRACAT  SAN VE TİC',
  'ELKİM ELEKTRO KİMYA SAN VE TİC AŞ',
  'NEXT PLASTİK KAUÇUK SAN VE TİC AŞ',
  'NCP YAYINCILIK VE DIŞ TİC LTD',
  'BASOK HIR KIMYA INS',
  'BOYKİM BOYA VE KİMYEVİ MADDELER',
  'STS KİMYASAL MADDELER VE METAL SAN DIŞ TİC',
  'TURKUVAZ SERVİS SOSYAL HİZMETLER',
  'METEKSAN MATBAACILIK AŞ',
  'TULAY BINICI – DAD BOOK',
  'ENDURO MARKET',
  'FLEXATI HORTUM VE BAGLANTI',
  'IKO KIZMETIK IC VE DIS TIC LTD',
  'MAÇKA YAYINCILIK VE EĞLENCE AŞ',
  'DOST GIDA SAN VE TİC AŞ',
  'MEGA KIDS YAY SAN VE TIC LTD',
  'ERDIL MOBILYA SAN VE TIC LTD',
  'SONMAR TİC. VE MÜMESSİLLİK LTD.',
  'MMG IZMIR KARTON SAN VE TIC AS',
  'GEDİK KAYNAK SAN VE TİC AŞ',
  'RENK MASTER PLASTIK VE KIMYA',
  'AKSA AKRILIK KIMYA VE SANAYI',
  'BLACK MUSTACHE KITABEVI',
  'UNIQ KIMYA SAN TIC AS',
  'HAYAT KIMYA SAN AS',
  'HAK ENDUSTRIYEL',
  'BARRY CALLEBAUT EURASIA GIDA',
  'ERGİN ENDUSTRİYEL YAPISTIRICILAR',
  'POLIMER KAUCUK SAN VE PAZ AŞ',
  'TAN PAZARLAMA VE DIS TIC AS',
  'ELSE ELEKTRIK MAKINA SAN VE TIC AS',
  'KAT MEKATRONIK URUNLERI AS',
  'BS TRACK MAKINA YEDEK PARCA',
  'DDP SPECIALTY PRODUCTS TURKEY',
  'TOFAS TURK OTOMOBIL FABRIKASI AS'
];

let idx = 0;

function upsertNext() {
  if (idx >= companies.length) {
    console.log('Receiver seed completed.');
    db.close(() => process.exit(0));
    return;
  }

  const name = companies[idx++];

  // Insert if missing with type 'receiver'
  const insertSql = 'INSERT OR IGNORE INTO companies (name, type) VALUES (?, ?)';
  db.run(insertSql, [name, 'receiver'], function (err) {
    if (err) {
      console.error('Insert error for', name, err.message);
      upsertNext();
      return;
    }

    // If a row existed with type 'sender' we want to make it 'both'
    const fixSql = `
      UPDATE companies
      SET type = CASE
        WHEN type = 'sender' THEN 'both'
        WHEN type IS NULL OR type = '' THEN 'receiver'
        ELSE type
      END
      WHERE name = ?
    `;

    db.run(fixSql, [name], function (err2) {
      if (err2) {
        console.error('Update error for', name, err2.message);
      } else {
        console.log('Upserted:', name);
      }
      upsertNext();
    });
  });
}

upsertNext();
