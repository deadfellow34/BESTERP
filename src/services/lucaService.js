/**
 * Luca e-Fatura API Service
 * 
 * Bu servis Luca muhasebe programı ile e-fatura entegrasyonu sağlar.
 * API: https://einvoiceapiturmob.luca.com.tr
 * 
 * Temel Özellikler:
 * - Kimlik doğrulama ve token yönetimi
 * - e-Fatura oluşturma ve gönderme
 * - e-Arşiv fatura oluşturma
 * - İrsaliye (Despatch) yönetimi
 * - Fatura listeleme ve sorgulama
 * - PDF/XML indirme
 */

const axios = require('axios');

const BASE_URL = process.env.LUCA_API_URL || 'https://einvoiceapiturmob.luca.com.tr';

// Token cache
let tokenCache = {
  token: null,
  expiresOn: null,
  userId: null,
  companies: []
};

// Parametre cache
let paramCache = {
  currencies: null,
  invoiceTypes: null,
  measureUnits: null,
  taxTypes: null,
  cities: null,
  taxOffices: null,
  lastFetch: null
};

/**
 * API çağrısı yapan yardımcı fonksiyon
 */
async function apiCall(endpoint, data = {}, method = 'POST', requiresAuth = true) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (requiresAuth && tokenCache.token) {
      headers['Authorization'] = `Bearer ${tokenCache.token}`;
    }

    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers,
      timeout: 30000
    };

    if (method === 'POST') {
      config.data = data;
    } else if (method === 'GET') {
      config.params = data;
    }

    const response = await axios(config);
    
    // Luca API Result: 0 = Success, diğerleri hata
    if (response.data && response.data.Result !== undefined && response.data.Result !== 0) {
      throw new Error(response.data.ErrorMessage || 'Luca API hatası');
    }

    return response.data;
  } catch (error) {
    console.error(`[LucaAPI] ${endpoint} hatası:`, error.message);
    throw error;
  }
}

// =====================
// KİMLİK DOĞRULAMA
// =====================

/**
 * Luca API'ye giriş yap
 */
async function login(identificationNumber = null, password = null) {
  const tcno = identificationNumber || process.env.LUCA_IDENTIFICATION_NUMBER;
  const pass = password || process.env.LUCA_PASSWORD;

  if (!tcno || !pass) {
    throw new Error('Luca kimlik bilgileri eksik');
  }

  const response = await apiCall('/api/Account/Login', {
    IdentificationNumber: tcno,
    Password: pass
  }, 'POST', false);

  tokenCache = {
    token: response.Token,
    expiresOn: new Date(response.ExpiresOn),
    userId: response.IdKullanıcı,
    companies: response.CompanyList || []
  };

  console.log(`[LucaAPI] Giriş başarılı. Kullanıcı: ${response.Adi} ${response.Soyadi}`);
  console.log(`[LucaAPI] Şirket sayısı: ${tokenCache.companies.length}`);

  return {
    userId: response.IdKullanıcı,
    name: `${response.Adi} ${response.Soyadi}`,
    companies: tokenCache.companies,
    expiresOn: tokenCache.expiresOn
  };
}

/**
 * Token geçerli mi kontrol et, gerekirse yenile
 */
async function ensureAuthenticated() {
  if (!tokenCache.token || !tokenCache.expiresOn) {
    await login();
    return;
  }

  // Token 5 dakika içinde sona erecekse yenile
  const now = new Date();
  const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
  
  if (tokenCache.expiresOn < fiveMinutesLater) {
    console.log('[LucaAPI] Token süresi doluyor, yenileniyor...');
    await login();
  }
}

/**
 * Çıkış yap
 */
async function logout() {
  try {
    await apiCall('/api/Account/Logout', {});
    tokenCache = { token: null, expiresOn: null, userId: null, companies: [] };
    console.log('[LucaAPI] Çıkış yapıldı');
  } catch (error) {
    console.error('[LucaAPI] Çıkış hatası:', error.message);
  }
}

/**
 * Sağlık kontrolü
 */
