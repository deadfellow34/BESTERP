const axios = require('axios');
const cheerio = require('cheerio');

let ratesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Fallback değerler - güncellenebilir
const FALLBACK_RATES = { USD: 42.2420, EUR: 49.1099, GBP: 55.6377, PARITE: 1.1329223 };

async function getTCMBRates() {
  if (ratesCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
    return ratesCache;
  }

  // Try up to 7 days back for TCMB XML
  let lastError = null;
  for (let daysBack = 0; daysBack < 7; daysBack++) {
    try {
      const today = new Date();
      today.setDate(today.getDate() - daysBack);
      const dateStr = `${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}`;
      const url = `https://www.tcmb.gov.tr/kurlar/${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}/${dateStr}.xml`;
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      const $ = cheerio.load(response.data, { xmlMode: true });

      let eur = FALLBACK_RATES.EUR;
      let gbp = FALLBACK_RATES.GBP;
      let usd = FALLBACK_RATES.USD;

      $('Currency').each((index, element) => {
        const code = $(element).attr('CurrencyCode');
        const forexSelling = $(element).find('ForexSelling').text();
        const parsed = parseFloat(forexSelling);
        if (code === 'USD' && !isNaN(parsed)) usd = parsed;
        if (code === 'EUR' && !isNaN(parsed)) eur = parsed;
        if (code === 'GBP' && !isNaN(parsed)) gbp = parsed;
      });

      const rates = { USD: usd, EUR: eur, GBP: gbp, PARITE: (gbp / eur) };
      ratesCache = rates;
      cacheTimestamp = Date.now();
      if (daysBack > 0) {
        console.log(`[RatesService] TCMB kurları ${daysBack} gün öncesinden alındı (${dateStr})`);
      }
      return rates;
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  // Tüm denemeler başarısız
  console.error('[RatesService] TCMB kurları alınamadı, fallback değerler kullanılıyor:', lastError?.message || 'Bilinmeyen hata');
  
  // fallback
  if (ratesCache) {
    console.log('[RatesService] Önceki cache değerler kullanılıyor');
    return ratesCache;
  }
  return FALLBACK_RATES;
}

module.exports = { getTCMBRates };
