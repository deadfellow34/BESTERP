const db = require('./src/config/db');

// Çekici plakası - Şoför eşleştirmesi
const truckDrivers = [
  { plate: '34 AKA 910', driver: 'OKTAY ÖZKURT' },
  { plate: '34 AKA 911', driver: 'METİN ŞAHİNKUŞ' },
  { plate: '34 AKA 912', driver: 'ÇETİN ŞAHİNKUŞ' },
  { plate: '34 AKA 913', driver: 'UĞUR DÖKMETAŞ' },
  { plate: '34 AKA 914', driver: 'SABRİ ATILIM KAZGAN' },
  { plate: '34 AKA 915', driver: 'BAHADIR KARADAŞ' },
  { plate: '34 AKA 916', driver: 'FERAT ÖZTOPRAK' },
  { plate: '34 AKA 917', driver: 'MURAT KAPLAN' },
  { plate: '34 AKA 918', driver: 'ŞEMSETTİN BAŞ' },
  { plate: '34 AKA 919', driver: 'YAŞAR KAYA' },
  { plate: '34 AKA 920', driver: 'FAHRETTİN DEMİR' },
  { plate: '34 AKA 921', driver: 'VOLKAN ÖZPİNAR' },
  { plate: '34 AKA 922', driver: 'ÜMİT KARTAL' },
  { plate: '34 AKA 923', driver: 'MUSTAFA AY' },
  { plate: '34 AKA 924', driver: 'MUSTAFA HOŞHAL' },
  { plate: '34 AKA 951', driver: 'ALİ ILGIN' },
  { plate: '34 AKA 952', driver: 'MUSTAFA BEŞER' },
  { plate: '34 AKA 953', driver: 'ENDER BIÇAKÇI' },
  { plate: '34 AKA 954', driver: 'AHMET HASBAŞ' },
  { plate: '34 AKA 955', driver: 'SAMET TEPE' },
  { plate: '34 AKA 956', driver: 'MEHMET ENİS ZEYBEL' },
  { plate: '34 AKA 957', driver: 'MUAMMER GÜLMEZ' },
  { plate: '34 AKA 958', driver: 'MUSA BARGOZ' },
  { plate: '34 AKA 959', driver: 'YALÇIN KARABAŞ' },
  { plate: '34 AKA 960', driver: 'MUHARREM KÜLCÜR' },
  { plate: '34 AKA 961', driver: 'HASAN UNAL' },
  { plate: '34 AKA 962', driver: 'İBRAHİM SAĞLAM' },
  { plate: '34 AKA 963', driver: 'MEHMET TÜTÜNCÜKARA' },
  { plate: '34 AKA 964', driver: 'ÖMER YOLDAŞ' },
  { plate: '34 AKA 965', driver: 'RAMAZAN KARATAŞ' },
  { plate: '34 AKA 966', driver: 'MEHMET BOLTÜRK' },
  { plate: '34 AKA 967', driver: 'HASAN KAYA' },
  { plate: '34 AKA 968', driver: 'YILMAZ DEMİR' },
  { plate: '34 AKA 969', driver: 'SEDAT KARAKOÇEK' },
  { plate: '34 AKA 970', driver: 'MESUT KIRAY' },
  { plate: '34 AKA 971', driver: 'HACI USTKAT' },
  { plate: '34 AKA 972', driver: 'CEMİL YILMAZ' },
  { plate: '34 AKA 973', driver: 'İLHAN SARIBAYRAKDAROĞLU' },
  { plate: '34 AKA 975', driver: 'İBRAHİM UZUNAY' },
  { plate: '34 AKA 976', driver: 'MUSTAFA TOMAL' },
  { plate: '34 KIB 326', driver: 'SÜLEYMAN ÖZDEPE' },
  { plate: '34 KIB 327', driver: 'MUSTAFA KEMAL TURAN' },
  { plate: '34 KIB 328', driver: 'HÜSEYİN KADIOĞLU' },
  { plate: '34 KIB 329', driver: 'SÜLEYMAN KARABAŞ' },
  { plate: '34 KIB 330', driver: '' },
  { plate: '34 KIB 333', driver: '' },
  { plate: '34 KIB 379', driver: 'GÖKHAN POLAT' },
  { plate: '34 KIB 380', driver: 'FATİH BEYAZ' },
  { plate: '34 KIB 381', driver: 'ALİ İHSAN İHTİYAR' },
  { plate: '34 KIB 384', driver: '' }
];

console.log('Çekici-Şoför eşleştirmesi yapılıyor...\n');

db.serialize(() => {
  // Önce trucks tablosuna driver_name kolonu ekle (eğer yoksa)
  db.run(`
    ALTER TABLE trucks ADD COLUMN driver_name TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('driver_name kolonu eklenirken hata:', err.message);
    } else if (!err) {
      console.log('✅ trucks tablosuna driver_name kolonu eklendi');
    }
  });

  // Şoför isimlerini güncelle
  const stmt = db.prepare('UPDATE trucks SET driver_name = ? WHERE plate = ?');
  
  let updatedCount = 0;
  let notFoundCount = 0;

  truckDrivers.forEach(truck => {
    stmt.run(truck.driver, truck.plate, function(err) {
      if (err) {
        console.error(`❌ ${truck.plate} güncellenirken hata:`, err.message);
      } else if (this.changes > 0) {
        updatedCount++;
        if (truck.driver) {
          console.log(`✅ ${truck.plate} → ${truck.driver}`);
        } else {
          console.log(`⚠️  ${truck.plate} → (şoför atanmadı)`);
        }
      } else {
        notFoundCount++;
        console.log(`⚠️  ${truck.plate} veritabanında bulunamadı`);
      }
    });
  });
  
  stmt.finalize(() => {
    console.log(`\n✨ İşlem tamamlandı!`);
    console.log(`📊 ${updatedCount} çekici güncellendi`);
    if (notFoundCount > 0) {
      console.log(`⚠️  ${notFoundCount} çekici veritabanında bulunamadı`);
    }
    db.close();
  });
});