async function healthCheck() {
  try {
    const response = await axios.get(`${BASE_URL}/api/Account/GetHealthCheck`, { timeout: 10000 });
    return { status: 'ok', response: response.data };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// =====================
// PARAMETRELER
// =====================

/**
 * Para birimi listesini al
 */
async function getCurrencyList() {
  await ensureAuthenticated();
  
  if (paramCache.currencies && paramCache.lastFetch) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (paramCache.lastFetch > hourAgo) {
      return paramCache.currencies;
    }
  }

  const response = await apiCall('/api/Parameter/GetCurrencyList', {});
  paramCache.currencies = response.CurrencyList || [];
  paramCache.lastFetch = new Date();
  return paramCache.currencies;
}

/**
 * Fatura tipi listesini al
 */
async function getInvoiceTypeList() {
  await ensureAuthenticated();
  const response = await apiCall('/api/Parameter/GetInvoiceTypeList', {});
  paramCache.invoiceTypes = response.InvoiceTypeList || [];
  return paramCache.invoiceTypes;
}

/**
 * Ölçü birimi listesini al
 */
async function getMeasureUnitList() {
  await ensureAuthenticated();
  const response = await apiCall('/api/Parameter/GetMeasureUnitList', {});
  paramCache.measureUnits = response.MeasureUnitList || [];
  return paramCache.measureUnits;
}

/**
 * Vergi tipi listesini al
 */
async function getTaxTypeList() {
  await ensureAuthenticated();
  const response = await apiCall('/api/Parameter/GetTaxTypeList', {});
  paramCache.taxTypes = response.TaxTypeList || [];
  return paramCache.taxTypes;
}

/**
 * Stopaj vergi kodu listesi
 */
async function getWitholdingTaxCodeList() {
  await ensureAuthenticated();
  const response = await apiCall('/api/Parameter/GetWitholdingTaxCodeList', {});
  return response.WitholdingTaxCodeList || [];
}

/**
 * İl listesini al
 */
async function getCityCodeList() {
  await ensureAuthenticated();
  const response = await apiCall('/api/Parameter/GetCityCodeList', {});
  paramCache.cities = response.CityList || [];
  return paramCache.cities;
}

/**
 * İlçe listesini al
 */
async function getTownCodeList(cityCode) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Parameter/GetTownCodeList', { CityCode: cityCode });
  return response.TownList || [];
}

/**
 * Vergi dairesi listesi
 */
async function getTaxOfficeList() {
  await ensureAuthenticated();
  const response = await apiCall('/api/Parameter/GetTaxOfficeList', {});
  paramCache.taxOffices = response.TaxOfficeList || [];
  return paramCache.taxOffices;
}

/**
 * Vergi muafiyet kodları
 */
async function getTaxExemptionCodeList() {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetTaxExemptionCodeList', {});
  return response.TaxExemptionCodeList || [];
}

/**
 * Tüm parametreleri tek seferde al
 */
async function getAllParameters() {
  await ensureAuthenticated();
  
  const [currencies, invoiceTypes, measureUnits, taxTypes, cities, taxOffices] = await Promise.all([
    getCurrencyList(),
    getInvoiceTypeList(),
    getMeasureUnitList(),
    getTaxTypeList(),
    getCityCodeList(),
    getTaxOfficeList()
  ]);

  return {
    currencies,
    invoiceTypes,
    measureUnits,
    taxTypes,
    cities,
    taxOffices
  };
}

// =====================
// ŞİRKET / ALICI YÖNETİMİ
// =====================

/**
 * Kayıtlı alıcı listesi
 */
async function getRecipientList(companyId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Company/GetRecipientList', { CompanyId: companyId });
  return response.RecipientList || [];
}

/**
 * Alıcı detayı
 */
async function getRecipientDetail(companyId, recipientId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Company/GetRecipientDetail', { 
    CompanyId: companyId,
    IdRecipient: recipientId 
  });
  return response;
}

/**
 * Yeni alıcı kaydet
 */
async function saveRecipient(companyId, recipientData) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Company/SaveRecipient', {
    CompanyId: companyId,
    ...recipientData
  });
  return response;
}

/**
 * VKN/TCKN ile GİB sorgusu
 */
async function getGibUserByVknTckn(companyId, vknTckn) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Company/GetGibUserByVknTckn', {
    CompanyId: companyId,
    VknTckn: vknTckn
  });
  return response;
}

/**
 * Şirket bakiyesi
 */
async function getCompanyBalance(companyId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Company/GetCompanyBalance', { CompanyId: companyId });
  return response;
}

/**
 * Şirket banka hesapları
 */
async function getCompanyBankList(companyId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Company/GetCompanyBankList', { CompanyId: companyId });
  return response.BankAccountList || [];
}

/**
 * Şirket dashboard özeti
 */
async function getCompanyDashboardSummary(companyId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Company/GetCompanyDashboardSummary', { CompanyId: companyId });
  return response;
}

// =====================
// FATURA İŞLEMLERİ
// =====================

/**
 * Fatura oluştur (Taslak olarak kaydeder)
 * 
 * @param {Object} invoiceData - Fatura verileri
 * @returns {Object} - { InvoiceNumber, Ettn, Result, ErrorMessage }
 */
async function saveInvoice(invoiceData) {
  await ensureAuthenticated();
  
  // Varsayılan değerler
  const invoice = {
    RecipientType: 0, // 0: NONE, 1: EFATURA, 2: EARCHIVE
    ScenarioType: 0,  // 0: None, 1: TEMEL, 2: TICARI
    InvoiceType: 1,   // 1: SATIS
    SendMailAutomatically: true,
    ...invoiceData
  };

  const response = await apiCall('/api/Invoice/SaveInvoice', invoice);
  
  console.log(`[LucaAPI] Fatura oluşturuldu: ${response.InvoiceNumber} (ETTN: ${response.Ettn})`);
  
  return response;
}

/**
 * e-Arşiv fatura kaydet
 */
async function saveArchive(invoiceData) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/SaveArchive', invoiceData);
  return response;
}

/**
 * Taslak fatura listesi
 */
async function getStagingInvoiceList(companyId, filters = {}) {
  await ensureAuthenticated();
  
  const response = await apiCall('/api/Invoice/GetStagingInvoiceList', {
    CompanyId: companyId,
    IsStaging: true,
    PageIndex: filters.pageIndex || 1,
    PageSize: filters.pageSize || 50,
    FirstInvoiceDate: filters.startDate || null,
    LastInvoiceDate: filters.endDate || null,
    InvoiceNumber: filters.invoiceNumber || null,
    AliciAdi: filters.recipientName || null,
    AliciVkn: filters.recipientVkn || null,
    ...filters
  });

  return response.Invoices || [];
}

/**
 * Gönderilmiş fatura listesi
 */
async function getSentStagingInvoiceList(companyId, filters = {}) {
  await ensureAuthenticated();
  
  const response = await apiCall('/api/Invoice/GetSentStagingInvoiceList', {
    CompanyId: companyId,
    PageIndex: filters.pageIndex || 1,
    PageSize: filters.pageSize || 50,
    FirstInvoiceDate: filters.startDate || null,
    LastInvoiceDate: filters.endDate || null,
    ...filters
  });

  return response.Invoices || [];
}

/**
 * e-Arşiv fatura listesi
 */
async function getEArchiveInvoiceList(companyId, filters = {}) {
  await ensureAuthenticated();
  
  const response = await apiCall('/api/Invoice/GetEArchiveInvoiceList', {
    CompanyId: companyId,
    PageIndex: filters.pageIndex || 1,
    PageSize: filters.pageSize || 50,
    ...filters
  });

  return response.Invoices || [];
}

/**
 * Gelen e-Fatura listesi
 */
async function getIncomingEInvoiceList(companyId, filters = {}) {
  await ensureAuthenticated();
  
  const response = await apiCall('/api/Invoice/GetIncomingEInvoiceList', {
    CompanyId: companyId,
    PageIndex: filters.pageIndex || 1,
    PageSize: filters.pageSize || 50,
    ...filters
  });

  return response.Invoices || [];
}

/**
 * Taslak fatura detayı
 */
async function getStagingInvoice(companyId, invoiceId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetStagingInvoice', {
    CompanyId: companyId,
    InvoiceId: invoiceId
  });
  return response;
}

/**
 * Fatura HTML önizleme
 */
async function getInvoiceHtml(companyId, invoiceId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetInvoiceHtml', {
    CompanyId: companyId,
    InvoiceId: invoiceId
  });
  return response.Html || response;
}

/**
 * Taslak faturayı gönder
 */
async function sendStagingInvoice(companyId, invoiceId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/SendStagingInvoice', {
    CompanyId: companyId,
    InvoiceId: invoiceId
  });
  console.log(`[LucaAPI] Fatura gönderildi: ${invoiceId}`);
  return response;
}

/**
 * Taslak faturayı onayla
 */
async function approveStagingInvoice(companyId, invoiceId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/ApproveStagingInvoice', {
    CompanyId: companyId,
    InvoiceId: invoiceId
  });
  return response;
}

/**
 * Gelen faturayı onayla
 */
async function approveIncomingInvoice(companyId, invoiceId, isApproved = true) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/ApproveIncomingInvoice', {
    CompanyId: companyId,
    InvoiceId: invoiceId,
    IsApproved: isApproved
  });
  return response;
}

/**
 * e-Arşiv fatura iptal
 */
async function cancelEArchiveInvoice(companyId, invoiceId, cancelReason) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/CancelEArchiveInvoice', {
    CompanyId: companyId,
    InvoiceId: invoiceId,
    CancelReason: cancelReason
  });
  console.log(`[LucaAPI] e-Arşiv fatura iptal edildi: ${invoiceId}`);
  return response;
}

/**
 * e-Arşiv iptal (alternatif)
 */
async function cancelEArchive(companyId, invoiceId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/CancelEArchive', {
    CompanyId: companyId,
    InvoiceId: invoiceId
  });
  return response;
}

/**
 * Fatura kopyala
 */
async function cloneInvoice(companyId, invoiceId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/CloneInvoice', {
    CompanyId: companyId,
    InvoiceId: invoiceId
  });
  return response;
}

/**
 * Fatura PDF URL al
 */
async function getInvoicePdfUrl(invoiceId, ettn) {
  return `${BASE_URL}/api/Invoice/GetInvoicePdf?invoiceId=${invoiceId}&ettn=${ettn}`;
}

/**
 * Fatura PDF indir
 */
async function getInvoicePdf(invoiceId, ettn) {
  await ensureAuthenticated();
  
  const response = await axios.get(`${BASE_URL}/api/Invoice/GetInvoicePdf`, {
    params: { invoiceId, ettn },
    headers: { 'Authorization': `Bearer ${tokenCache.token}` },
    responseType: 'arraybuffer',
    timeout: 60000
  });

  return response.data;
}

/**
 * Fatura XML indir
 */
async function getInvoiceXml(invoiceId, ettn) {
  await ensureAuthenticated();
  
  const response = await axios.get(`${BASE_URL}/api/Invoice/GetInvoiceXml`, {
    params: { invoiceId, ettn },
    headers: { 'Authorization': `Bearer ${tokenCache.token}` },
    responseType: 'text',
    timeout: 60000
  });

  return response.data;
}

/**
 * Fatura external URL al
 */
async function getInvoiceExternalUrl(companyId, invoiceId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetInvoiceExternalUrl', {
    CompanyId: companyId,
    InvoiceId: invoiceId
  });
  return response.Url || response;
}

// =====================
// İRSALİYE İŞLEMLERİ
// =====================

/**
 * İrsaliye oluştur
 */
async function saveDespatchAdvice(despatchData) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/SaveDespatchAdvice', despatchData);
  console.log(`[LucaAPI] İrsaliye oluşturuldu: ${response.DespatchNumber}`);
  return response;
}

/**
 * Taslak irsaliye listesi
 */
async function getStagingDespatchList(companyId, filters = {}) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetStagingDespatchList', {
    CompanyId: companyId,
    PageIndex: filters.pageIndex || 1,
    PageSize: filters.pageSize || 50,
    ...filters
  });
  return response.DespatchList || [];
}

/**
 * Gönderilmiş irsaliye listesi
 */
async function getSentStagingDespatchList(companyId, filters = {}) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetSentStagingDespatchList', {
    CompanyId: companyId,
    ...filters
  });
  return response.DespatchList || [];
}

/**
 * Taslak irsaliye detayı
 */
async function getStagingDespatchAdvice(companyId, despatchId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetStagingDespatchAdvice', {
    CompanyId: companyId,
    DespatchId: despatchId
  });
  return response;
}

/**
 * İrsaliye gönder
 */
async function sendStagingDespatch(companyId, despatchId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/SendStagingDespatch', {
    CompanyId: companyId,
    DespatchId: despatchId
  });
  console.log(`[LucaAPI] İrsaliye gönderildi: ${despatchId}`);
  return response;
}

/**
 * İrsaliye kopyala
 */
async function cloneDespatch(companyId, despatchId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/CloneDespatch', {
    CompanyId: companyId,
    DespatchId: despatchId
  });
  return response;
}

/**
 * Gelen irsaliye listesi
 */
async function getIncomingDespatchList(companyId, filters = {}) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/GetIncomingDespatchList', {
    CompanyId: companyId,
    ...filters
  });
  return response.DespatchList || [];
}

/**
 * Gelen irsaliye onayla
 */
async function approveIncomingDespatch(companyId, despatchId, isApproved = true) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Invoice/ApproveIncomingDespatch', {
    CompanyId: companyId,
    DespatchId: despatchId,
    IsApproved: isApproved
  });
  return response;
}

// =====================
// ÜRÜN YÖNETİMİ
// =====================

/**
 * Ürün listesi
 */
async function getProductList(companyId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Product/GetProductList', { CompanyId: companyId });
  return response.ProductList || [];
}

/**
 * Ürün kaydet
 */
async function saveProduct(companyId, productData) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Product/SaveProduct', {
    CompanyId: companyId,
    ...productData
  });
  return response;
}

// =====================
// BELGE İŞLEMLERİ (ESMM - Serbest Meslek Makbuzu)
// =====================

/**
 * Belge kaydet
 */
async function saveDocument(documentData) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Document/SaveDocument', documentData);
  return response;
}

/**
 * Belge listesi
 */
async function getDocumentList(companyId, filters = {}) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Document/GetDocumentList', {
    CompanyId: companyId,
    ...filters
  });
  return response.DocumentList || [];
}

/**
 * Belge gönder
 */
async function sendDocumentEsmm(companyId, documentId) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Document/SendDocumentEsmm', {
    CompanyId: companyId,
    DocumentId: documentId
  });
  return response;
}

// =====================
// SİGORTA POLİÇESİ
// =====================

/**
 * Sigorta poliçesi kaydet
 */
async function saveInsurance(insuranceData) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Insurance/SaveInsurance', insuranceData);
  return response;
}

/**
 * Sigorta listesi
 */
async function getStagingInsuranceList(companyId, filters = {}) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Insurance/GetStagingInsuranceList', {
    CompanyId: companyId,
    ...filters
  });
  return response.InsuranceList || [];
}

// =====================
// DÖVİZLİ FATURA
// =====================

/**
 * Dövizli fatura kaydet
 */
async function saveCurrencyInvoice(invoiceData) {
  await ensureAuthenticated();
  const response = await apiCall('/api/CurrencyInvoice/SaveCurrencyInvoice', invoiceData);
  return response;
}

/**
 * Dövizli fatura listesi
 */
async function getStagingCurrencyInvoiceList(companyId, filters = {}) {
  await ensureAuthenticated();
  const response = await apiCall('/api/CurrencyInvoice/GetStagingCurrencyInvoiceList', {
    CompanyId: companyId,
    ...filters
  });
  return response.Invoices || [];
}

// =====================
// İMZA SERVİSLERİ
// =====================

/**
 * HTML'den PDF oluştur
 */
async function generatePdfFromHtml(html) {
  await ensureAuthenticated();
  const response = await apiCall('/api/Signature/GeneratePdfFromHtml', { Html: html });
  return response;
}

// =====================
// YARDIMCI FONKSİYONLAR
// =====================

/**
 * Position verisinden Luca fatura objesi oluştur
 */
function createInvoiceFromPosition(position, companyId, recipientData, options = {}) {
  const now = new Date();
  const invoiceDate = options.invoiceDate || now.toISOString().split('T')[0];
  const invoiceTime = options.invoiceTime || now.toTimeString().split(' ')[0];

  // KDV hesaplama
  const vatRate = options.vatRate || 20;
  const unitPrice = options.unitPrice || position.price || 0;
  const quantity = options.quantity || 1;
  const lineExtensionAmount = unitPrice * quantity;
  const vatAmount = lineExtensionAmount * (vatRate / 100);
  const totalAmount = lineExtensionAmount + vatAmount;

  return {
    CompanyId: companyId,
    InvoiceNumber: options.invoiceNumber || null, // Null ise otomatik numara
    InvoiceDate: invoiceDate,
    InvoiceTime: invoiceTime,
    InvoiceType: options.invoiceType || 1, // 1: SATIS
    ScenarioType: options.scenarioType || 1, // 1: TEMEL
    RecipientType: options.recipientType || 1, // 1: EFATURA
    IdAlici: recipientData.IdAlici || null,
    CurrencyCode: options.currencyCode || 'TRY',
    CrossRate: options.crossRate || 1,
    
    // Alıcı bilgileri (kayıtlı değilse)
    Receiver: recipientData.Receiver || null,
    
    // Ürünler
    Products: [
      {
        ProductName: options.productName || `Nakliye Hizmeti - ${position.position_code || ''}`,
        StockDescription: options.description || `${position.loading_point || ''} - ${position.unloading_point || ''}`,
        MeasureUnitId: options.measureUnitId || 1, // Adet
        MeasureUnitDesc: options.measureUnitDesc || 'Adet',
        Quantity: quantity,
        UnitPrice: unitPrice,
        DiscountRate: options.discountRate || 0,
        DiscountAmount: options.discountAmount || 0,
        VatRate: vatRate,
        VatAmount: vatAmount,
        LineExtensionAmount: lineExtensionAmount,
        Note: options.productNote || null
      }
    ],
    
    // Toplamlar
    TotalLineExtensionAmount: lineExtensionAmount,
    TotalVATAmount: vatAmount,
    TotalTaxInclusiveAmount: totalAmount,
    TotalPayableAmount: totalAmount,
    TotalDiscountAmount: 0,
    
    // Fatura vergi listesi
    InvoiceTotalTaxList: [
      {
        TaxCode: '0015', // KDV kodu
        TaxRate: vatRate,
        TaxAmount: vatAmount
      }
    ],
    
    // Notlar
    Notes: options.notes || [`Pozisyon: ${position.position_code || ''}`],
    
    // Otomatik mail
    SendMailAutomatically: options.sendMailAutomatically !== false
  };
}

/**
 * Aktif şirket ID'sini al
 */
function getActiveCompanyId() {
  if (tokenCache.companies && tokenCache.companies.length > 0) {
    // ENV'den şirket ID varsa onu kullan
    const envCompanyId = process.env.LUCA_COMPANY_ID;
    if (envCompanyId) {
      return parseFloat(envCompanyId);
    }
    // Yoksa ilk şirketi kullan
    return tokenCache.companies[0].IdFirma;
  }
  throw new Error('Aktif şirket bulunamadı');
}

/**
 * Şirket listesini al
 */
function getCompanyList() {
  return tokenCache.companies || [];
}

/**
 * Token bilgisini al
 */
function getTokenInfo() {
  return {
    hasToken: !!tokenCache.token,
    expiresOn: tokenCache.expiresOn,
    userId: tokenCache.userId,
    companyCount: tokenCache.companies.length
  };
}

module.exports = {
  // Auth
  login,
  logout,
  ensureAuthenticated,
  healthCheck,
  getTokenInfo,
  getCompanyList,
  getActiveCompanyId,

  // Parametreler
  getCurrencyList,
  getInvoiceTypeList,
  getMeasureUnitList,
  getTaxTypeList,
  getWitholdingTaxCodeList,
  getCityCodeList,
  getTownCodeList,
  getTaxOfficeList,
  getTaxExemptionCodeList,
  getAllParameters,

  // Şirket / Alıcı
  getRecipientList,
  getRecipientDetail,
  saveRecipient,
  getGibUserByVknTckn,
  getCompanyBalance,
  getCompanyBankList,
  getCompanyDashboardSummary,

  // Fatura
  saveInvoice,
  saveArchive,
  getStagingInvoiceList,
  getSentStagingInvoiceList,
  getEArchiveInvoiceList,
  getIncomingEInvoiceList,
  getStagingInvoice,
  getInvoiceHtml,
  sendStagingInvoice,
  approveStagingInvoice,
  approveIncomingInvoice,
  cancelEArchiveInvoice,
  cancelEArchive,
  cloneInvoice,
  getInvoicePdf,
  getInvoicePdfUrl,
  getInvoiceXml,
  getInvoiceExternalUrl,

  // İrsaliye
  saveDespatchAdvice,
  getStagingDespatchList,
  getSentStagingDespatchList,
  getStagingDespatchAdvice,
  sendStagingDespatch,
  cloneDespatch,
  getIncomingDespatchList,
  approveIncomingDespatch,

  // Ürün
  getProductList,
  saveProduct,

  // Belge
  saveDocument,
  getDocumentList,
  sendDocumentEsmm,

  // Sigorta
  saveInsurance,
  getStagingInsuranceList,

  // Dövizli Fatura
  saveCurrencyInvoice,
  getStagingCurrencyInvoiceList,

  // İmza
  generatePdfFromHtml,

  // Yardımcı
  createInvoiceFromPosition
};
