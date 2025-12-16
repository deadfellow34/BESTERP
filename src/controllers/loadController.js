const LoadModel = require('../models/loadModel');
const CompanyModel = require('../models/companyModel');
const InvoiceCompanyModel = require('../models/invoiceCompanyModel');
const TruckModel = require('../models/truckModel');
const TrailerModel = require('../models/trailerModel');
const SealModel = require('../models/sealModel');
const LogModel = require('../models/logModel');
const NamedModel = require('../models/namedModel');
const ExpenseModel = require('../models/expenseModel');
const MailRecipientModel = require('../models/mailRecipientModel');
const DriverLocationModel = require('../models/driverLocationModel');
const db = require('../config/db');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const RatesService = require('../services/ratesService');
const NotificationService = require('../services/notificationService');
const GeocodingService = require('../services/geocodingService');

// Ortak: formda kullanılacak listeleri (firma, çekici, dorse, mühür) çek
function getFormLookups(callback) {
  CompanyModel.getAll((err, companies) => {
    if (err) return callback(err);

    TruckModel.getAll((err2, trucks) => {
      if (err2) return callback(err2);

      TrailerModel.getAll((err3, trailers) => {
        if (err3) return callback(err3);

        SealModel.getAvailable((err4, seals) => {
          if (err4) return callback(err4);

          InvoiceCompanyModel.getAll((err5, invoiceCompanies) => {
            if (err5) return callback(err5);

            callback(null, { companies, trucks, trailers, seals, invoiceCompanies });
          });
        });
      });
    });
  });
}

// Basit REF üretici
function generateRef() {
  return `REF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

const loadController = {
  // GET /loads/export/pdf → export all loads as PDF
  exportAllAsPdf(req, res, next) {
    const PdfPrinter = require('pdfmake');
    const fonts = require('../../pdf/fonts');
    const printer = new PdfPrinter(fonts);
    const LoadModel = require('../models/loadModel');

    // All fields to export (order matches /loads/new form)
    const columns = [
      { key: 'position_no', label: 'Pozisyon No' },
      { key: 'customer_name', label: 'Müşteri' },
      { key: 'consignee_name', label: 'Alıcı' },
      { key: 'loading_country', label: 'Yükleme Ülke' },
      { key: 'loading_city', label: 'Yükleme Şehir' },
      { key: 'loading_address', label: 'Yükleme Adres' },
      { key: 'unloading_country', label: 'Boşaltma Ülke' },
      { key: 'unloading_city', label: 'Boşaltma Şehir' },
      { key: 'unloading_address', label: 'Boşaltma Adres' },
      { key: 'goods_description', label: 'Mal Açıklaması' },
      { key: 'packages', label: 'Koli' },
      { key: 'pallets', label: 'Palet' },
      { key: 'ldm', label: 'LDM' },
      { key: 'gross_weight', label: 'Brüt Kg' },
      { key: 'net_weight', label: 'Net Kg' },
      { key: 'truck_plate', label: 'Çekici Plaka' },
      { key: 'trailer_plate', label: 'Dorse Plaka' },
      { key: 'driver_name', label: 'Şoför' },
      { key: 't1_mrn', label: 'T1/MRN' },
      { key: 'exit_date', label: 'Çıkış Tarihi' },
      { key: 'arrival_date', label: 'Varış Tarihi' },
      { key: 'loading_date', label: 'Yükleme Tarihi' },
      { key: 'unloading_date', label: 'Boşaltma Tarihi' },
      { key: 'navlun_amount', label: 'Navlun' }, // amount + currency
      { key: 'cost_amount', label: 'Maliyet' },  // amount + currency
      { key: 'seal_code', label: 'Mühür' },
      { key: 'notes', label: 'Notlar' },
      { key: 'created_by', label: 'Oluşturan' },
    ];

    LoadModel.getAll((err, rows) => {
      if (err) return next(err);

      // Compose table header
      const header = columns.map(col => ({ text: col.label, style: 'tableHeader', alignment: 'center' }));
      // Compose table body
      const body = [header];
      rows.forEach(row => {
        const dataRow = columns.map(col => {
          let val = row[col.key];
          // Combine navlun/cost amount+currency for compactness
          if (col.key === 'navlun_amount') {
            val = (row.navlun_amount ? row.navlun_amount : '') + (row.navlun_currency ? ' ' + row.navlun_currency : '');
          } else if (col.key === 'cost_amount') {
            val = (row.cost_amount ? row.cost_amount : '') + (row.cost_currency ? ' ' + row.cost_currency : '');
          }
          return { text: val == null ? '' : String(val), fontSize: 10, alignment: 'left', margin: [0, 2, 0, 2], noWrap: false };
        });
        body.push(dataRow);
      });

      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        defaultStyle: { font: 'Roboto', fontSize: 10 },
        content: [
          { text: 'Yüklemeler Listesi', style: 'header', alignment: 'center', margin: [0, 0, 0, 12] },
          {
            table: {
              headerRows: 1,
              widths: Array(body[0].length).fill('*'),
              body: body
            },
            layout: {
              fillColor: function (rowIndex) { return rowIndex === 0 ? '#eeeeee' : null; },
              hLineWidth: function () { return 0.5; },
              vLineWidth: function () { return 0.5; },
              hLineColor: function () { return '#aaa'; },
              vLineColor: function () { return '#aaa'; },
            },
            fontSize: 10,
          }
        ],
        styles: {
          header: { fontSize: 16, bold: true },
          tableHeader: { bold: true, fontSize: 11, fillColor: '#eeeeee' },
        },
      };

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="yuklemeler.pdf"');
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      pdfDoc.pipe(res);
      pdfDoc.end();
    });
  },

  // POST /loads/position/:positionNo/km-pdf -> generate PDF from provided distance data
  exportPositionKmPdf(req, res, next) {
    try {
      const PdfPrinter = require('pdfmake');
      const fonts = require('../../pdf/fonts');
      const printer = new PdfPrinter(fonts);

      const positionNo = req.params.positionNo || (req.body && req.body.positionNo) || 'UNKNOWN';
      const payload = req.body || {};
      const segments = Array.isArray(payload.segments) ? payload.segments : [];
      const totalKm = Number(payload.totalKm) || segments.reduce((s,seg) => s + (Number(seg.distance)||0), 0);
      const totalKmAll = Number(payload.totalKmAll) || totalKm;
      
      // Flags for calculation types
      const ingiltereFlag = payload.herstal || false;
      const avrupaFlag = payload.avrupa || false;
      
      // Avrupa hesabı verileri
      const avrupaData = payload.avrupaData || {};
      const avrupaTotalKm = Number(avrupaData.totalKm) || 0;
      const avrupaMacarKm = Number(avrupaData.macarKm) || 0;
      const avrupaGrandTotal = Number(avrupaData.grandTotal) || 0;
      const avrupaMazotUsed = Number(avrupaData.mazotUsed) || 0;
      const avrupaKalanMazot = Number(avrupaData.kalanMazot) || 0;
      const avrupaMacar = Number(avrupaData.macar) || 0;

      // Helper: shorten addresses
      function shortenAddress(addr) {
        if (!addr) return '-';
        try {
          const parts = String(addr).split(',').map(s => s.trim()).filter(Boolean);
          const postcodeRegex = /[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i;
          let postcode = null;
          let city = null;
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            const m = p.match(postcodeRegex);
            if (m) {
              postcode = m[0];
              const remaining = p.replace(m[0], '').trim();
              if (remaining) city = remaining;
              else if (parts[i+1]) city = parts[i+1];
              break;
            }
          }
          if (!postcode && parts.length) postcode = parts[0].split(' ').slice(0,2).join(' ');
          if (!city && parts.length > 1) city = parts[1];
          if (postcode && city) return postcode + ', ' + city;
          if (postcode) return postcode;
          return parts[0].length > 40 ? parts[0].slice(0,40) + '…' : parts[0];
        } catch (e) { return String(addr); }
      }

      // Get type color
      function getTypeColor(type) {
        switch(type) {
          case 'loading': return '#22c55e';
          case 'unloading': return '#f59e0b';
          case 'exit': return '#3b82f6';
          case 'europe': return '#a855f7';
          default: return '#64748b';
        }
      }

      // Build table rows - kompakt
      const tableBody = [[
        {text:'#', style:'tableHeader', alignment: 'center'},
        {text:'Tip', style:'tableHeader'},
        {text:'Başlangıç', style:'tableHeader'},
        {text:'Bitiş', style:'tableHeader'},
        {text:'KM', style:'tableHeader', alignment: 'right'}
      ]];
      
      segments.forEach((seg, idx) => {
        const typeLabel = seg.type === 'loading' ? 'Yükleme' : 
                          (seg.type === 'unloading' ? 'Boşaltma' : 
                          (seg.type === 'exit' ? 'Çıkış' : 
                          (seg.type === 'europe' ? 'Avrupa' : seg.type)));
        tableBody.push([
          { text: String(idx+1), fontSize: 9, alignment: 'center', color: '#374151' },
          { text: typeLabel, fontSize: 9, color: getTypeColor(seg.type), bold: true },
          { text: shortenAddress(seg.from), fontSize: 8, color: '#4b5563' },
          { text: shortenAddress(seg.to), fontSize: 8, color: '#4b5563' },
          { text: (Number(seg.distance)||0).toFixed(0), fontSize: 9, alignment: 'right', bold: true, color: '#1f2937' }
        ]);
      });

      // Compute subtotals
      const loadingDistance = segments.filter(s => s.type === 'loading').reduce((s,x) => s + (Number(x.distance)||0), 0);
      const unloadingDistance = segments.filter(s => s.type === 'unloading').reduce((s,x) => s + (Number(x.distance)||0), 0);
      const exitDistance = segments.filter(s => s.type === 'exit').reduce((s,x) => s + (Number(x.distance)||0), 0);
      const europeDistance = segments.filter(s => s.type === 'europe').reduce((s,x) => s + (Number(x.distance)||0), 0);

      // Round total to nearest 20
      const roundedTotal = Math.ceil(totalKmAll / 20) * 20;

      // İNGİLTERE ÇIKIŞ MAZOT HESABI - KOMPAKT
      let ingiltereSection = [];
      if (ingiltereFlag) {
        const t = roundedTotal;
        const step1 = t + 1750;
        const step2 = step1 + 125;
        const step3 = step2 * 0.3;
        const kalanMazot = Math.ceil((1450 - step3) / 10) * 10;
        const herstalMazot = kalanMazot >= 500 ? null : (500 - kalanMazot);
        const macar = Math.max(0, 1050 - kalanMazot);

        ingiltereSection = [
          // Header
          {
            canvas: [{ type: 'rect', x: 0, y: 0, w: 547, h: 28, r: 6, color: '#7c3aed' }],
            margin: [0, 8, 0, 0]
          },
          {
            text: 'INGILTERE CIKIS MAZOT HESABI',
            fontSize: 12,
            bold: true,
            color: '#ffffff',
            alignment: 'center',
            relativePosition: { x: 0, y: -22 }
          },
          
          // Hesaplama tablosu - kompakt
          {
            table: {
              widths: ['55%', '45%'],
              body: [
                [
                  { text: 'DD Toplam KM', fontSize: 8, color: '#374151' },
                  { text: t + ' km', fontSize: 9, bold: true, color: '#22c55e', alignment: 'right' }
                ],
                [
                  { text: 'DD + HERSTAL (1750)', fontSize: 8, color: '#6b7280' },
                  { text: step1.toFixed(0) + ' km', fontSize: 9, bold: true, color: '#3b82f6', alignment: 'right' }
                ],
                [
                  { text: 'TOPLAM + EXTRA (125)', fontSize: 8, color: '#6b7280' },
                  { text: step2.toFixed(0) + ' km', fontSize: 9, bold: true, color: '#3b82f6', alignment: 'right' }
                ],
                [
                  { text: 'HARCANAN MAZOT (x0.3)', fontSize: 8, color: '#6b7280' },
                  { text: step3.toFixed(1) + ' lt', fontSize: 9, bold: true, color: '#ef4444', alignment: 'right' }
                ]
              ]
            },
            layout: {
              hLineWidth: () => 0.3,
              hLineColor: () => '#e5e7eb',
              vLineWidth: () => 0,
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 4,
              paddingBottom: () => 4,
              fillColor: (row) => row % 2 === 0 ? '#faf5ff' : '#ffffff'
            },
            margin: [0, 6, 0, 0]
          },
          
          // Sonuç kartları - yan yana 3'lü
          {
            columns: [
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 175, h: 40, r: 6, color: '#f59e0b' }] },
                  { text: 'KALAN MAZOT', fontSize: 7, color: '#ffffff', bold: true, relativePosition: { x: 8, y: -36 } },
                  { text: kalanMazot + ' lt', fontSize: 16, color: '#ffffff', bold: true, relativePosition: { x: 8, y: -28 } }
                ]
              },
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 175, h: 40, r: 6, color: herstalMazot === null ? '#ef4444' : '#7c3aed' }] },
                  { text: 'HERSTAL MAZOT', fontSize: 7, color: '#ffffff', bold: true, relativePosition: { x: 8, y: -36 } },
                  { text: herstalMazot === null ? 'YOK' : (herstalMazot + ' lt'), fontSize: 16, color: '#ffffff', bold: true, relativePosition: { x: 8, y: -28 } }
                ]
              },
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 175, h: 40, r: 6, color: '#059669' }] },
                  { text: 'MACAR', fontSize: 7, color: '#ffffff', bold: true, relativePosition: { x: 8, y: -36 } },
                  { text: macar + ' lt', fontSize: 16, color: '#ffffff', bold: true, relativePosition: { x: 8, y: -28 } }
                ]
              }
            ],
            columnGap: 10,
            margin: [0, 8, 0, 0]
          }
        ];
      }

      // AVRUPA MAZOT HESABI - KOMPAKT
      let avrupaSection = [];
      if (avrupaFlag) {
        avrupaSection = [
          // Header
          {
            canvas: [{ type: 'rect', x: 0, y: 0, w: 547, h: 28, r: 6, color: '#059669' }],
            margin: [0, 8, 0, 0]
          },
          {
            text: 'AVRUPA MAZOT HESABI',
            fontSize: 12,
            bold: true,
            color: '#ffffff',
            alignment: 'center',
            relativePosition: { x: 0, y: -22 }
          },
          
          // Hesaplama tablosu - kompakt
          {
            table: {
              widths: ['55%', '45%'],
              body: [
                [
                  { text: 'Toplam Mesafe', fontSize: 8, color: '#374151' },
                  { text: avrupaTotalKm + ' km', fontSize: 9, bold: true, color: '#22c55e', alignment: 'right' }
                ],
                [
                  { text: 'Son Nokta → Macaristan (Rozvadov)', fontSize: 8, color: '#6b7280' },
                  { text: avrupaMacarKm + ' km', fontSize: 9, bold: true, color: '#3b82f6', alignment: 'right' }
                ],
                [
                  { text: 'Macaristan Ekleme + Extra KM', fontSize: 8, color: '#6b7280' },
                  { text: '+ 1500 km', fontSize: 9, bold: true, color: '#3b82f6', alignment: 'right' }
                ],
                [
                  { text: 'TOPLAM KM', fontSize: 8, color: '#374151', bold: true },
                  { text: avrupaGrandTotal + ' km', fontSize: 9, bold: true, color: '#f59e0b', alignment: 'right' }
                ],
                [
                  { text: 'HARCANAN MAZOT (x0.3)', fontSize: 8, color: '#6b7280' },
                  { text: avrupaMazotUsed.toFixed(1) + ' lt', fontSize: 9, bold: true, color: '#ef4444', alignment: 'right' }
                ]
              ]
            },
            layout: {
              hLineWidth: () => 0.3,
              hLineColor: () => '#e5e7eb',
              vLineWidth: () => 0,
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 4,
              paddingBottom: () => 4,
              fillColor: (row) => row % 2 === 0 ? '#ecfdf5' : '#ffffff'
            },
            margin: [0, 6, 0, 0]
          },
          
          // Sonuç kartları - yan yana 2'li
          {
            columns: [
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 265, h: 40, r: 6, color: '#059669' }] },
                  { text: 'KALAN MAZOT (1450 - ' + avrupaMazotUsed.toFixed(0) + ')', fontSize: 7, color: '#ffffff', bold: true, relativePosition: { x: 10, y: -36 } },
                  { text: avrupaKalanMazot + ' lt', fontSize: 18, color: '#ffffff', bold: true, relativePosition: { x: 10, y: -26 } }
                ]
              },
              {
                width: '*',
                stack: [
                  { canvas: [{ type: 'rect', x: 0, y: 0, w: 265, h: 40, r: 6, color: '#7c3aed' }] },
                  { text: 'MACAR (600\'e tamamla)', fontSize: 7, color: '#ffffff', bold: true, relativePosition: { x: 10, y: -36 } },
                  { text: avrupaMacar <= 0 ? 'YOK' : (avrupaMacar + ' lt'), fontSize: 18, color: '#ffffff', bold: true, relativePosition: { x: 10, y: -26 } }
                ]
              }
            ],
            columnGap: 16,
            margin: [0, 8, 0, 0]
          }
        ];
      }

      // Fetch position loads to include truck/trailer/driver in header
      LoadModel.getByPositionNo(positionNo, (lErr, loads) => {
        let truckPlate = '-';
        let trailerPlate = '-';
        let driverName = '-';
        if (!lErr && Array.isArray(loads) && loads.length > 0) {
          const firstLoad = loads[0];
          truckPlate = firstLoad.truck_plate || '-';
          trailerPlate = firstLoad.trailer_plate || '-';
          driverName = firstLoad.driver_name || '-';
        }

        // Hangi hesap aktif?
        const hesapTipi = ingiltereFlag && avrupaFlag ? 'Her İki Hesap' : 
                         (ingiltereFlag ? 'İngiltere Çıkış' : 
                         (avrupaFlag ? 'Avrupa' : 'Yok'));

        const docDefinition = {
          pageSize: 'A4',
          pageOrientation: 'portrait',
          pageMargins: [20, 20, 20, 30],
          defaultStyle: { font: 'Roboto', fontSize: 9 },
          footer: function(currentPage, pageCount) {
            return {
              columns: [
                { text: 'BestFreight ERP - KM & Mazot Raporu', fontSize: 7, color: '#9ca3af', margin: [20, 0, 0, 0] },
                { text: `Sayfa ${currentPage} / ${pageCount}`, fontSize: 7, color: '#9ca3af', alignment: 'right', margin: [0, 0, 20, 0] }
              ],
              margin: [0, 5, 0, 0]
            };
          },
          content: [
            // Modern Header - kompakt
            {
              canvas: [{ type: 'rect', x: 0, y: 0, w: 555, h: 55, r: 8, color: '#1e3a8a' }]
            },
            {
              text: 'ARAC KM & MAZOT RAPORU',
              fontSize: 18,
              bold: true,
              color: '#ffffff',
              relativePosition: { x: 14, y: -48 }
            },
            {
              text: `Pozisyon: ${positionNo}  |  ${(new Date()).toLocaleDateString('tr-TR')}  |  Hesap: ${hesapTipi}`,
              fontSize: 9,
              color: '#93c5fd',
              relativePosition: { x: 14, y: -28 }
            },
            
            // Araç bilgileri - tek satır kompakt
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { canvas: [{ type: 'rect', x: 0, y: 0, w: 175, h: 35, r: 5, color: '#f1f5f9' }] },
                    { text: 'Cekici', fontSize: 8, color: '#64748b', relativePosition: { x: 8, y: -30 } },
                    { text: truckPlate, fontSize: 11, bold: true, color: '#1e293b', relativePosition: { x: 8, y: -20 } }
                  ]
                },
                {
                  width: '*',
                  stack: [
                    { canvas: [{ type: 'rect', x: 0, y: 0, w: 175, h: 35, r: 5, color: '#f1f5f9' }] },
                    { text: 'Dorse', fontSize: 8, color: '#64748b', relativePosition: { x: 8, y: -30 } },
                    { text: trailerPlate, fontSize: 11, bold: true, color: '#1e293b', relativePosition: { x: 8, y: -20 } }
                  ]
                },
                {
                  width: '*',
                  stack: [
                    { canvas: [{ type: 'rect', x: 0, y: 0, w: 175, h: 35, r: 5, color: '#f1f5f9' }] },
                    { text: 'Sofor', fontSize: 8, color: '#64748b', relativePosition: { x: 8, y: -30 } },
                    { text: driverName, fontSize: 11, bold: true, color: '#1e293b', relativePosition: { x: 8, y: -20 } }
                  ]
                }
              ],
              columnGap: 10,
              margin: [0, 12, 0, 0]
            },
            
            // Özet kartı - sadece TOPLAM KM (ortalanmış)
            {
              stack: [
                { canvas: [{ type: 'rect', x: 0, y: 0, w: 555, h: 55, r: 6, color: '#dbeafe' }] },
                { text: 'TOPLAM KM', fontSize: 11, color: '#1e40af', bold: true, alignment: 'center', relativePosition: { x: 0, y: -50 } },
                { text: roundedTotal + ' km', fontSize: 26, bold: true, color: '#1e3a8a', alignment: 'center', relativePosition: { x: 0, y: -38 } },
                { text: `Yukleme: ${loadingDistance.toFixed(0)} | Bosaltma: ${unloadingDistance.toFixed(0)} | Cikis: ${exitDistance.toFixed(0)}${europeDistance > 0 ? ' | Avrupa: ' + europeDistance.toFixed(0) : ''}`, fontSize: 9, color: '#3b82f6', alignment: 'center', relativePosition: { x: 0, y: -10 } }
              ],
              margin: [0, 10, 0, 0]
            },
            
            // Güzergâh tablosu - kompakt
            { text: 'GUZERGAH DETAYLARI', fontSize: 11, bold: true, color: '#1e3a8a', alignment: 'center', margin: [0, 12, 0, 6] },
            {
              table: {
                headerRows: 1,
                widths: [18, 50, '*', '*', 35],
                body: tableBody
              },
              layout: {
                fillColor: function (row) {
                  if (row === 0) return '#1e3a8a';
                  return row % 2 === 0 ? '#f8fafc' : '#ffffff';
                },
                hLineWidth: (i, node) => i === 0 || i === 1 || i === node.table.body.length ? 0.5 : 0.2,
                vLineWidth: () => 0,
                hLineColor: (i) => i <= 1 ? '#1e3a8a' : '#e2e8f0',
                paddingLeft: () => 6,
                paddingRight: () => 6,
                paddingTop: () => 4,
                paddingBottom: () => 4
              }
            },
            
            // İngiltere hesabı
            ...ingiltereSection,
            
            // Avrupa hesabı
            ...avrupaSection
          ],
          styles: {
            tableHeader: { bold: true, fontSize: 9, color: '#ffffff' }
          }
        };

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="position_${positionNo}_km.pdf"`);
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        pdfDoc.pipe(res);
        pdfDoc.end();
      });
    } catch (err) {
      console.error('Error generating KM PDF:', err);
      return next(err);
    }
  },

  // GET /loads/position/:positionNo/export/pdf → export all loads for a position as PDF
  exportPositionAsPdf(req, res, next) {
    const PdfPrinter = require('pdfmake');
    const fonts = require('../../pdf/fonts');
    const printer = new PdfPrinter(fonts);
    const positionNo = req.params.positionNo;

    LoadModel.getByPositionNo(positionNo, (err, rows) => {
      if (err) return next(err);
      if (!rows || rows.length === 0) {
        return res.status(404).send('Bu pozisyona ait yük bulunamadı.');
      }

      // Pozisyon genel bilgileri (ilk kayıttan al)
      const firstLoad = rows[0];
      const positionInfo = [
        { text: 'Pozisyon Bilgileri', style: 'sectionTitle', margin: [0, 0, 0, 8] },
        {
          columns: [
            {
              width: '25%',
              stack: [
                { text: 'Pozisyon No:', style: 'label' },
                { text: positionNo, style: 'value', margin: [0, 0, 0, 8] }
              ]
            },
            {
              width: '25%',
              stack: [
                { text: 'Çekici:', style: 'label' },
                { text: firstLoad.truck_plate || '-', style: 'value', margin: [0, 0, 0, 8] }
              ]
            },
            {
              width: '25%',
              stack: [
                { text: 'Dorse:', style: 'label' },
                { text: firstLoad.trailer_plate || '-', style: 'value', margin: [0, 0, 0, 8] }
              ]
            },
            {
              width: '25%',
              stack: [
                { text: 'Şoför:', style: 'label' },
                { text: firstLoad.driver_name || '-', style: 'value', margin: [0, 0, 0, 8] }
              ]
            }
          ]
        },
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: 'Çıkış Tarihi:', style: 'label' },
                { text: firstLoad.loading_date || '-', style: 'value', margin: [0, 0, 0, 12] }
              ]
            },
            {
              width: '50%',
              stack: [
                { text: 'Varış Tarihi:', style: 'label' },
                { text: firstLoad.arrival_date || '-', style: 'value', margin: [0, 0, 0, 12] }
              ]
            }
          ]
        },
        { text: 'Yüklemeler', style: 'sectionTitle', margin: [0, 5, 0, 8] }
      ];

      // Sadece yük detayları için kolon tanımları
      const columns = [
        { key: 'customer_name', label: 'Gönderici', width: 70 },
        { key: 'consignee_name', label: 'Alıcı', width: 70 },
        { key: 'loading_city', label: 'Yük.Şehir', width: 55 },
        { key: 'unloading_city', label: 'Boş.Şehir', width: 55 },
        { key: 'goods_description', label: 'Mal', width: 90 },
        { key: 'packages', label: 'Koli', width: 35 },
        { key: 'pallets', label: 'Palet', width: 35 },
        { key: 'ldm', label: 'LDM', width: 35 },
        { key: 'gross_weight', label: 'Brüt', width: 40 },
        { key: 'net_weight', label: 'Net', width: 40 },
        { key: 'navlun_amount', label: 'Navlun', width: 55 },
        { key: 'cost_amount', label: 'Maliyet', width: 55 },
      ];

      const header = columns.map(col => ({ 
        text: col.label, 
        style: 'tableHeader', 
        alignment: 'center',
        fontSize: 8
      }));
      
      const body = [header];
      rows.forEach((row, idx) => {
        const dataRow = columns.map(col => {
          let val = row[col.key];
          if (col.key === 'navlun_amount') {
            val = (row.navlun_amount ? row.navlun_amount : '') + (row.navlun_currency ? ' ' + row.navlun_currency : '');
          } else if (col.key === 'cost_amount') {
            val = (row.cost_amount ? row.cost_amount : '') + (row.cost_currency ? ' ' + row.cost_currency : '');
          }
          return { 
            text: val == null ? '' : String(val), 
            fontSize: 7, 
            alignment: 'left', 
            margin: [2, 2, 2, 2]
          };
        });
        body.push(dataRow);
      });

      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [20, 50, 20, 40],
        defaultStyle: { font: 'Roboto', fontSize: 7 },
        header: function(currentPage, pageCount) {
          return {
            columns: [
              { text: 'Bestfreight ERP', style: 'headerText', alignment: 'left', margin: [20, 15, 0, 0] },
              { text: `Sayfa ${currentPage} / ${pageCount}`, style: 'headerText', alignment: 'right', margin: [0, 15, 20, 0] }
            ]
          };
        },
        footer: function(currentPage, pageCount) {
          return {
            text: `${new Date().toLocaleDateString('tr-TR')} - ${new Date().toLocaleTimeString('tr-TR')}`,
            alignment: 'center',
            fontSize: 7,
            color: '#666',
            margin: [0, 10, 0, 0]
          };
        },
        content: [
          ...positionInfo,
          {
            table: {
              headerRows: 1,
              widths: columns.map(col => col.width),
              body: body
            },
            layout: {
              fillColor: function (rowIndex) { 
                if (rowIndex === 0) return '#2563eb';
                return rowIndex % 2 === 0 ? '#f8fafc' : null;
              },
              hLineWidth: function (i, node) { return i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5; },
              vLineWidth: function () { return 0.5; },
              hLineColor: function (i) { return i === 0 || i === 1 ? '#2563eb' : '#e2e8f0'; },
              vLineColor: function () { return '#e2e8f0'; },
              paddingLeft: function() { return 4; },
              paddingRight: function() { return 4; },
              paddingTop: function() { return 3; },
              paddingBottom: function() { return 3; }
            }
          }
        ],
        styles: {
          sectionTitle: { fontSize: 11, bold: true, color: '#1e293b' },
          label: { fontSize: 8, color: '#64748b', bold: true },
          value: { fontSize: 9, color: '#0f172a' },
          headerText: { fontSize: 9, color: '#475569' },
          tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#2563eb' }
        }
      };
      // Log PDF generation
      try {
        LogModel.create({
          username: req.session && req.session.user ? req.session.user.username : null,
          role: req.session && req.session.user ? req.session.user.role : null,
          entity: 'position',
          entity_id: positionNo,
          action: 'generate_pdf',
          field: 'position_pdf',
          old_value: null,
          new_value: JSON.stringify({ filename: `pozisyon_${positionNo}.pdf` })
        });
      } catch (e) { console.error('Log create error (pdf):', e); }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="pozisyon_${encodeURIComponent(positionNo)}.pdf"`);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      pdfDoc.pipe(res);
      pdfDoc.end();
    });
  },

  // GET /loads/position/:positionNo/ameta → AMETA formu görüntüleme
  async showAmeta(req, res, next) {
    const positionNo = req.params.positionNo;

    try {
      // Önce yükleri çek, statüye göre kur güncellemesini belirle
      LoadModel.getByPositionNo(positionNo, async (err, rows) => {
        if (err) return next(err);
        if (!rows || rows.length === 0) {
          return res.status(404).send('Bu pozisyona ait yük bulunamadı.');
        }

        const firstLoad = rows[0];
        // Eğer herhangi bir yükte status 'completed' ise ve kaydedilmiş kurlar varsa, onları kullan
        let rates;
        const completedLoad = rows.find(load => load.status === 'completed' && load.completed_rates);
        if (completedLoad && completedLoad.completed_rates) {
          try {
            // Kaydedilmiş kurları kullan
            rates = JSON.parse(completedLoad.completed_rates);
            console.log('AMETA PDF: Kaydedilmiş kurlar kullanılıyor:', rates.savedAt);
          } catch (e) {
            console.error('completed_rates parse error:', e);
            rates = await RatesService.getTCMBRates();
          }
        } else {
          // Aktif dosya veya kaydedilmiş kur yoksa, güncel kur çek
          rates = await RatesService.getTCMBRates();
        }

        // GENEL TOPLAM: Her yükün (navlun_amount * ilgili döviz kuru) + (ydg_amount * EUR kuru) + ordino_cost toplamı
        let genelToplam = 0;
        rows.forEach(load => {
          const navlun = parseFloat(load.navlun_amount) || 0;
          const ydgAmount = parseFloat(load.ydg_amount) || 0;
          const ordinoCost = parseFloat(load.ordino_cost) || 0;
          const currency = (load.navlun_currency || 'EUR').toUpperCase();
          // Döviz türüne göre kuru seç
          let rate = 1;
          if (currency === 'USD') {
            rate = rates.USD;
          } else if (currency === 'EUR') {
            rate = rates.EUR;
          } else if (currency === 'GBP') {
            rate = rates.GBP;
          } else if (currency === 'TRY' || currency === 'TL') {
            rate = 1; // TL için kur 1
          }
          // Navlun TL + YDG TL (YDG her zaman EUR) + Ordino (TL)
          genelToplam += (navlun * rate) + (ydgAmount * rates.EUR) + ordinoCost;
        });

        // GİDER TOPLAM: position_expenses tablosundan masrafları çek
        ExpenseModel.getByPositionNo(positionNo, (err2, expenses) => {
          if (err2) return next(err2);

          const acentaSgsExpense = 20; // Sabit değer EUR
          let turkTransportExpenseGBP = 0;
          let digerMasraflarTL = 0;
          let ordinoCostTL = 0;

          // Masrafları topla
          if (expenses && expenses.length > 0) {
            expenses.forEach(exp => {
              if (exp.expense_type === 'turk_transport') {
                turkTransportExpenseGBP += parseFloat(exp.cost_amount) || 0;
              } else if (exp.expense_type === 'diger_masraflar') {
                digerMasraflarTL += parseFloat(exp.cost_amount) || 0;
              }
            });
          }

          // Ordino bedelini topla (TL cinsinden)
          rows.forEach(load => {
            ordinoCostTL += parseFloat(load.ordino_cost) || 0;
          });

          // Tüm masrafları EUR'ya çevir
          const turkTransportExpenseEUR = turkTransportExpenseGBP * (rates.GBP / rates.EUR);
          const digerMasraflarEUR = digerMasraflarTL / rates.EUR;
          const ordinoCostEUR = ordinoCostTL / rates.EUR;
          
          // GİDER TOPLAM (EUR cinsinden)
          const giderToplamEUR = acentaSgsExpense + turkTransportExpenseEUR + digerMasraflarEUR + ordinoCostEUR;
          
          // GİDER TOPLAM (TL cinsinden)
          const giderToplamTL = (acentaSgsExpense * rates.EUR) + (turkTransportExpenseGBP * rates.GBP) + digerMasraflarTL + ordinoCostTL;

          // KALAN ve PROFİT hesaplama (genelToplam - giderToplam)
          const kalanTL = genelToplam - giderToplamTL;
          const kalanEUR = kalanTL / rates.EUR;
          
          res.render('loads/ameta', {
            layout: false,
            positionNo,
            loads: rows,
            firstLoad,
            rates: rates,
            genelToplam: genelToplam.toFixed(2),
            giderToplam: giderToplamEUR.toFixed(2),
            giderToplamTL: giderToplamTL.toFixed(2),
            acentaSgsExpense: acentaSgsExpense.toFixed(2),
            turkTransportExpense: turkTransportExpenseGBP.toFixed(2),
            digerMasraflarTL: digerMasraflarTL.toFixed(2),
            ordinoCostTL: ordinoCostTL.toFixed(2),
            kalan: kalanTL.toFixed(2),
            kalanEUR: kalanEUR.toFixed(2),
            kur: rates.EUR.toFixed(3)
          });
          // Log AMETA view/generation
          try {
            LogModel.create({
              username: req.session && req.session.user ? req.session.user.username : null,
              role: req.session && req.session.user ? req.session.user.role : null,
              entity: 'position',
              entity_id: positionNo,
              action: 'generate_pdf',
              field: 'ameta',
              old_value: null,
              new_value: JSON.stringify({ position: positionNo })
            });
          } catch (e) { console.error('Log create error (ameta):', e); }
        });
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /loads/position/:positionNo/yl → YL formu görüntüleme (masraf tablosu olmadan)
  async showYL(req, res, next) {
    const positionNo = req.params.positionNo;

    try {
      // Kurları çek (shared service)
      const rates = await RatesService.getTCMBRates();

      LoadModel.getByPositionNo(positionNo, (err, rows) => {
        if (err) return next(err);
        if (!rows || rows.length === 0) {
          return res.status(404).send('Bu pozisyona ait yük bulunamadı.');
        }

        const firstLoad = rows[0];

        // KM verilerini çek
        const kmSql = `SELECT segments, total_km, loading_count, unloading_count, europe_count, herstal, avrupa, avrupa_data FROM position_km WHERE position_no = ?`;
        db.get(kmSql, [positionNo], (kmErr, kmData) => {
          let kmInfo = null;
          if (!kmErr && kmData) {
            let segments = [];
            try {
              segments = typeof kmData.segments === 'string' ? JSON.parse(kmData.segments) : (kmData.segments || []);
            } catch(e) { segments = []; }
            
            // Segment tipine göre hesapla
            const loadingKm = segments.filter(s => s.type === 'loading').reduce((sum, s) => sum + (Number(s.distance) || 0), 0);
            const unloadingKm = segments.filter(s => s.type === 'unloading').reduce((sum, s) => sum + (Number(s.distance) || 0), 0);
            const exitKm = segments.filter(s => s.type === 'exit').reduce((sum, s) => sum + (Number(s.distance) || 0), 0);
            const europeKm = segments.filter(s => s.type === 'europe').reduce((sum, s) => sum + (Number(s.distance) || 0), 0);
            const totalKm = segments.reduce((sum, s) => sum + (Number(s.distance) || 0), 0);
            const ingiltereKm = loadingKm + unloadingKm + exitKm; // Avrupa hariç
            
            // 20'nin katına yuvarlama fonksiyonu
            const roundTo20 = (val) => Math.ceil(val / 20) * 20;
            
            // İngiltere Herstal Mazot Hesabı
            let herstalData = null;
            if (kmData.herstal) {
              // Toplam mesafeyi 20'nin katına yuvarla (modal ile aynı)
              const t = roundTo20(ingiltereKm);
              const step1 = t + 1750;
              const step2 = step1 + 125;
              const step3 = step2 * 0.3;
              const kalanMazot = Math.ceil((1450 - step3) / 10) * 10;
              const herstalMazot = kalanMazot >= 500 ? 0 : (500 - kalanMazot);
              // MACAR: Herstal alındıysa tank 500 lt olur, 1050 - 500 = 550
              // Herstal alınmadıysa (kalan >= 500), 1050 - kalan
              const macar = kalanMazot >= 500 ? Math.max(0, 1050 - kalanMazot) : (1050 - 500);
              
              herstalData = {
                doverDover: t,
                ddHerstal: step1,
                toplamExtra: step2,
                harcananMazot: step3,
                kalanMazot: kalanMazot,
                herstalMazot: herstalMazot,
                macar: macar
              };
            }
            
            // Avrupa Mazot Hesabı - kayıtlı veriyi kullan
            let avrupaData = null;
            if (kmData.avrupa && kmData.avrupa_data) {
              try {
                avrupaData = typeof kmData.avrupa_data === 'string' ? JSON.parse(kmData.avrupa_data) : kmData.avrupa_data;
              } catch(e) { avrupaData = null; }
            }
            
            kmInfo = {
              segments: segments,
              loadingKm: loadingKm,
              unloadingKm: unloadingKm,
              exitKm: exitKm,
              europeKm: europeKm,
              ingiltereKm: ingiltereKm,
              totalKm: totalKm,
              herstal: kmData.herstal || 0,
              avrupa: kmData.avrupa || 0,
              herstalData: herstalData,
              avrupaData: avrupaData
            };
          }

          res.render('loads/yl', {
            layout: false,
            positionNo,
            loads: rows,
            firstLoad,
            rates: rates,
            kmInfo: kmInfo
          });
          // Log YL view/generation
          try {
            LogModel.create({
              username: req.session && req.session.user ? req.session.user.username : null,
              role: req.session && req.session.user ? req.session.user.role : null,
              entity: 'position',
              entity_id: positionNo,
              action: 'generate_pdf',
              field: 'yl',
              old_value: null,
              new_value: JSON.stringify({ position: positionNo })
            });
          } catch (e) { console.error('Log create error (yl):', e); }
        });
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /loads/position/:positionNo/complete → Pozisyonu tamamla
  async completePosition(req, res, next) {
    const positionNo = req.params.positionNo;
    
    try {
      const forceComplete = String((req.body && req.body.forceComplete) || '').trim() === '1';

      // Guard: require confirmation if Teslim CMR missing and/or Navlun missing
      const docCounts = await new Promise((resolve, reject) => {
        const sql = `SELECT category, COUNT(*) AS cnt FROM documents WHERE position_no = ? AND category IN ('CMR','Navlun') GROUP BY category`;
        db.all(sql, [positionNo], (err, rows) => {
          if (err) return reject(err);
          const map = { CMR: 0, Navlun: 0 };
          (rows || []).forEach(r => {
            if (r && r.category) map[r.category] = Number(r.cnt || 0);
          });
          resolve(map);
        });
      });

      const hasTeslimCMR = (docCounts.CMR || 0) > 0;
      const hasNavlunDocs = (docCounts.Navlun || 0) > 0;

      const missingTeslimCmr = !hasTeslimCMR;
      const missingNavlun = !hasNavlunDocs;

      const missingNavlunFaturaNo = await new Promise((resolve, reject) => {
        const sql = `SELECT navlun_currency, fatura_no, fatura_kime FROM loads WHERE position_no = ?`;
        db.all(sql, [positionNo], (err, rows) => {
          if (err) return reject(err);
          const list = rows || [];
          const watched = new Set(['GBP', 'TRY', 'EUR']);
          function isValidFaturaKime(val) {
            if (!val) return false;
            const trimmed = String(val).trim();
            return trimmed !== '' && trimmed !== '"' && trimmed !== '-' && trimmed !== '""';
          }
          const hasMissing = list.some(r => {
            const cur = String((r && r.navlun_currency) || '').trim().toUpperCase();
            if (!watched.has(cur)) return false;
            const fno = String((r && r.fatura_no) || '').trim();
            return fno === '' || fno === 'E-';
          });
          const expectedNavlunInvoiceCount = list.filter(r => isValidFaturaKime(r && r.fatura_kime)).length;
          const uploadedNavlunInvoiceCount = Number(docCounts.Navlun || 0);
          const navlunInvoiceCountMismatch = expectedNavlunInvoiceCount !== uploadedNavlunInvoiceCount;

          resolve({
            missingNavlunFaturaNo: hasMissing,
            expectedNavlunInvoiceCount,
            uploadedNavlunInvoiceCount,
            navlunInvoiceCountMismatch
          });
        });
      });

      const navlunInvoiceCountMismatch = !!(missingNavlunFaturaNo && missingNavlunFaturaNo.navlunInvoiceCountMismatch);
      const expectedNavlunInvoiceCount = missingNavlunFaturaNo && typeof missingNavlunFaturaNo.expectedNavlunInvoiceCount === 'number'
        ? missingNavlunFaturaNo.expectedNavlunInvoiceCount
        : null;
      const uploadedNavlunInvoiceCount = missingNavlunFaturaNo && typeof missingNavlunFaturaNo.uploadedNavlunInvoiceCount === 'number'
        ? missingNavlunFaturaNo.uploadedNavlunInvoiceCount
        : null;
      const missingNavlunFaturaNoFlag = !!(missingNavlunFaturaNo && missingNavlunFaturaNo.missingNavlunFaturaNo);

      if (!forceComplete && (missingTeslimCmr || missingNavlun || missingNavlunFaturaNoFlag || navlunInvoiceCountMismatch)) {
        const missingParts = [];
        if (missingTeslimCmr) missingParts.push('Teslim CMR');
        if (missingNavlun) missingParts.push('Navlun');
        if (missingNavlunFaturaNoFlag) missingParts.push('Navlun Fatura No');
        if (navlunInvoiceCountMismatch) missingParts.push('Navlun Fatura Sayısı');
        let msg = `Eksik/Uyarı: ${missingParts.join(', ')}. Devam etmek için "Dosya Tamamlandı" butonundan onaylayın.`;
        if (navlunInvoiceCountMismatch && expectedNavlunInvoiceCount != null && uploadedNavlunInvoiceCount != null) {
          msg += ` (Beklenen Navlun: ${expectedNavlunInvoiceCount}, Yüklü: ${uploadedNavlunInvoiceCount})`;
        }
        return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?error=${encodeURIComponent(msg)}`);
      }

      // Mevcut TCMB kurlarını al ve kaydet
      const rates = await RatesService.getTCMBRates();
      const ratesJson = JSON.stringify({
        USD: rates.USD,
        EUR: rates.EUR,
        GBP: rates.GBP,
        PARITE: rates.PARITE,
        savedAt: new Date().toISOString()
      });
      
      const sql = `UPDATE loads SET status = 'completed', completed_rates = ? WHERE position_no = ?`;
      
      db.run(sql, [ratesJson, positionNo], function(err) {
        if (err) return next(err);
        
        // Pozisyon tamamlama logu
        const logData = {
          username: req.session.user.username,
          role: req.session.user.role,
          entity: 'position',
          entity_id: null,
          entity_id_text: positionNo,
          action: 'Pozisyon Tamamlandı',
          field: 'Durum',
          old_value: 'Aktif',
          new_value: 'Tamamlandı',
          machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
        };
        LogModel.create(logData, () => {});
        
        // Bildirim gönder - Pozisyon tamamlandı
        NotificationService.notifyPositionCompleted(positionNo, req.session.user.username)
          .catch(err => console.error('[Notification] Error:', err));
        
        res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
      });
    } catch (e) {
      console.error('completePosition error:', e);
      return next(e);
    }
  },

  // POST /loads/position/:positionNo/reopen → Pozisyonu tekrar aktif yap
  reopenPosition(req, res, next) {
    const positionNo = req.params.positionNo;
    
    // Pozisyon tekrar açıldığında kaydedilen kurları da temizle
    const sql = `UPDATE loads SET status = 'active', completed_rates = NULL WHERE position_no = ?`;
    
    db.run(sql, [positionNo], function(err) {
      if (err) return next(err);
      
      // Pozisyon yeniden açma logu
      const logData = {
        username: req.session.user.username,
        role: req.session.user.role,
        entity: 'position',
        entity_id: null,
        entity_id_text: positionNo,
        action: 'Pozisyon Yeniden Açıldı',
        field: 'Durum',
        old_value: 'Tamamlandı',
        new_value: 'Aktif',
        machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
      };
      LogModel.create(logData, () => {});
      
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // POST /loads/position/:positionNo/mark-no-expense → Pozisyonu masraf yok olarak işaretle
  markNoExpense(req, res, next) {
    const positionNo = req.params.positionNo;
    
    const sql = `UPDATE loads SET no_expense = 1 WHERE position_no = ?`;
    
    db.run(sql, [positionNo], function(err) {
      if (err) return next(err);
      
      // Masraf yok işaretleme logu
      const logData = {
        username: req.session.user.username,
        role: req.session.user.role,
        entity: 'position',
        entity_id: null,
        entity_id_text: positionNo,
        action: 'Masraf Yok İşaretlendi',
        field: 'Masraf Durumu',
        old_value: 'Masraf Var',
        new_value: 'Masraf Yok',
        machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
      };
      LogModel.create(logData, () => {});
      
      // Bildirim gönder - Masrafı eksik pozisyon
      NotificationService.notifyExpenseMissing(positionNo, req.session.user.username)
        .catch(err => console.error('[Notification] Expense missing error:', err));
      
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // POST /loads/position/:positionNo/unmark-no-expense → Masraf yok işaretini kaldır
  unmarkNoExpense(req, res, next) {
    const positionNo = req.params.positionNo;
    
    const sql = `UPDATE loads SET no_expense = 0 WHERE position_no = ?`;
    
    db.run(sql, [positionNo], function(err) {
      if (err) return next(err);
      
      // Masraf yok işaretini kaldırma logu
      const logData = {
        username: req.session.user.username,
        role: req.session.user.role,
        entity: 'position',
        entity_id: null,
        entity_id_text: positionNo,
        action: 'Masraf Yok İşareti Kaldırıldı',
        field: 'Masraf Durumu',
        old_value: 'Masraf Yok',
        new_value: 'Masraf Var',
        machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
      };
      LogModel.create(logData, () => {});
      
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // /loads → liste (grouped by position_no)
  list(req, res, next) {
    // First get available years from database
    LoadModel.getAvailableYears((yearErr, availableYears) => {
      if (yearErr) {
        console.error('Failed to get available years:', yearErr);
        availableYears = [new Date().getFullYear()]; // fallback
      }
      
      // Year filter: default to first available year (most recent)
      const defaultYear = availableYears.length > 0 ? availableYears[0] : new Date().getFullYear();
      const yearParam = req.query.year ? String(req.query.year).trim() : String(defaultYear);
      const yearPrefix = yearParam.slice(-2); // '2025' -> '25'
      
      // If a query `q` is provided, run a server-side search (supports UID lookup)
      const q = req.query && typeof req.query.q !== 'undefined' ? String(req.query.q).trim() : '';
      const fetchRows = (cb) => {
        if (q && q.length > 0) {
          return LoadModel.search(q, cb);
        }
        // Use year-filtered query
        return LoadModel.getByYearPrefix(yearPrefix, cb);
      };

    fetchRows((err, rows) => {
      if (err) return next(err);

      // Group loads by position_no
      const grouped = {};
      const groupOrder = [];

      if (rows && rows.length > 0) {
        rows.forEach((load) => {
          const posNo = load.position_no;

          if (!grouped[posNo]) {
            grouped[posNo] = {
              position_no: posNo,
              truck_plate: load.truck_plate,
              trailer_plate: load.trailer_plate,
              exit_date: load.exit_date,
              arrival_date: load.arrival_date,
              loading_date: load.loading_date,
              loading_country: load.loading_country,
              loading_city: load.loading_city,
              unloading_country: load.unloading_country,
              unloading_city: load.unloading_city,
              loads: [],
            };
            groupOrder.push(posNo);
          }

          grouped[posNo].loads.push(load);
        });
      }

      const groupedLoads = groupOrder.map((posNo) => grouped[posNo]);

      // Default sort: order positions by their numeric suffix (e.g. 25/200-558 → 558) descending
      function extractPositionSeq(pos) {
        try {
          if (!pos) return 0;
          const parts = String(pos).split('-');
          const last = parts[parts.length - 1] || parts[0];
          const digits = String(last).replace(/[^0-9]/g, '');
          const n = parseInt(digits, 10);
          return isNaN(n) ? 0 : n;
        } catch (e) { return 0; }
      }
      groupedLoads.sort((a, b) => extractPositionSeq(b.position_no) - extractPositionSeq(a.position_no));

      // Pre-fetch document counts for all positions shown on the list to avoid per-row queries.
      const positionNos = groupedLoads.map(g => g.position_no).filter(Boolean);
      if (positionNos.length > 0) {
        const placeholders = positionNos.map(() => '?').join(',');
        // Count any documents for the positions (include both accounting uploads and position uploads)
        // Fetch document counts grouped by position_no and category so we can detect category-specific uploads (Navlun, T1/GMR, CMR, ...)
        const docsSql = `SELECT position_no, category, COUNT(1) AS cnt FROM documents WHERE position_no IN (${placeholders}) GROUP BY position_no, category`;
        db.all(docsSql, positionNos, (docsErr, docsRows) => {
          const docsMap = {}; // { position_no: totalCount }
          const docsByCategory = {}; // { position_no: { category: count } }
          if (docsRows && Array.isArray(docsRows)) {
            docsRows.forEach(r => {
              const pos = r.position_no;
              const c = r.category || '';
              const count = Number(r.cnt || 0);
              docsMap[pos] = (docsMap[pos] || 0) + count;
              docsByCategory[pos] = docsByCategory[pos] || {};
              docsByCategory[pos][c] = (docsByCategory[pos][c] || 0) + count;
            });
          }
          // Attach docs_count, has_documents and docs_by_category to each group (defaults)
          groupedLoads.forEach(g => {
            const cnt = docsMap[g.position_no] || 0;
            g.docs_count = cnt;
            g.has_documents = cnt > 0;
            g.docs_by_category = docsByCategory[g.position_no] || {};
            // convenience flags
            g.has_t1_docs = (g.docs_by_category['T1/GMR'] || 0) > 0;
            g.has_navlun_docs = (g.docs_by_category['Navlun'] || 0) > 0;
            g.has_cmr_docs = (g.docs_by_category['CMR'] || 0) > 0;
          });

          // Now that docs info is attached, proceed with representative selection and rendering
          finalizeAndRender();
        });
      } else {
        // no positions, ensure groups have defaults
          groupedLoads.forEach(g => { g.docs_count = 0; g.has_documents = false; });
          // Proceed to finalize/render when there are no positions to query
          finalizeAndRender();
      }

      // Encapsulate representative selection and template rendering so it can be run after docs count query.
      function finalizeAndRender() {
        // For each grouped position, pick a representative load to display in the list.
        // Priority:
        // 1. Load with a non-empty `ihr_poz`
        // 2. Load with a non-empty `truck_plate` or `trailer_plate`
        // 3. Leave current order (most recent first)
        groupedLoads.forEach(group => {
          if (!group.loads || group.loads.length <= 1) return;
          let repIndex = -1;
          // prefer ihr_poz
          repIndex = group.loads.findIndex(l => l.ihr_poz && String(l.ihr_poz).trim() !== '');
          // if none found, prefer a load with truck or trailer plate
          if (repIndex === -1) {
            // prefer a load with plates
            repIndex = group.loads.findIndex(l => (l.truck_plate && String(l.truck_plate).trim() !== '') || (l.trailer_plate && String(l.trailer_plate).trim() !== ''));
          }
          // If still not found, try to pick the first non-empty load (not an optimistic empty row)
          if (repIndex === -1) {
            repIndex = group.loads.findIndex(l => {
              const hasAny = (l.customer_name && String(l.customer_name).trim() !== '') ||
                             (l.consignee_name && String(l.consignee_name).trim() !== '') ||
                             (l.uid && String(l.uid).trim() !== '') ||
                             (l.truck_plate && String(l.truck_plate).trim() !== '') ||
                             (l.trailer_plate && String(l.trailer_plate).trim() !== '');
              return hasAny;
            });
          }
          if (repIndex > 0) {
            const [rep] = group.loads.splice(repIndex, 1);
            group.loads.unshift(rep);
          }
          // Ensure the group's displayed truck/trailer reflect the chosen representative
          if (group.loads && group.loads[0]) {
            group.truck_plate = group.loads[0].truck_plate || null;
            group.trailer_plate = group.loads[0].trailer_plate || null;
            // Compute a stable display exit date from the representative load: prefer exit_date, fallback to loading_date
            const rawDate = group.loads[0].exit_date || group.loads[0].loading_date || null;
            group.display_exit_date = rawDate;
            // Format as DD/MM/YYYY for display
            try {
              if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                  const day = String(d.getDate()).padStart(2, '0');
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const year = d.getFullYear();
                  // format as gg.aa.yyyy
                  group.display_exit_date_formatted = `${day}.${month}.${year}`;
                } else {
                  group.display_exit_date_formatted = rawDate;
                }
              } else {
                group.display_exit_date_formatted = null;
              }
            } catch (e) {
              group.display_exit_date_formatted = rawDate;
            }
          }
        });

        // Fetch latest naming (from `named` table) for the representative load of each group.
        let pending = groupedLoads.length;
        if (pending === 0) {
          // No groups, proceed to render lookups
          getFormLookups((lookupErr, lookups) => {
            if (lookupErr) return next(lookupErr);
            res.render('loads/list', { loads: rows, groupedLoads: groupedLoads, year: yearParam, availableYears, ...lookups });
          });
          return;
        }

        groupedLoads.forEach((group) => {
          const rep = group.loads && group.loads[0];
          if (!rep || !rep.id) {
            group.type = '-';
            pending -= 1;
            if (pending === 0) {
              getFormLookups((lookupErr, lookups) => {
                if (lookupErr) return next(lookupErr);
                res.render('loads/list', { loads: rows, groupedLoads: groupedLoads, year: yearParam, availableYears, ...lookups });
              });
            }
            return;
          }

          db.get('SELECT name FROM named WHERE load_id = ? ORDER BY id DESC LIMIT 1', [rep.id], (nErr, nRow) => {
            if (nErr) {
              console.error('Failed to fetch named for load', rep.id, nErr.message);
              group.type = '-';
            } else {
              // Use the presence of a row to decide: allow empty string to be displayed as empty
              if (nRow && (nRow.name !== null && typeof nRow.name !== 'undefined')) {
                group.type = nRow.name; // may be empty string
              } else {
                group.type = '-';
              }
            }

            pending -= 1;
            if (pending === 0) {
              getFormLookups((lookupErr, lookups) => {
                if (lookupErr) return next(lookupErr);
                res.render('loads/list', { loads: rows, groupedLoads: groupedLoads, year: yearParam, availableYears, ...lookups });
              });
            }
          });
        });
      }
    });
    }); // close getAvailableYears
  },

  // /loads/new → boş form
  showCreateForm(req, res, next) {
    getFormLookups((err, lookups) => {
      if (err) return next(err);

      res.render('loads/form', {
        load: {},
        errors: null,
        duplicatePosition: false,
        isEdit: false,
        editing: false,
        isSamePositionDuplicate: false,
        ...lookups,
      });
    });
  },

  // 'Yeni yük aynı pozisyona' handler removed

  // POST /loads → yeni kayıt oluştur
  create(req, res, next) {
    const body = req.body;
    
    // JSON isteği mi kontrol et
    const isJson = req.headers['content-type'] === 'application/json';
    
    // Lokasyon alanlarını parse et (inline edit için)
    let loading_city = body.loading_city;
    let loading_country = body.loading_country;
    let unloading_city = body.unloading_city;
    let unloading_country = body.unloading_country;
    
    if (body.loading_location) {
      const parts = body.loading_location.split('/').map(p => p.trim());
      loading_city = parts[0] || '';
      loading_country = parts[1] || '';
    }
    
    if (body.unloading_location) {
      const parts = body.unloading_location.split('/').map(p => p.trim());
      unloading_city = parts[0] || '';
      unloading_country = parts[1] || '';
    }
    
    const resolvePositionNo = (callback) => {
      if (body.position_no) {
        callback(null, body.position_no);
      } else {
        LoadModel.getNextPositionNo(callback);
      }
    };

    resolvePositionNo((err, nextPositionNo) => {
      if (err) {
        if (isJson) return res.json({ success: false, message: err.message });
        return next(err);
      }

      const data = {
        position_no: nextPositionNo,
        naming: body.naming,
        ihr_poz: body.ihr_poz || null,
        customer_name: body.customer_name,
        consignee_name: body.consignee_name,
        loading_country: loading_country,
        loading_city: loading_city,
        loading_address: body.loading_address,
        unloading_country: unloading_country,
        unloading_city: unloading_city,
        unloading_address: body.unloading_address,
        goods_description: body.goods_description,
        packages: body.packages,
        pallets: body.pallets,
        ldm: body.ldm,
        gross_weight: body.gross_weight,
        net_weight: body.net_weight,
        truck_plate: body.truck_plate,
        trailer_plate: body.trailer_plate,
        driver_name: body.driver_name,
        t1_mrn: body.t1_mrn,
        exit_date: body.exit_date,
        arrival_date: body.arrival_date,
        loading_date: body.loading_date,
        unloading_date: body.unloading_date,
        navlun_currency: body.navlun_currency || null,
        navlun_amount: body.navlun_amount,
        ydg_amount: body.ydg_amount,
        fatura_kime: body.fatura_kime,
        fatura_no: body.fatura_no,
        cost_currency: body.cost_currency,
        cost_amount: body.cost_amount,
        notes: body.notes,
        created_by: req.session.user.username,
        seal_code: body.seal_code || null,
        ordino_cost: body.ordino_cost || 0,
        ref: body.ref || null,
      };

      LoadModel.create(data, (err2) => {
        if (err2) {
          if (isJson) return res.json({ success: false, message: err2.message });
          return next(err2);
        }

        // Yeni yükleme oluşturma logu
        const logData = {
          username: req.session.user.username,
          role: req.session.user.role,
          entity: 'position',
          entity_id: null,
          entity_id_text: nextPositionNo,
          action: 'Yeni Yükleme Oluşturuldu',
          field: 'Müşteri',
          old_value: null,
          new_value: data.customer_name || '-',
          machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
        };
        LogModel.create(logData, () => {});

        // Bildirim gönder - Sadece yeni pozisyon oluşturulduğunda (mevcut pozisyona yük eklemede değil)
        // Veritabanında bu pozisyon numarasıyla başka yük var mı kontrol et
        db.get('SELECT COUNT(*) as count FROM loads WHERE position_no = ?', [nextPositionNo], (countErr, countRow) => {
          const existingLoadCount = countRow ? countRow.count : 0;
          // Eğer sadece 1 kayıt varsa (yeni eklenen), bu yeni bir pozisyondur
          if (existingLoadCount <= 1) {
            NotificationService.notifyNewPosition(nextPositionNo, req.session.user.username)
              .catch(err => console.error('[Notification] Error:', err));
          }
        });

        if (isJson) {
          return res.json({ success: true, position_no: nextPositionNo });
        }
        
        // Yeni yükleme oluşturulduktan sonra position sayfasına yönlendir
        const positionNo = encodeURIComponent(nextPositionNo);
        res.redirect(`/loads/position/${positionNo}`);
      });
    });
  },

  // GET /loads/:id → detay sayfası
  showDetail(req, res, next) {
    const id = req.params.id;

    LoadModel.getById(id, (err, load) => {
      if (err) return next(err);
      if (!load) {
        return res.status(404).send('Kayıt bulunamadı.');
      }

      SealModel.getByPosition(load.position_no, (err2, seal) => {
        if (err2) return next(err2);

        LoadModel.getByPositionNo(load.position_no, (err3, siblings) => {
          if (err3) return next(err3);

          const otherLoads = (siblings || []).filter(
            (sibling) => sibling.id !== load.id
          );

          // attempt to resolve driver id and truck id for quick links
          const driverName = load.driver_name;
          const truckPlate = load.truck_plate;
          let driverId = null;
          let truckId = null;

          const tasks = [];
          if (driverName) {
            tasks.push(cb => {
              db.get('SELECT id FROM drivers WHERE name = ? LIMIT 1', [driverName], (dErr, dRow) => {
                if (!dErr && dRow) driverId = dRow.id;
                cb();
              });
            });
          }
          if (truckPlate) {
            tasks.push(cb => {
              db.get('SELECT id FROM trucks WHERE plate = ? LIMIT 1', [truckPlate], (tErr, tRow) => {
                if (!tErr && tRow) truckId = tRow.id;
                cb();
              });
            });
          }

          // run tasks in series
          (function runTasks(i) {
            if (i >= tasks.length) {
              return res.render('loads/detail', {
                load,
                seal,
                otherLoads: otherLoads || [],
                driverId,
                truckId
              });
            }
            tasks[i](() => runTasks(i+1));
          })(0);
        });
      });
    });
  },

  // GET /loads/api/:id → return JSON for a load (used by AJAX in list view)
  getJson(req, res, next) {
    const id = req.params.id;
    LoadModel.getById(id, (err, load) => {
      if (err) return res.json({ success: false, message: err.message });
      if (!load) return res.json({ success: false, message: 'Kayıt bulunamadı' });
      // also fetch latest named value for this load
      db.get('SELECT name FROM named WHERE load_id = ? ORDER BY id DESC LIMIT 1', [id], (nErr, nRow) => {
        if (!nErr && nRow) {
          load.naming = nRow.name;
        }
        return res.json({ success: true, load });
      });
    });
  },

  // GET /loads/:id/edit → edit formu
  showEditForm(req, res, next) {
    const id = req.params.id;

    LoadModel.getById(id, (err, load) => {
      if (err) return next(err);
      if (!load) {
        return res.status(404).send('Kayıt bulunamadı.');
      }

      getFormLookups((err2, lookups) => {
        if (err2) return next(err2);

        res.render('loads/form', {
          load,
          errors: null,
          duplicatePosition: false,
          isEdit: true,
          editing: true,
          isSamePositionDuplicate: false,
          ...lookups,
        });
      });
    });
  },

  // POST /loads/:id or /loads/:id/edit → güncelle
  update(req, res, next) {
    const id = req.params.id;
    const isJson = req.headers['content-type'] === 'application/json';

    // fetch current record to compare fields for logging and to preserve unspecified fields
    LoadModel.getById(id, (errGet, oldLoad) => {
      if (errGet) return next(errGet);
      if (!oldLoad) return res.status(404).send('Kayıt bulunamadı.');

      const body = req.body || {};

      // Helper: whether a field was explicitly provided in the request
      const provided = (k) => Object.prototype.hasOwnProperty.call(body, k);
      const val = (k) => provided(k) ? (body[k] === '' ? '' : body[k]) : (oldLoad[k] !== undefined ? oldLoad[k] : null);

      const data = {
        position_no: provided('position_no') ? body.position_no : (oldLoad.position_no || null),
        ihr_poz: provided('ihr_poz') ? (body.ihr_poz || null) : (oldLoad.ihr_poz || null),
        customer_name: val('customer_name'),
        consignee_name: val('consignee_name'),
        loading_country: val('loading_country'),
        loading_city: val('loading_city'),
        loading_address: val('loading_address'),
        unloading_country: val('unloading_country'),
        unloading_city: val('unloading_city'),
        unloading_address: val('unloading_address'),
        goods_description: val('goods_description'),
        packages: provided('packages') ? body.packages : (oldLoad.packages || null),
        pallets: provided('pallets') ? body.pallets : (oldLoad.pallets || null),
        ldm: provided('ldm') ? body.ldm : (oldLoad.ldm || null),
        gross_weight: provided('gross_weight') ? body.gross_weight : (oldLoad.gross_weight || null),
        net_weight: provided('net_weight') ? body.net_weight : (oldLoad.net_weight || null),
        volume_m3: provided('volume_m3') ? body.volume_m3 : (oldLoad.volume_m3 || null),
        truck_plate: val('truck_plate'),
        trailer_plate: val('trailer_plate'),
        driver_name: val('driver_name'),
        t1_mrn: val('t1_mrn'),
        exit_date: provided('exit_date') ? body.exit_date : (oldLoad.exit_date || null),
        arrival_date: provided('arrival_date') ? body.arrival_date : (oldLoad.arrival_date || null),
        loading_date: provided('loading_date') ? body.loading_date : (oldLoad.loading_date || null),
        unloading_date: provided('unloading_date') ? body.unloading_date : (oldLoad.unloading_date || null),
        ref: provided('ref') ? (body.ref || null) : (oldLoad.ref || null),
        navlun_currency: provided('navlun_currency') ? body.navlun_currency : (oldLoad.navlun_currency || null),
        navlun_amount: provided('navlun_amount') ? body.navlun_amount : (oldLoad.navlun_amount || null),
        ydg_amount: provided('ydg_amount') ? body.ydg_amount : (oldLoad.ydg_amount || null),
        fatura_kime: provided('fatura_kime') ? body.fatura_kime : (oldLoad.fatura_kime || null),
        fatura_no: provided('fatura_no') ? body.fatura_no : (oldLoad.fatura_no || null),
        cost_currency: provided('cost_currency') ? body.cost_currency : (oldLoad.cost_currency || null),
        cost_amount: provided('cost_amount') ? body.cost_amount : (oldLoad.cost_amount || null),
        notes: provided('notes') ? body.notes : (oldLoad.notes || null),
        seal_code: provided('seal_code') ? (body.seal_code || null) : (oldLoad.seal_code || null),
        ordino_cost: provided('ordino_cost') ? body.ordino_cost : (oldLoad.ordino_cost || 0),
        mrn_no: provided('mrn_no') ? (body.mrn_no || null) : (oldLoad.mrn_no || null),
      };

      LoadModel.update(id, data, (err) => {
        if (err) return next(err);

        // create a generic update log
        LogModel.create({
          username: req.session.user.username,
          entity: 'load',
          entity_id: id,
          action: 'update'
        });

        // create per-field logs for ALL important fields if changed
        try {
          if (oldLoad) {
            // Tüm önemli alanları logla
            const fieldsToLog = [
              // Araç bilgileri
              't1_mrn', 'truck_plate', 'trailer_plate', 'seal_code', 'driver_name', 'driver_phone',
              // Müşteri bilgileri
              'customer_name', 'consignee_name',
              // Yük bilgileri
              'packages', 'gross_weight', 'goods_description',
              // Konum bilgileri
              'loading_location', 'loading_city', 'loading_country',
              'unloading_location', 'unloading_city', 'unloading_country',
              // Tarihler
              'loading_date', 'unloading_date', 'arrival_date',
              // Finansal bilgiler
              'navlun_amount', 'navlun_currency', 'cost_amount', 'cost_currency',
              'ydg_amount', 'ordino_cost',
              // Fatura bilgileri
              'fatura_kime', 'fatura_no',
              // Durum bilgileri
              'status', 'ref', 'mrn_no', 'notes'
            ];
            
            // Alan isimlerini Türkçe'ye çevir (log görünümü için)
            const fieldLabels = {
              't1_mrn': 'T1 MRN',
              'truck_plate': 'Çekici Plaka',
              'trailer_plate': 'Dorse Plaka',
              'seal_code': 'Mühür Kodu',
              'driver_name': 'Şoför Adı',
              'driver_phone': 'Şoför Telefon',
              'customer_name': 'Müşteri',
              'consignee_name': 'Alıcı',
              'packages': 'Koli Sayısı',
              'gross_weight': 'Brüt Ağırlık',
              'goods_description': 'Mal Cinsi',
              'loading_location': 'Yükleme Adresi',
              'loading_city': 'Yükleme Şehir',
              'loading_country': 'Yükleme Ülke',
              'unloading_location': 'Boşaltma Adresi',
              'unloading_city': 'Boşaltma Şehir',
              'unloading_country': 'Boşaltma Ülke',
              'loading_date': 'Yükleme Tarihi',
              'unloading_date': 'Boşaltma Tarihi',
              'arrival_date': 'Varış Tarihi',
              'navlun_amount': 'Navlun Tutarı',
              'navlun_currency': 'Navlun Para Birimi',
              'cost_amount': 'Maliyet Tutarı',
              'cost_currency': 'Maliyet Para Birimi',
              'ydg_amount': 'YDG Tutarı',
              'ordino_cost': 'Ordino Maliyeti',
              'fatura_kime': 'Fatura Kime',
              'fatura_no': 'Fatura No',
              'status': 'Durum',
              'ref': 'Referans',
              'mrn_no': 'MRN No',
              'notes': 'Notlar'
            };
            
            fieldsToLog.forEach(f => {
              const oldVal = oldLoad[f] != null ? String(oldLoad[f]) : '';
              const newVal = data[f] != null ? String(data[f]) : '';
              if (oldVal !== newVal) {
                LogModel.create({
                  username: req.session.user.username,
                  role: req.session.user.role,
                  entity: 'load',
                  entity_id: id,
                  action: 'update_field',
                  field: fieldLabels[f] || f,
                  old_value: oldVal || null,
                  new_value: newVal || null
                });
              }
            });
          }
        } catch (e) { console.error('Log create error (update fields):', e); }

        // If a naming value was provided in the request (even empty), persist to `named` table
        if (Object.prototype.hasOwnProperty.call(req.body, 'naming')) {
          NamedModel.createForLoad(id, req.body.naming, (nErr) => {
            if (nErr) console.error('Failed to insert named on update:', nErr.message);
            if (isJson) {
              return res.json({ success: true, position_no: data.position_no || (oldLoad && oldLoad.position_no) || null });
            }
            return res.redirect(`/loads/${id}`);
          });
        } else {
            if (isJson) {
              return res.json({ success: true, position_no: data.position_no || (oldLoad && oldLoad.position_no) || null });
            }
            return res.redirect(`/loads/${id}`);
        }
      });
    });
  },

  // POST /loads/:id/update-field → Inline tek alan güncellemesi
  updateField(req, res, next) {
    const id = req.params.id;
    const { field, value } = req.body;

    // Alan isimlerini Türkçe'ye çevir
    const fieldLabels = {
      'customer_name': 'Müşteri',
      'consignee_name': 'Alıcı',
      'packages': 'Koli Sayısı',
      'gross_weight': 'Brüt Ağırlık',
      'goods_description': 'Mal Cinsi',
      'navlun_amount': 'Navlun Tutarı',
      'navlun_currency': 'Navlun Para Birimi',
      'fatura_kime': 'Fatura Kime',
      'fatura_no': 'Fatura No',
      'ordino_cost': 'Ordino Maliyeti',
      'loading_location': 'Yükleme Lokasyonu',
      'unloading_location': 'Boşaltma Lokasyonu',
      'loading_city': 'Yükleme Şehir',
      'loading_country': 'Yükleme Ülke',
      'unloading_city': 'Boşaltma Şehir',
      'unloading_country': 'Boşaltma Ülke',
      'ydg_amount': 'YDG Tutarı',
      'uid': 'UID',
      'ldm': 'LDM',
      'ref': 'Referans'
    };

    // İzin verilen alanlar
    const allowedFields = [
      'customer_name', 'consignee_name', 'packages', 'gross_weight',
      'goods_description', 'navlun_amount', 'navlun_currency',
      'fatura_kime', 'fatura_no', 'ordino_cost', 'loading_location', 'unloading_location',
      'loading_city', 'loading_country', 'unloading_city', 'unloading_country',
      'ydg_amount', 'uid', 'ldm', 'ref'
    ];

    if (!allowedFields.includes(field)) {
      return res.json({ success: false, message: 'Geçersiz alan' });
    }

    // Lokasyon alanları özel işlem gerektirir
    if (field === 'loading_location' || field === 'unloading_location') {
      const parts = value.split('/').map(p => p.trim());
      const city = parts[0] || '';
      const country = parts[1] || '';
      
      // Önce eski değeri al
      const oldSql = field === 'loading_location' 
        ? `SELECT loading_city, loading_country FROM loads WHERE id = ?`
        : `SELECT unloading_city, unloading_country FROM loads WHERE id = ?`;
      
      db.get(oldSql, [id], (oldErr, oldRow) => {
        const oldValue = oldRow 
          ? (field === 'loading_location' 
              ? `${oldRow.loading_city || ''}/${oldRow.loading_country || ''}`
              : `${oldRow.unloading_city || ''}/${oldRow.unloading_country || ''}`)
          : '';
        
        if (field === 'loading_location') {
          const sql = `UPDATE loads SET loading_city = ?, loading_country = ? WHERE id = ?`;
          db.run(sql, [city, country, id], (err) => {
            if (err) return res.json({ success: false, message: err.message });
            
            // Log kaydet
            LogModel.create({
              username: req.session && req.session.user ? req.session.user.username : null,
              role: req.session && req.session.user ? req.session.user.role : null,
              entity: 'load',
              entity_id: id,
              action: 'update_field',
              field: fieldLabels[field] || field,
              old_value: oldValue || null,
              new_value: value || null
            });
            
            return res.json({ success: true });
          });
        } else {
          const sql = `UPDATE loads SET unloading_city = ?, unloading_country = ? WHERE id = ?`;
          db.run(sql, [city, country, id], (err) => {
            if (err) return res.json({ success: false, message: err.message });
            
            // Log kaydet
            LogModel.create({
              username: req.session && req.session.user ? req.session.user.username : null,
              role: req.session && req.session.user ? req.session.user.role : null,
              entity: 'load',
              entity_id: id,
              action: 'update_field',
              field: fieldLabels[field] || field,
              old_value: oldValue || null,
              new_value: value || null
            });
            
            return res.json({ success: true });
          });
        }
      });
      return;
    }

    // Normal alan güncellemesi
    const selectSql = `SELECT ${field} as oldValue FROM loads WHERE id = ? LIMIT 1`;
    db.get(selectSql, [id], (selErr, row) => {
      if (selErr) {
        return res.json({ success: false, message: selErr.message });
      }
      const oldValue = row ? row.oldValue : null;
      const sql = `UPDATE loads SET ${field} = ? WHERE id = ?`;
      db.run(sql, [value || null, id], (err) => {
        if (err) {
          return res.json({ success: false, message: err.message });
        }

        LogModel.create({
          username: req.session && req.session.user ? req.session.user.username : null,
          role: req.session && req.session.user ? req.session.user.role : null,
          entity: 'load',
          entity_id: id,
          action: 'update_field',
          field: fieldLabels[field] || field,
          old_value: oldValue != null ? String(oldValue) : null,
          new_value: value != null ? String(value) : null
        }, () => {
          res.json({ success: true });
        });
      });
    });
  },

  // POST /loads/:id/assign-uid → server-side assign a unique 5-digit UID
  assignUid(req, res, next) {
    const id = req.params.id;

    // First, check if this load already has a UID
    db.get('SELECT uid FROM loads WHERE id = ? LIMIT 1', [id], (err, row) => {
      if (err) return res.json({ success: false, message: err.message });
      if (row && row.uid) {
        return res.json({ success: true, uid: String(row.uid) });
      }

      // Try to generate and persist a unique 5-digit UID. Rely on DB UNIQUE index to avoid races.
      const maxAttempts = 60;
      let attempts = 0;

      function tryAssign() {
        attempts++;
        const candidate = String(Math.floor(Math.random() * 90000) + 10000); // 10000 - 99999
        // Attempt to update. If UNIQUE constraint violation happens, retry.
        const sql = `UPDATE loads SET uid = ? WHERE id = ?`;
        db.run(sql, [candidate, id], function(uErr) {
          if (!uErr) {
            return res.json({ success: true, uid: candidate });
          }
          const msg = (uErr && uErr.message) ? uErr.message.toLowerCase() : '';
          // If it's a unique constraint error, retry, otherwise return error
          if ((msg.includes('unique') || msg.includes('constraint')) && attempts < maxAttempts) {
            return tryAssign();
          }
          return res.json({ success: false, message: uErr.message || 'UID assign error' });
        });
      }

      tryAssign();
    });
  },

  // POST /loads/:id/delete → sil
  delete(req, res, next) {
    const id = req.params.id;

    // Silinecek yükün pozisyon numarasını al
    LoadModel.getById(id, (getErr, load) => {
      if (getErr) return next(getErr);
      
      const positionNo = load ? load.position_no : null;

      LoadModel.delete(id, (err) => {
        if (err) return next(err);

        // After deleting the load, if it carried an `ihr_poz` or plates for the position,
        // try to preserve those values by copying them to the first remaining load for this position
        try {
          const oldIhr = load ? load.ihr_poz : null;
          const oldTruck = load ? load.truck_plate : null;
          const oldTrailer = load ? load.trailer_plate : null;

          if (positionNo && (oldIhr || oldTruck || oldTrailer)) {
            LoadModel.getByPositionNo(positionNo, (gErr, siblings) => {
              if (gErr) {
                console.error('Error fetching siblings after delete:', gErr);
              }
              const first = (siblings || []).length ? siblings[0] : null;
              if (first) {
                const updateData = {};
                // only set if target is empty to avoid overwriting existing info
                if (oldIhr && !first.ihr_poz) updateData.ihr_poz = oldIhr;
                if (oldTruck && !first.truck_plate) updateData.truck_plate = oldTruck;
                if (oldTrailer && !first.trailer_plate) updateData.trailer_plate = oldTrailer;

                if (Object.keys(updateData).length > 0) {
                  // ensure updateData has required fields for LoadModel.update
                  const dataForUpdate = Object.assign({
                    customer_name: first.customer_name,
                    consignee_name: first.consignee_name,
                    loading_country: first.loading_country,
                    loading_city: first.loading_city,
                    loading_address: first.loading_address,
                    unloading_country: first.unloading_country,
                    unloading_city: first.unloading_city,
                    unloading_address: first.unloading_address,
                    goods_description: first.goods_description,
                    packages: first.packages,
                    pallets: first.pallets,
                    ldm: first.ldm,
                    gross_weight: first.gross_weight,
                    net_weight: first.net_weight,
                    driver_name: first.driver_name,
                    t1_mrn: first.t1_mrn,
                    exit_date: first.exit_date,
                    arrival_date: first.arrival_date,
                    loading_date: first.loading_date,
                    unloading_date: first.unloading_date,
                    ref: first.ref || null,
                    navlun_currency: first.navlun_currency,
                    navlun_amount: first.navlun_amount,
                    ydg_amount: first.ydg_amount,
                    fatura_kime: first.fatura_kime,
                    fatura_no: first.fatura_no,
                    cost_currency: first.cost_currency,
                    cost_amount: first.cost_amount,
                    notes: first.notes,
                    seal_code: first.seal_code || null,
                    ordino_cost: first.ordino_cost || 0,
                    mrn_no: first.mrn_no || null,
                    uid: first.uid || null
                  }, updateData);

                  LoadModel.update(first.id, dataForUpdate, (updErr) => {
                    if (updErr) console.error('Error updating first sibling after delete:', updErr);
                    // create delete log and redirect regardless
                    LogModel.create({
                      username: req.session.user.username,
                      role: req.session.user.role,
                      entity: 'load',
                      entity_id: id,
                      entity_id_text: positionNo || null,
                      action: 'Yük Silindi',
                      field: 'Yük ID',
                      old_value: String(id),
                      new_value: null,
                      machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
                    }, () => {
                      if (positionNo) {
                        res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
                      } else {
                        res.redirect('/loads');
                      }
                    });
                  });
                  return;
                }
              }
              // fallback: just create delete log and redirect
              LogModel.create({
                username: req.session.user.username,
                role: req.session.user.role,
                entity: 'load',
                entity_id: id,
                entity_id_text: positionNo || null,
                action: 'Yük Silindi',
                field: 'Yük ID',
                old_value: String(id),
                new_value: null,
                machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
              }, () => {
                if (positionNo) {
                  res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
                } else {
                  res.redirect('/loads');
                }
              });
            });
            return;
          }
        } catch (e) {
          console.error('Error preserving position metadata after delete:', e);
        }

        // default: create delete log and redirect
        LogModel.create({
          username: req.session.user.username,
          role: req.session.user.role,
          entity: 'load',
          entity_id: id,
          entity_id_text: positionNo || null,
          action: 'Yük Silindi',
          field: 'Yük ID',
          old_value: String(id),
          new_value: null,
          machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
        }, () => {
          if (positionNo) {
            res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
          } else {
            res.redirect('/loads');
          }
        });
      });
    });
  },

  // POST /loads/position/:positionNo/delete → pozisyondaki tüm yükleri sil
  deletePosition(req, res, next) {
    const positionNo = req.params.positionNo;

    // İlk olarak pozisyona bağlı evrak kayıtlarını ve dosyalarını temizle, sonra yükleri sil
    LoadModel.getByPositionNo(positionNo, (err, loads) => {
      if (err) return next(err);

      // Eğer pozisyonda hiç yük yoksa doğrudan yönlendir
      if (!loads || loads.length === 0) {
        return res.redirect('/loads');
      }

      // Pozisyona ait masrafları sil (position_expenses tablosu)
      const ExpenseModel = require('../models/expenseModel');
      ExpenseModel.deleteByPosition(positionNo, (expErr) => {
        if (expErr) {
          console.error('[DeletePosition] Masraf silme hatası:', expErr);
          // Hata olsa bile devam et
        } else {
          console.log('[DeletePosition] Masraflar silindi:', positionNo);
        }
      });

      // Pozisyona ait ihr_poz bilgisi varsa dosyaların kaydedildiği klasörü tahmin etmek için kullan
      let ihrPoz = null;
      for (const l of loads) {
        if (l && l.ihr_poz) {
          ihrPoz = l.ihr_poz;
          break;
        }
      }

      // Evrak kayıtlarını çek (hem accounting hem de position evrakları)
      const docSql = `SELECT id, position_no, filename, original_name, category, type FROM documents WHERE position_no = ?`;
      db.all(docSql, [positionNo], (docErr, documents) => {
        if (docErr) return next(docErr);

        const uploadsRoot = path.join(__dirname, '..', '..', 'uploads', 'accounting');
        const positionUploadsRoot = path.join(__dirname, '..', '..', 'uploads');

        // Eğer evrak yoksa doğrudan yükleri silme adımına geç
        if (!documents || documents.length === 0) {
          // Silme işlemi (yükler)
          let deleteCount = 0;
          let errorOccurred = false;

          loads.forEach((load) => {
            LoadModel.delete(load.id, (delErr) => {
              if (delErr && !errorOccurred) {
                errorOccurred = true;
                return next(delErr);
              }

              deleteCount++;
              if (deleteCount === loads.length && !errorOccurred) {
                // Bildirim gönder
                NotificationService.notifyPositionDeleted(positionNo, req.session.user.username, loads.length)
                  .catch(err => console.error('[Notification] Position deleted error:', err));
                
                // Pozisyon klasörünü tamamen sil (uploads/25-200-589/)
                const safePosNo = positionNo.replace(/\//g, '-');
                const positionFolder = path.join(positionUploadsRoot, safePosNo);
                try {
                  if (fs.existsSync(positionFolder)) {
                    fs.rmSync(positionFolder, { recursive: true, force: true });
                    console.log('[DeletePosition] Klasör silindi:', positionFolder);
                  }
                } catch (folderErr) {
                  console.error('[DeletePosition] Klasör silme hatası:', folderErr);
                }

                LogModel.create({
                  username: req.session.user.username,
                  role: req.session.user.role,
                  entity: 'position',
                  entity_id: null,
                  entity_id_text: positionNo,
                  action: 'Pozisyon Silindi',
                  field: 'Yük Sayısı',
                  old_value: String(loads.length),
                  new_value: '0',
                  machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
                }, () => {
                  res.redirect('/loads');
                });
              }
            });
          });

          return;
        }

        // Evraklar ve dosyalarını sil
        let docsToDelete = documents.length;
        let docsDeleted = 0;
        let hadDocError = false;

        documents.forEach((doc) => {
          // Olası dosya yolları: per-ihr_poz klasörü, type klasörü (legacy), position folder
          const candidates = [];
          if (ihrPoz) {
            // sanitize folder name (basit)
            const safe = String(ihrPoz).replace(/[^a-z0-9-_\.]/gi, '_').slice(0, 120);
            candidates.push(path.join(uploadsRoot, safe, doc.filename));
          }
          if (doc.type) {
            candidates.push(path.join(uploadsRoot, doc.type, doc.filename));
          }
          // Position folder (uploads/25-200-589/...)
          const safePosNo = positionNo.replace(/\//g, '-');
          candidates.push(path.join(positionUploadsRoot, doc.filename));
          // Legacy: directly under uploads/accounting
          candidates.push(path.join(uploadsRoot, doc.filename));

          // Try delete first existing candidate
          let fileDeleted = false;
          for (const p of candidates) {
            try {
              if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                fileDeleted = true;
                break;
              }
            } catch (fsErr) {
              // log and continue
              console.error('File delete error for', p, fsErr.message);
            }
          }

          // Remove DB record for document
          db.run(`DELETE FROM documents WHERE id = ?`, [doc.id], (delDocErr) => {
            if (delDocErr && !hadDocError) {
              hadDocError = true;
              return next(delDocErr);
            }

            docsDeleted++;
            // Eğer tüm evrak kayıtları ve dosyalar silindiyse, yükleri silme adımına geç
            if (docsDeleted === docsToDelete && !hadDocError) {
              // Silme işlemi (yükler)
              let deleteCount = 0;
              let errorOccurred = false;

              loads.forEach((load) => {
                LoadModel.delete(load.id, (delErr) => {
                  if (delErr && !errorOccurred) {
                    errorOccurred = true;
                    return next(delErr);
                  }

                  deleteCount++;
                  if (deleteCount === loads.length && !errorOccurred) {
                    // Bildirim gönder
                    NotificationService.notifyPositionDeleted(positionNo, req.session.user.username, loads.length)
                      .catch(err => console.error('[Notification] Position deleted error:', err));
                    
                    // Pozisyon klasörünü tamamen sil (uploads/25-200-589/)
                    const safePosNo = positionNo.replace(/\//g, '-');
                    const positionFolder = path.join(positionUploadsRoot, safePosNo);
                    try {
                      if (fs.existsSync(positionFolder)) {
                        fs.rmSync(positionFolder, { recursive: true, force: true });
                        console.log('[DeletePosition] Klasör silindi:', positionFolder);
                      }
                    } catch (folderErr) {
                      console.error('[DeletePosition] Klasör silme hatası:', folderErr);
                    }

                    LogModel.create({
                      username: req.session.user.username,
                      role: req.session.user.role,
                      entity: 'position',
                      entity_id: null,
                      entity_id_text: positionNo,
                      action: 'Pozisyon ve Evraklar Silindi',
                      field: 'Yük Sayısı',
                      old_value: String(loads.length),
                      new_value: '0',
                      machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
                    }, () => {
                      res.redirect('/loads');
                    });
                  }
                });
              });
            }
          });
        });
      });
    });
  },

  // GET /loads/:id/logs → muhasebe log geçmişi
  showLogs(req, res, next) {
    const id = req.params.id;

    LoadModel.getById(id, (err, load) => {
      if (err) return next(err);
      if (!load) {
        return res.status(404).send('Kayıt bulunamadı.');
      }

      LogModel.getByEntity('load', id, (err2, logs) => {
        if (err2) return next(err2);

        res.render('loads/logs', {
          load,
          logs: logs || [],
        });
      });
    });
  },

  // GET /loads/position/:positionNo → all loads for this position
  showPositionLoads(req, res, next) {
    const positionNo = req.params.positionNo;

    LoadModel.getByPositionNo(positionNo, async (err, loads) => {
      if (err) return next(err);

      if (!loads || loads.length === 0) {
        return res.status(404).render('error', {
          message: `Pozisyon ${positionNo} bulunamadı.`,
        });
      }

      try {
        // Kurları çek
        const rates = await RatesService.getTCMBRates();

        // Masrafları ve mühürleri çek
        ExpenseModel.getByPositionNo(positionNo, (err2, expenses) => {
          if (err2) return next(err2);

          // Only list available (unused) seals for selection on a position page
          SealModel.getAvailable((err3, seals) => {
            if (err3) return next(err3);

            const proceed = (sealsList) => {
              // Çekici ve dorse listelerini de çek
              TruckModel.getAll((err4, trucks) => {
                if (err4) return next(err4);

                TrailerModel.getAll((err5, trailers) => {
                  if (err5) return next(err5);

                  // Firma listesini çek
                  CompanyModel.getAll((err6, companies) => {
                    if (err6) return next(err6);

                    // Evrakları çek
                    // Include documents uploaded via position UI (type is NULL or empty) AND driver uploads (type = 'driver_upload').
                    // Accounting uploads have other type values and should not appear in the position's "Evraklar" area.
                    const docSql = `SELECT id, position_no, filename, original_name, category, type, created_at FROM documents WHERE position_no = ? AND (type IS NULL OR trim(type) = '' OR type = 'driver_upload') ORDER BY created_at DESC`;
                    db.all(docSql, [positionNo], (err7, documents) => {
                      if (err7) return next(err7);

                      // Determine a representative load for the position so the header shows
                      // the most meaningful truck/trailer plates. Preference order:
                      // 1) a load with an `ihr_poz` value, 2) a load with plates, 3) first load.
                      let repTruck = '';
                      let repTrailer = '';
                      try {
                        const repLoad = (loads || []).find(l => l && l.ihr_poz) ||
                                        (loads || []).find(l => l && (l.truck_plate || l.trailer_plate)) ||
                                        (loads && loads.length ? loads[0] : null);
                        if (repLoad) {
                          repTruck = repLoad.truck_plate || '';
                          repTrailer = repLoad.trailer_plate || '';
                        }
                      } catch (e) {
                        repTruck = '';
                        repTrailer = '';
                      }

                      // Build unique lists of driver names and truck plates to resolve IDs
                      const driverNames = Array.from(new Set((loads || []).map(l => l.driver_name).filter(Boolean)));
                      const truckPlates = Array.from(new Set((loads || []).map(l => l.truck_plate).filter(Boolean)));

                      const driverMap = {}; // name -> id
                      const truckMap = {};  // plate -> id

                      const finishRender = () => {
                        // also try to get rep truck id/trailer id for header links
                        let repTruckId = null;
                        let repTrailerId = null;
                        if (repTruck) {
                          const t = truckPlates.indexOf(repTruck) >= 0 ? repTruck : repTruck;
                          if (truckMap[repTruck]) repTruckId = truckMap[repTruck];
                        }
                        if (repTrailer) {
                          if (truckMap[repTrailer]) repTrailerId = truckMap[repTrailer];
                        }

                        // Get year from query param
                        const year = req.query.year || res.locals.year || new Date().getFullYear();

                        res.render('loads/position', {
                          positionNo,
                          loads,
                          expenses: expenses || [],
                          seals: sealsList || [],
                          trucks: trucks || [],
                          trailers: trailers || [],
                          companies: companies || [],
                          rates: rates,
                          documents: documents || [],
                          repTruck,
                          repTrailer,
                          repTruckId,
                          repTrailerId,
                          driverMap,
                          truckMap,
                          year
                        });
                      };

                      // If no drivers/trucks to resolve, render immediately
                      if (driverNames.length === 0 && truckPlates.length === 0) {
                        return finishRender();
                      }

                      // Build queries with placeholders
                      const tasks = [];
                      if (driverNames.length > 0) {
                        tasks.push(cb => {
                          const placeholders = driverNames.map(() => '?').join(',');
                          db.all(`SELECT id, name FROM drivers WHERE name IN (${placeholders})`, driverNames, (dErr, dRows) => {
                            if (!dErr && dRows) {
                              dRows.forEach(r => { driverMap[r.name] = r.id; });
                            }
                            cb();
                          });
                        });
                      }
                      if (truckPlates.length > 0) {
                        tasks.push(cb => {
                          const placeholders = truckPlates.map(() => '?').join(',');
                          db.all(`SELECT id, plate FROM trucks WHERE plate IN (${placeholders})`, truckPlates, (tErr, tRows) => {
                            if (!tErr && tRows) {
                              tRows.forEach(r => { truckMap[r.plate] = r.id; });
                            }
                            cb();
                          });
                        });
                      }

                      // run tasks in series
                      (function runTasks(i) {
                        if (i >= tasks.length) return finishRender();
                        tasks[i](() => runTasks(i+1));
                      })(0);
                    });
                  });
                });
              });
            };

            // If there is already a selected seal for the position, make sure it appears
            // in the dropdown even if it was marked used (so it will show as selected).
            const selectedSealCode = loads && loads[0] ? loads[0].seal_code : null;
            if (selectedSealCode) {
              const exists = (seals || []).some(s => String(s.code) === String(selectedSealCode));
              if (!exists) {
                // fetch the seal row and include it at the top of list (so it can be selected)
                SealModel.findByCode(selectedSealCode, (fErr, found) => {
                  if (!fErr && found) {
                    // ensure code property exists and push to front
                    seals = seals || [];
                    seals.unshift(found);
                  }
                  proceed(seals);
                });
                return;
              }
            }

            proceed(seals);
          });
        });
      } catch (error) {
        next(error);
      }
    });
  },

  // POST /loads/position/:positionNo/expenses → Yeni masraf ekle
  addExpense(req, res, next) {
    const positionNo = req.params.positionNo;
    const { expense_type, cost_amount, notes } = req.body;

    const expenseData = {
      position_no: positionNo,
      expense_type,
      cost_amount: parseFloat(cost_amount) || 0,
      cost_currency: 'EUR',
      notes: notes || null
    };

    ExpenseModel.create(expenseData, (err) => {
      if (err) return next(err);
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // POST /loads/position/:positionNo/ihr_poz → kaydet ihr_poz for all loads in position
  savePositionIhrPoz(req, res, next) {
    const positionNo = req.params.positionNo;
    const { ihr_poz } = req.body;

    const sql = `UPDATE loads SET ihr_poz = ? WHERE position_no = ?`;
    db.run(sql, [ihr_poz || null, positionNo], function(err) {
      if (err) return next(err);
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // POST /loads/position/:positionNo/ihr_poz/remove → remove ihr_poz
  removePositionIhrPoz(req, res, next) {
    const positionNo = req.params.positionNo;
    const sql = `UPDATE loads SET ihr_poz = NULL WHERE position_no = ?`;
    db.run(sql, [positionNo], function(err) {
      if (err) return next(err);
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // POST /loads/position/:positionNo/expenses/:expenseId/delete → Masraf sil
  deleteExpense(req, res, next) {
    const positionNo = req.params.positionNo;
    const expenseId = req.params.expenseId;

    ExpenseModel.delete(expenseId, (err) => {
      if (err) return next(err);
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // POST /loads/position/:positionNo/seal → Pozisyondaki tüm yüklere mühür ata
  updatePositionSeal(req, res, next) {
    const positionNo = req.params.positionNo;
    const sealCode = req.body.seal_code;
    const confirmUse = req.body.confirm_mark_seal_used === '1' || req.body.confirm_mark_seal_used === 'true' || req.body.confirm_mark_seal_used === 'on';

    const sqlGet = `SELECT seal_code FROM loads WHERE position_no = ? LIMIT 1`;
    db.get(sqlGet, [positionNo], (err, row) => {
      if (err) return next(err);
      const oldSeal = row ? row.seal_code : null;

      const sql = `UPDATE loads SET seal_code = ? WHERE position_no = ?`;
      db.run(sql, [sealCode, positionNo], function(err2) {
        if (err2) return next(err2);

        // create log only if value changed
        try {
          if ((oldSeal || '') !== (sealCode || '')) {
            LogModel.create({
              username: req.session && req.session.user ? req.session.user.username : null,
              role: req.session && req.session.user ? req.session.user.role : null,
              entity: 'position',
              entity_id: positionNo,
              action: 'update_field',
              field: 'seal_code',
              old_value: oldSeal,
              new_value: sealCode
            });
          }
        } catch (e) { console.error('Log create error (seal):', e); }

        // If the user explicitly confirmed that the selected seal should be consumed,
        // mark it as used in the seals table so it cannot be selected for other positions.
        if (confirmUse && sealCode) {
          try {
            SealModel.markAsUsed(sealCode, positionNo, (mErr) => {
              if (mErr) {
                console.error('Seal markAsUsed error:', mErr);
                return next(mErr);
              }
              return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
            });
            return; // markAsUsed will handle redirect/callback
          } catch (e) {
            console.error('Seal markAsUsed exception:', e);
            return next(e);
          }
        }

        res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
      });
    });
  },

  // POST /loads/position/:positionNo/mrn → MRN NO kaydet
  updatePositionMrn(req, res, next) {
    const positionNo = req.params.positionNo;
    const mrnNo = req.body.mrn_no;

    const sqlGet = `SELECT mrn_no FROM loads WHERE position_no = ? LIMIT 1`;
    db.get(sqlGet, [positionNo], (err, row) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      const oldMrn = row ? row.mrn_no : null;

      const sql = `UPDATE loads SET mrn_no = ? WHERE position_no = ?`;
      db.run(sql, [mrnNo, positionNo], function(err2) {
        if (err2) {
          return res.status(500).json({ success: false, error: err2.message });
        }

        try {
          if ((oldMrn || '') !== (mrnNo || '')) {
            LogModel.create({
              username: req.session && req.session.user ? req.session.user.username : null,
              role: req.session && req.session.user ? req.session.user.role : null,
              entity: 'position',
              entity_id: positionNo,
              action: 'update_field',
              field: 'mrn_no',
              old_value: oldMrn,
              new_value: mrnNo
            });
          }
        } catch (e) { console.error('Log create error (mrn):', e); }

        res.json({ success: true });
      });
    });
  },

  // POST /loads/position/:positionNo/update-vehicle → Araç bilgilerini güncelle
  updatePositionVehicle(req, res, next) {
    const positionNo = req.params.positionNo;
    const { truck_plate, trailer_plate, driver_name, loading_date, unloading_date } = req.body;

    let updates = [];
    let values = [];

    if (truck_plate !== undefined) {
      updates.push('truck_plate = ?');
      values.push(truck_plate);
    }
    if (trailer_plate !== undefined) {
      updates.push('trailer_plate = ?');
      values.push(trailer_plate);
    }
    if (driver_name !== undefined) {
      updates.push('driver_name = ?');
      values.push(driver_name);
    }
    if (loading_date !== undefined) {
      updates.push('loading_date = ?');
      values.push(loading_date);
    }
    if (unloading_date !== undefined) {
      updates.push('unloading_date = ?');
      values.push(unloading_date);
    }

    if (updates.length === 0) {
      return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    }

    values.push(positionNo);

    // fetch old values for logging
    const sqlGet = `SELECT truck_plate, trailer_plate, driver_name, loading_date, unloading_date FROM loads WHERE position_no = ? LIMIT 1`;
    db.get(sqlGet, [positionNo], (err, oldRow) => {
      if (err) return next(err);

      const sql = `UPDATE loads SET ${updates.join(', ')} WHERE position_no = ?`;
      db.run(sql, values, function(err2) {
        if (err2) return next(err2);

        // create logs for each changed field
        try {
          if (oldRow) {
            const fieldsToCheck = ['truck_plate', 'trailer_plate', 'driver_name', 'loading_date', 'unloading_date'];
            fieldsToCheck.forEach(f => {
              const newVal = req.body[f] !== undefined ? req.body[f] : oldRow[f];
              const oldVal = oldRow[f];
              if ((oldVal || '') !== (newVal || '')) {
                LogModel.create({
                  username: req.session && req.session.user ? req.session.user.username : null,
                  role: req.session && req.session.user ? req.session.user.role : null,
                  entity: 'position',
                  entity_id: positionNo,
                  action: 'update_field',
                  field: f,
                  old_value: oldVal,
                  new_value: newVal
                });
              }
            });
          }
        } catch (e) { console.error('Log create error (vehicle):', e); }

        res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
      });
    });
  },

  // POST /loads/position/:positionNo/update-dates → Tarih bilgilerini güncelle
  updatePositionDates(req, res, next) {
    const positionNo = req.params.positionNo;
    const { loading_date, arrival_date } = req.body;

    let updates = [];
    let values = [];

    if (loading_date !== undefined) {
      updates.push('loading_date = ?');
      values.push(loading_date);
    }
    if (arrival_date !== undefined) {
      updates.push('arrival_date = ?');
      values.push(arrival_date);
    }

    if (updates.length === 0) {
      return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    }

    values.push(positionNo);
    const sql = `UPDATE loads SET ${updates.join(', ')} WHERE position_no = ?`;
    
    db.run(sql, values, function(err) {
      if (err) return next(err);
      res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
    });
  },

  // POST /loads/add-company → Yeni firma ekle (Gönderici veya Alıcı)
  addCompany(req, res, next) {
    const { name, type } = req.body; // type: 'sender' or 'receiver'
    
    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'Firma adı ve tipi gerekli' });
    }

    if (!['sender', 'receiver'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Geçersiz tip' });
    }

    CompanyModel.addCompany(name.trim(), type, (err, result) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ success: false, error: 'Bu firma zaten mevcut' });
        }
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, company: result });
    });
  },

  // POST /loads/add-invoice-company → Yeni fatura firması ekle
  addInvoiceCompany(req, res, next) {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Firma adı gerekli' });
    }

    InvoiceCompanyModel.addCompany(name.trim(), (err, result) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ success: false, error: 'Bu firma zaten mevcut' });
        }
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, company: result });
    });
  },

  // POST /loads/delete-company → Firma sil
  deleteCompany(req, res, next) {
    const { companyName } = req.body;
    
    if (!companyName) {
      return res.status(400).json({ success: false, message: 'Firma adı gerekli' });
    }

    CompanyModel.deleteCompany(companyName.trim(), (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.json({ success: true, message: 'Şirket silindi' });
    });
  },

  // SEND MAIL WITH NODEMAILER (Yandex) - Otomatik alıcı belirleme ile
  async sendMailOutlook(req, res) {
    try {
      const { customer, date, subject, positionNo, sender, consignee, packages, goods, weight, truck, customs, exitDate, arrivalDate, recipientEmail, to, cc } = req.body;

      // normalize `customs` for email output: when the unloading city is Supalan
      // or mentions 'Serbest bölge', do not include the trailing "Antrepo" suffix
      // even if client-side JS appended it.
      let customsVal = (customs || '').toString().trim();
      try {
        if (/supalan/i.test(customsVal) || /serbest\s*b[oö]lge/i.test(customsVal)) {
          customsVal = customsVal.replace(/\s*Antrepo$/i, '').trim();
        }
      } catch (e) {
        // if anything goes wrong, fall back to raw customs
        customsVal = (customs || '').toString().trim();
      }

      const nodemailer = require('nodemailer');

      // Yandex SMTP ayarları
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST || 'smtp.yandex.com',
        port: parseInt(process.env.MAIL_PORT) || 465,
        secure: process.env.MAIL_SECURE === 'true' || true, // SSL için true
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASSWORD
        }
      });

      // Build To/CC lists. Priority: explicit `to`/`cc` in request, otherwise DB mapping by consignee.
      let toList = [];
      let ccList = [];

      // If client provided `to` or `cc` use them (accept array or comma string)
      const normalizeList = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v.map(s => (s||'').trim()).filter(Boolean);
        return String(v).split(',').map(s => s.trim()).filter(Boolean);
      };

      if (to) toList = normalizeList(to);
      if (cc) ccList = normalizeList(cc);

      // If no explicit lists, try to resolve from DB by consignee
      if ((!toList || toList.length === 0) && consignee) {
        await new Promise((resolve) => {
          MailRecipientModel.getByAliciAdiFull(consignee, (err, rows) => {
            if (err) {
              console.error('Mail alıcı sorgusu hatası:', err);
              return resolve();
            }
            if (rows && rows.length) {
              rows.forEach(r => {
                if (r.is_active === 1) {
                  const t = (r.recipient_type || 'to').toString().toLowerCase();
                  if (t === 'cc') ccList.push(r.email);
                  else toList.push(r.email);
                }
              });
              console.log(`Alıcı "${consignee}" için veritabanından mail bulundu: to=${toList.join(',')}, cc=${ccList.join(',')}`);
            }
            resolve();
          });
        });
      }

      // Do not inject any hardcoded default CC addresses here.
      // ccList remains as resolved from DB or provided by the client.

      // final validation: need at least one To recipient
      if (!toList || toList.length === 0) {
        console.error('Mail alıcısı (To) belirlenemedi!');
        return res.status(400).json({ success: false, error: 'Mail alıcısı belirlenemedi. Lütfen alıcıyı manuel girin veya Mail Data sayfasından alıcıyı tanımlayın.' });
      }

      // HTML mail içeriği (modern, inline-styled, Outlook-friendly)
      const mode = (req.body.mode || 'yukleme').toString().toLowerCase();
      const headerTitle = mode === 'varis' ? 'VARIŞ BİLGİSİ' : 'YÜKLEME BİLGİSİ';
      const introText = mode === 'varis' ? 'Lütfen Antrepo Beyannamesinin acil açılmasını rica ederim.' : "İngiltere'den adınıza alınan sevkiyata ait yükleme bilgileri aşağıda bilginize sunulmuştur.";
      const gateLine = mode === 'varis' ? 'Giriş Kapısı - Kapıkule' : '';

      // server-side Varış HTML to match attachment (blue header, red intro, detail lines)
      const ambarCode = req.body.ambar_code || '';
      const antrepoCode = req.body.antrepo_code || '';
      const guarantee = req.body.guarantee_no || '';

      const htmlBody = `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0; padding:0; background:#ffffff; font-family: Arial, Helvetica, sans-serif;">
  <table width="100%" style="width:100%; background:transparent; padding:18px 0;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:1200px; background:#ffffff; border:1px solid #cfeafc; margin:0; border-radius:6px; overflow:hidden;">
          <tr>
            <td style="background:#38a7e6; text-align:center; padding:14px 8px; border-bottom:4px solid rgba(255,255,255,0.15);">
              <div style="font-size:28px; font-weight:800; color:#ffffff;">${headerTitle}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 14px 6px 14px;">
              <table width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="width:22%; padding:10px; background:#dbefff; font-weight:700; border:1px solid #d0e9fb;">Kime</td>
                  <td style="width:28%; padding:10px; border:1px solid #e9f6ff;">${customer}</td>
                  <td style="width:22%; padding:10px; background:#dbefff; font-weight:700; border:1px solid #d0e9fb;">Tarih</td>
                  <td style="width:28%; padding:10px; border:1px solid #e9f6ff;">${date}</td>
                </tr>
                <tr>
                  <td style="padding:10px; background:#dbefff; font-weight:700; border:1px solid #d0e9fb;">Konu</td>
                  <td style="padding:10px; border:1px solid #e9f6ff;">${subject}</td>
                  <td style="padding:10px; background:#dbefff; font-weight:700; border:1px solid #d0e9fb;">Pozisyon No</td>
                  <td style="padding:10px; border:1px solid #e9f6ff;">${positionNo}</td>
                </tr>
                <!-- Ref removed from body; will be appended to subject when available -->
              </table>

              <div style="height:10px"></div>

              <div style="color:${mode === 'varis' ? '#ff0000' : '#374151'}; font-weight:700; font-size:14px; margin:8px 0;">${introText}${gateLine ? '<br>' + gateLine : ''}</div>

              <table width="100%" style="border-collapse:collapse; margin-top:6px;">
                <tr>
                  <td style="width:28%; padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Gönderen</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${sender}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Alıcı</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${consignee}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Kap Adedi</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${packages}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Malzeme Cinsi</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${goods}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Brüt Ağırlık</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${weight}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Araç Plakası</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${truck}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Varış Gümrüğü</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${customsVal}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Çıkış Tarihi</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">${exitDate}</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Varış Tarihi</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">__ARRIVAL_RANGE__</td>
                </tr>
                <tr>
                  <td style="padding:12px; background:#e6f6ff; font-weight:700; border:1px solid #dbeff6;">Malla Gelen Evraklar</td>
                  <td style="padding:12px; border:1px solid #eaf8ff;">Fatura</td>
                </tr>
              </table>

            </td>
          </tr>
          <tr>
            <td style="padding:12px 14px; color:#333; font-size:13px;">
              <p style="margin:0 0 8px 0;">Saygılarımla,</p>
              <p style="margin:0 0 12px 0; font-weight:bold; color:#1e40af;">BEST OPERASYON</p>
              <p style="margin:0; font-weight:bold;">BEST ULUSLARARASI NAKLIYAT VE TIC.LTD.STI.</p>
              <p style="margin:0;">Ikitelli O.S.B, Hurriyet Bulvari</p>
              <p style="margin:0;">Deparko Sanayi Sitesi No:1/22/1</p>
              <p style="margin:0;">Basaksehir – 34490</p>
              <p style="margin:0 0 8px 0;">ISTANBUL – TURKIYE</p>
              <p style="margin:0;">Tel: 0212 – 671 1515</p>
              <p style="margin:0;">Fax: 0212 – 671 1525</p>
              <p style="margin:0;">Cep: 0530 – 875 83 08 / 0530 - 875 83 06</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      // Build subject server-side from position data
      // Desired format: "Gönderici Adı - Alıcı adı - İngiltere Yüklemesi - X Kap - X KG, BST UID"
      let builtSubject = '';
      try {
        // mapping: Gönderici Adı = sender, Alıcı adı = consignee
        const senderName = (sender || '').toString().trim(); // customer_name in DB
        const consigneeName = (consignee || customer || '').toString().trim(); // consignee_name in DB

        // normalize packages and weight (strip non-numeric except dot and comma)
        const rawPackages = (packages || '').toString();
        const rawWeight = (weight || '').toString();
        const cleanPackages = rawPackages.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
        const cleanWeight = rawWeight.replace(/[^0-9.,]/g, '').replace(/,/g, '.');

        // try to get UID: prefer req.body.uid, otherwise try to find a matching load by position
        let uidVal = req.body.uid || req.body.uidPos || null;
        if (!uidVal && positionNo) {
          // If there's only one load for the position, prefer its uid
          await new Promise(resolve => {
            LoadModel.getByPositionNo(positionNo, (err, rows) => {
              if (!err && rows && rows.length === 1) {
                uidVal = rows[0].uid || rows[0].uid4 || null;
              } else if (!err && rows && rows.length > 1) {
                // try to match by sender/consignee/packages/weight
                for (const r of rows) {
                  const pkgMatch = String(r.packages || '').replace(/[^0-9.,]/g, '') === cleanPackages;
                  const wMatch = String(r.gross_weight || '').replace(/[^0-9.,]/g, '') === cleanWeight;
                  const senderMatch = (r.customer_name || '').toString().trim() === senderName;
                  const consigneeMatch = (r.consignee_name || '').toString().trim() === consigneeName;
                  if ((pkgMatch && wMatch) || (senderMatch && consigneeMatch)) {
                    uidVal = r.uid || null;
                    break;
                  }
                }
              }
              resolve();
            });
          });
        }

        if (!uidVal) uidVal = positionNo || '';

        // final format per request: Gönderici Adı - Alıcı adı  İNGİLTERE YÜKLEMESİ -  X KAP - X KG, BSTUID
        builtSubject = `${senderName || '-'} - ${consigneeName || '-'}  İNGİLTERE YÜKLEMESİ - ${cleanPackages || '-'} KAP - ${cleanWeight || '-'} KG - BST${uidVal}`;
      } catch (e) {
        console.error('Subject build error:', e);
        builtSubject = subject || (`${positionNo || ''}`);
      }

      // Determine `ref` value(s): prefer explicit `req.body.ref`, otherwise do NOT fall back
      // to other loads' refs. Each load row should use only its own ref.
      // The frontend explicitly sends the specific load's ref (even if empty string).
      let refVal = (req.body.ref || '').toString().trim();
      // NOT falling back to other loads' refs anymore - each row uses its own ref only

      // Compute arrival date range from loading_date (loading_date +7 .. +10 days).
      // Prefer explicit req.body.loading_date, otherwise fall back to exitDate.
      let arrivalRange = '';
      const loadingRaw = (req.body.loading_date || exitDate || '').toString().trim();
      const parseYmd = (s) => {
        if (!s) return null;
        // Accept common formats: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY
        const ymdMatch = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(s);
        if (ymdMatch) {
          const Y = parseInt(ymdMatch[1], 10);
          const M = parseInt(ymdMatch[2], 10) - 1;
          const D = parseInt(ymdMatch[3], 10);
          const d = new Date(Y, M, D);
          return isNaN(d.getTime()) ? null : d;
        }
        const dmyDot = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(s);
        if (dmyDot) {
          const D = parseInt(dmyDot[1], 10);
          const M = parseInt(dmyDot[2], 10) - 1;
          const Y = parseInt(dmyDot[3], 10);
          const d = new Date(Y, M, D);
          return isNaN(d.getTime()) ? null : d;
        }
        const dmySlash = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(s);
        if (dmySlash) {
          const D = parseInt(dmySlash[1], 10);
          const M = parseInt(dmySlash[2], 10) - 1;
          const Y = parseInt(dmySlash[3], 10);
          const d = new Date(Y, M, D);
          return isNaN(d.getTime()) ? null : d;
        }
        // Fallback to Date constructor for other ISO-like inputs
        const fallback = new Date(s);
        return isNaN(fallback.getTime()) ? null : fallback;
      };
      const loadingDt = parseYmd(loadingRaw);
      if (loadingDt) {
        const from = new Date(loadingDt);
        from.setDate(from.getDate() + 7);
        const to = new Date(loadingDt);
        to.setDate(to.getDate() + 10);
        const fmt = (dd) => {
          const D = String(dd.getDate()).padStart(2, '0');
          const M = String(dd.getMonth() + 1).padStart(2, '0');
          const Y = dd.getFullYear();
          return `${D}.${M}.${Y}`;
        };
        arrivalRange = `${fmt(from)} - ${fmt(to)}`;
      } else {
        arrivalRange = arrivalDate || '';
      }

      // final HTML body (replace placeholder)
      let finalHtmlBody = (htmlBody || '').replace('__ARRIVAL_RANGE__', arrivalRange || '');

      // If we have a ref value, append it to the subject (at the very end)
      if (refVal) {
        builtSubject = `${builtSubject} - REF: ${refVal}`;
      }

      // Mail gönder (attachements varsa ekle)
      const mailOptions = {
        from: process.env.MAIL_USER,
        to: toList.join(','),
        cc: ccList && ccList.length ? ccList.join(',') : undefined,
        subject: builtSubject,
        html: finalHtmlBody
      };

      // attachments: either files uploaded in this request (req.files) OR existing docs selected by client
      mailOptions.attachments = mailOptions.attachments || [];
      try {
        // 1) If client passed selected_docs (JSON array of document IDs), resolve them from DB and attach
        if (req.body && req.body.selected_docs) {
          let ids = [];
          try { ids = JSON.parse(req.body.selected_docs); } catch (e) { ids = Array.isArray(req.body.selected_docs) ? req.body.selected_docs : []; }
          if (ids && ids.length) {
            // sanitize and build placeholders
            const placeholders = ids.map(() => '?').join(',');
            const sql = `SELECT * FROM documents WHERE id IN (${placeholders})`;
            await new Promise((resolve) => {
              db.all(sql, ids, (err, rows) => {
                if (err) { console.error('Error fetching selected docs:', err); return resolve(); }
                const fs = require('fs');
                const path = require('path');
                (rows || []).forEach(r => {
                  try {
                    const abs = path.join(__dirname, '../../uploads', r.filename);
                    if (fs.existsSync(abs)) {
                      mailOptions.attachments.push({ filename: r.original_name || path.basename(r.filename), path: abs });
                    } else {
                      console.warn('Selected document file missing on disk:', abs);
                    }
                  } catch (e) { console.warn('Attach selected doc error', e); }
                });
                resolve();
              });
            });
          }
        }

        // 2) Also include any files uploaded in this request via multer
        const files = req.files || [];
        if (files && files.length) {
          files.forEach(f => {
            mailOptions.attachments.push({ filename: f.originalname || f.filename, path: f.path, contentType: f.mimetype });
          });
        }
      } catch (e) {
        console.warn('Attachment handling error:', e);
      }

      const info = await transporter.sendMail(mailOptions);
      console.log('Mail gönderildi:', info.messageId, 'TO:', (toList || []).join(','), 'CC:', (ccList || []).join(','), 'Attachments:', (mailOptions.attachments || []).length);

      // cleanup temp files created by multer
      try {
        const fs = require('fs');
        (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      } catch (e) {}

      res.json({ success: true, messageId: info.messageId, to: (toList || []).join(','), cc: (ccList || []).join(',') });
    } catch (error) {
      console.error('Mail gönderme hatası:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // SEND MAIL WITH OUTLOOK (Windows COM) - ESKİ
  sendMailOutlookOLD(req, res) {
    try {
      const { customer, date, subject, positionNo, sender, consignee, packages, goods, weight, truck, customs, exitDate, arrivalDate } = req.body;

      const htmlBody = `<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000;">
  <p style="font-size: 12pt; font-weight: bold; margin-bottom: 15px;">YÜKLEME BİLGİSİ</p>
  
  <table style="border-collapse: collapse; width: 100%; max-width: 700px; margin-bottom: 10px;">
    <tr>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold; width: 25%;">Kime</td>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #FFFFFF;">${customer}</td>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold; width: 25%;">Tarih</td>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #FFFFFF;">${date}</td>
    </tr>
    <tr>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Konu</td>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #FFFFFF;">${subject}</td>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Pozisyon No</td>
      <td style="padding: 6px 10px; border: 1px solid #000000; background-color: #FFFFFF;">${positionNo}</td>
    </tr>
  </table>

  <p style="margin: 15px 0; font-size: 10pt; font-style: italic; color: #1e3a8a;">İngiltere'den adınıza alınan sevkiyata ait yükleme bilgileri aşağıda bilginize sunulmuştur.</p>

  <table style="border-collapse: collapse; width: 100%; max-width: 700px;">
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold; width: 30%;">Gönderen</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${sender}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Alıcı</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${consignee}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Kap Adedi</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${packages}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Malzeme Cinsi</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${goods}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Brüt Ağırlık</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${weight}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Araç Plakası</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${truck}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Varış Gümrüğü</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${customs}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Çıkış Tarihi</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${exitDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Varış Tarihi</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">${arrivalDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #DBEAFE; font-weight: bold;">Malla Gelen Evraklar</td>
      <td style="padding: 8px 12px; border: 1px solid #000000; background-color: #FFFFFF;">Fatura</td>
    </tr>
  </table>

  <div style="margin-top: 20px; font-size: 10pt; color: #333;">
    <p style="margin:0 0 8px 0;">Saygılarımla,</p>
    <p style="margin:0 0 12px 0; font-weight:bold; color:#1e40af;">BEST OPERASYON</p>
    <p style="margin:0; font-weight:bold;">BEST ULUSLARARASI NAKLIYAT VE TIC.LTD.STI.</p>
    <p style="margin:0;">Ikitelli O.S.B, Hurriyet Bulvari</p>
    <p style="margin:0;">Deparko Sanayi Sitesi No:1/22/1</p>
    <p style="margin:0;">Basaksehir – 34490</p>
    <p style="margin:0 0 8px 0;">ISTANBUL – TURKIYE</p>
    <p style="margin:0;">Tel: 0212 – 671 1515</p>
    <p style="margin:0;">Fax: 0212 – 671 1525</p>
    <p style="margin:0;">Cep: 0530 – 875 83 08 / 0530 875 83 06</p>
  </div>
</body>
</html>`;

      // Node.js child_process ile PowerShell çalıştır
      const { exec } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      // Geçici HTML dosyası oluştur
      const tempFile = path.join(os.tmpdir(), `mail_${Date.now()}.html`);
      fs.writeFileSync(tempFile, htmlBody, 'utf8');

      // PowerShell scripti - daha basit ve güvenli
      const psCommand = `
$outlook = New-Object -ComObject Outlook.Application;
$mail = $outlook.CreateItem(0);
$mail.Subject = '${subject.replace(/'/g, "''")}';
$mail.HTMLBody = Get-Content '${tempFile.replace(/\\/g, '\\\\')}' -Raw -Encoding UTF8;
$mail.Display();
Remove-Item '${tempFile.replace(/\\/g, '\\\\')}' -Force;
      `.trim();

      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, (error, stdout, stderr) => {
        if (error) {
          console.error('Outlook açma hatası:', error);
          console.error('stderr:', stderr);
          // Temp dosyayı temizle
          try { fs.unlinkSync(tempFile); } catch (e) {}
          return res.status(500).json({ success: false, error: 'Outlook açılamadı: ' + error.message });
        }
        res.json({ success: true });
      });

    } catch (error) {
      console.error('Mail oluşturma hatası:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // SEND MAIL
  sendMail(req, res) {
    try {
      const { customer, date, subject, positionNo, sender, consignee, packages, goods, weight, truck, customs, exitDate, arrivalDate } = req.body;

      const htmlBody = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000; line-height: 1.4; margin: 0; padding: 20px; background: #ffffff; }
  table { border-collapse: collapse; width: 100%; max-width: 700px; }
  .header-table { margin-bottom: 10px; }
  .header-table td { padding: 6px 10px; border: 1px solid #000000; font-size: 10pt; }
  .header-label { background-color: #DBEAFE; font-weight: bold; width: 25%; }
  .header-value { background-color: #FFFFFF; }
  .intro-text { margin: 15px 0; font-size: 10pt; font-style: italic; color: #1e3a8a; }
  .info-table { margin-top: 10px; }
  .info-table td { padding: 8px 12px; border: 1px solid #000000; font-size: 10pt; }
  .info-label { background-color: #DBEAFE; font-weight: bold; width: 30%; }
  .info-value { background-color: #FFFFFF; }
  .signature { margin-top: 20px; font-size: 10pt; }
</style>
</head>
<body>
  <p style="font-size: 12pt; font-weight: bold; margin-bottom: 15px;">YÜKLEME BİLGİSİ</p>
  
  <table class="header-table">
    <tr>
      <td class="header-label">Kime</td>
      <td class="header-value">${customer}</td>
      <td class="header-label">Tarih</td>
      <td class="header-value">${date}</td>
    </tr>
    <tr>
      <td class="header-label">Konu</td>
      <td class="header-value">${subject}</td>
      <td class="header-label">Pozisyon No</td>
      <td class="header-value">${positionNo}</td>
    </tr>
  </table>

  <div class="intro-text">
    İngiltere'den adınıza alınan sevkiyata ait yükleme bilgileri aşağıda bilginize sunulmuştur.
  </div>

  <table class="info-table">
    <tr>
      <td class="info-label">Gönderen</td>
      <td class="info-value">${sender}</td>
    </tr>
    <tr>
      <td class="info-label">Alıcı</td>
      <td class="info-value">${consignee}</td>
    </tr>
    <tr>
      <td class="info-label">Kap Adedi</td>
      <td class="info-value">${packages}</td>
    </tr>
    <tr>
      <td class="info-label">Malzeme Cinsi</td>
      <td class="info-value">${goods}</td>
    </tr>
    <tr>
      <td class="info-label">Brüt Ağırlık</td>
      <td class="info-value">${weight}</td>
    </tr>
    <tr>
      <td class="info-label">Araç Plakası</td>
      <td class="info-value">${truck}</td>
    </tr>
    <tr>
      <td class="info-label">Varış Gümrüğü</td>
      <td class="info-value">${customs}</td>
    </tr>
    <tr>
      <td class="info-label">Çıkış Tarihi</td>
      <td class="info-value">${exitDate}</td>
    </tr>
    <tr>
      <td class="info-label">Varış Tarihi</td>
      <td class="info-value">${arrivalDate}</td>
    </tr>
    <tr>
      <td class="info-label">Malla Gelen Evraklar</td>
      <td class="info-value">Fatura</td>
    </tr>
  </table>

  <div class="signature" style="margin-top: 20px; font-size: 10pt; color: #333;">
    <p style="margin:0 0 8px 0;">Saygılarımla,</p>
    <p style="margin:0 0 12px 0; font-weight:bold; color:#1e40af;">BEST OPERASYON</p>
    <p style="margin:0; font-weight:bold;">BEST ULUSLARARASI NAKLIYAT VE TIC.LTD.STI.</p>
    <p style="margin:0;">Ikitelli O.S.B, Hurriyet Bulvari</p>
    <p style="margin:0;">Deparko Sanayi Sitesi No:1/22/1</p>
    <p style="margin:0;">Basaksehir – 34490</p>
    <p style="margin:0 0 8px 0;">ISTANBUL – TURKIYE</p>
    <p style="margin:0;">Tel: 0212 – 671 1515</p>
    <p style="margin:0;">Fax: 0212 – 671 1525</p>
    <p style="margin:0;">Cep: 0530 – 875 83 08 / 0530 875 83 06</p>
  </div>
</body>
</html>`;

      res.json({ success: true, html: htmlBody });
    } catch (error) {
      console.error('Mail gönderme hatası:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // GET /loads/:id - Position sayfasına yönlendir
  redirectToPosition(req, res, next) {
    const loadId = req.params.id;
    
    LoadModel.getById(loadId, (err, load) => {
      if (err) return next(err);
      if (!load) return res.status(404).send('Kayıt bulunamadı');
      
      const positionNo = load.position_no || '';
      if (positionNo) {
        res.redirect(`/loads/position/${encodeURIComponent(positionNo)}`);
      } else {
        res.redirect('/loads');
      }
    });
  },

  // POST /loads/position/:positionNo/upload-document - Evrak yükle
  uploadDocument(req, res, next) {
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs');
    
    const positionNo = req.params.positionNo;
    
    // Pozisyon numarasındaki / karakterini - ile değiştir (dosya sistemi için)
    const safePosNo = positionNo.replace(/\//g, '-');
    
    // Multer konfigürasyonu - array ile multiple file upload
    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        // Kategori bilgisi body'den alınacak, ama bu aşamada henüz parse edilmemiş
        // Bu yüzden geçici olarak pozisyon klasörüne kaydedip sonra taşıyacağız
        const tempDir = path.join(__dirname, '../../uploads', safePosNo, 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
      },
      filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
      }
    });
    
    const maxUploadMb = parseInt(process.env.MAX_UPLOAD_MB, 10) || 50;
    const upload = multer({ 
      storage: storage,
      limits: { fileSize: maxUploadMb * 1024 * 1024 } // MB -> bytes
    }).array('document', 10); // up to 10 files
    
    upload(req, res, function (err) {
      if (err) {
        console.error('Upload error:', err);
        // If Multer produced a file-size error, return a clear JSON response for the frontend
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, message: 'Dosya çok büyük. İzin verilen maksimum dosya boyutunu aşmaktadır.' });
          }
          return res.status(400).json({ success: false, message: 'Dosya yükleme hatası: ' + err.message });
        }
        // Generic error
        return res.status(500).json({ success: false, message: 'Dosya yükleme sırasında sunucu hatası oluştu.' });
      }
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'Dosya seçilmedi' });
      }
      
      // Şimdi kategori bilgisini alabiliriz
      const category = req.body.category || 'Evraklar';
      const safeCategory = category.replace(/\//g, '-');
      
      // Kategori klasörünü oluştur
      const categoryDir = path.join(__dirname, '../../uploads', safePosNo, safeCategory);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }
      
      // Helper: Multer'ın Latin-1 olarak decode ettiği dosya adını UTF-8'e çevir
      function fixFilename(filename) {
        try {
          // Latin-1 -> Buffer -> UTF-8
          return Buffer.from(filename, 'latin1').toString('utf8');
        } catch (e) {
          return filename;
        }
      }
      
      // Dosyaları temp'ten kategori klasörüne taşı ve veritabanına kaydet
      let savedCount = 0;
      req.files.forEach((file, index) => {
        const tempPath = file.path;
        const newPath = path.join(categoryDir, file.filename);
        
        // Dosyayı taşı (cross-device için copyFile + unlink kullan)
        try {
          fs.renameSync(tempPath, newPath);
        } catch (renameErr) {
          if (renameErr.code === 'EXDEV') {
            fs.copyFileSync(tempPath, newPath);
            fs.unlinkSync(tempPath);
          } else {
            throw renameErr;
          }
        }
        
        // Dosya adını UTF-8'e düzelt
        const originalName = fixFilename(file.originalname);
        
        const filePathInDb = `${safePosNo}/${safeCategory}/${file.filename}`;
        const sql = `INSERT INTO documents (position_no, filename, original_name, category, created_at) VALUES (?, ?, ?, ?, datetime('now'))`;
        db.run(sql, [positionNo, filePathInDb, originalName, category], function(err) {
          if (err) {
            console.error('Document save error:', err);
          } else {
            savedCount++;
            // Log document upload for this position
            try {
              const insertedId = this.lastID;
              LogModel.create({
                username: req.session && req.session.user ? req.session.user.username : null,
                role: req.session && req.session.user ? req.session.user.role : null,
                entity: 'position',
                entity_id: positionNo,
                action: 'upload_document',
                field: 'documents',
                old_value: null,
                new_value: JSON.stringify({ id: insertedId, filename: filePathInDb, original_name: originalName, category })
              });
            } catch (e) { console.error('Log create error (upload document):', e); }
          }
          
          // Son dosya da kaydedildiyse response gönder
          if (index === req.files.length - 1) {
            // Temp klasörünü temizle
            const tempDir = path.join(__dirname, '../../uploads', safePosNo, 'temp');
            if (fs.existsSync(tempDir)) {
              try {
                fs.rmdirSync(tempDir);
              } catch (e) {
                // Klasör boş değilse sorun değil
              }
            }
            
            if (savedCount > 0) {
              res.json({ success: true, message: `${savedCount} dosya yüklendi` });
            } else {
              res.status(500).json({ success: false, message: 'Kayıt yapılamadı' });
            }
          }
        });
      });
    });
  },

  // GET /loads/position/:positionNo/files - list uploaded files for a position
  showPositionFiles(req, res, next) {
    try {
      const positionNo = req.params.positionNo;
      const safePosNo = (positionNo || '').replace(/\//g, '-');
      const categoryFilter = req.query.category || null;
      // Get documents from DB for this position
      // Include documents uploaded via position UI (no type) AND driver uploads (type = 'driver_upload').
      // Exclude accounting-uploaded files which set other type values.
      const sql = `SELECT id, position_no, filename, original_name, category, type, created_at FROM documents WHERE position_no = ? AND (type IS NULL OR trim(type) = '' OR type = 'driver_upload') ORDER BY created_at DESC`;
      db.all(sql, [positionNo], (err, rows) => {
        if (err) return next(err);

        // If a category filter was passed, filter rows
        const docs = (rows || []).filter(r => {
          if (!categoryFilter) return true;
          return (r.category || '') === categoryFilter;
        }).map(r => {
          // Build public URL served by static /uploads
          const publicUrl = '/uploads/' + encodeURIComponent(safePosNo) + '/' + encodeURIComponent((r.category || '').replace(/\//g, '-')) + '/' + encodeURIComponent(path.basename(r.filename));
          return {
            id: r.id,
            original_name: r.original_name,
            filename: r.filename,
            category: r.category,
            created_at: r.created_at,
            url: publicUrl
          };
        });

        // Render a simple files listing view
        return res.render('loads/files', { positionNo, safePosNo, docs, category: categoryFilter });
      });
    } catch (e) {
      return next(e);
    }
  },

  // GET /loads/position/:positionNo/open-folder - Sunucu dosya tarayıcısı
  openParentFolder(req, res, next) {
    const path = require('path');
    const fs = require('fs');
    
    const positionNo = req.params.positionNo;
    const safePosNo = (positionNo || '').replace(/\//g, '-');
    const parentPath = path.join(__dirname, '../../uploads', safePosNo);
    
    // Klasör yoksa oluştur
    if (!fs.existsSync(parentPath)) {
      fs.mkdirSync(parentPath, { recursive: true });
    }
    
    // Sabit kategori klasörleri - gerçek isim ve güvenli klasör ismi
    const categoryFolders = [
      { name: 'Evraklar', safeName: 'Evraklar' },
      { name: 'CMR', safeName: 'CMR' },
      { name: 'Navlun', safeName: 'Navlun' },
      { name: 'T1/GMR', safeName: 'T1-GMR' }
    ];
    
    // Veritabanından kategori bazlı dosya sayılarını al - include driver_upload type
    const sql = `SELECT category, COUNT(*) as count FROM documents WHERE position_no = ? AND (type IS NULL OR trim(type) = '' OR type = 'driver_upload') GROUP BY category`;
    
    db.all(sql, [positionNo], (err, dbCounts) => {
      if (err) {
        console.error('DB count error:', err);
        dbCounts = [];
      }
      
      // Kategori sayılarını map'e çevir
      const countMap = {};
      (dbCounts || []).forEach(row => {
        countMap[row.category] = row.count;
      });
      
      // Alt klasörleri ve dosyaları oku
      const subfolders = [];
      const parentFiles = [];
      
      try {
        const items = fs.readdirSync(parentPath);
        
        for (const item of items) {
          const itemPath = path.join(parentPath, item);
          const stats = fs.statSync(itemPath);
          
          if (stats.isDirectory()) {
            // Bu klasör hangi kategoriye ait?
            const categoryInfo = categoryFolders.find(c => c.safeName === item);
            const categoryName = categoryInfo ? categoryInfo.name : item;
            const fileCount = countMap[categoryName] || 0;
            
            subfolders.push({
              name: item,
              displayName: categoryName,
              fileCount,
              isCategory: !!categoryInfo
            });
          } else {
            // Ana klasördeki dosya - gizli dosyaları atla
            if (!item.startsWith('.') && stats.size > 0) {
              parentFiles.push({
                name: item,
                size: stats.size,
                sizeFormatted: formatFileSize(stats.size),
                mtime: stats.mtime,
                ext: path.extname(item).toLowerCase()
              });
            }
          }
        }
        
        // Eksik kategori klasörlerini oluştur ve listeye ekle
        for (const cat of categoryFolders) {
          const catPath = path.join(parentPath, cat.safeName);
          if (!fs.existsSync(catPath)) {
            fs.mkdirSync(catPath, { recursive: true });
          }
          if (!subfolders.find(f => f.name === cat.safeName)) {
            subfolders.push({
              name: cat.safeName,
              displayName: cat.name,
              fileCount: countMap[cat.name] || 0,
              isCategory: true
            });
          }
        }
        
        // Kategori klasörlerini üste, sonra alfabetik sırala
        subfolders.sort((a, b) => {
          if (a.isCategory && !b.isCategory) return -1;
          if (!a.isCategory && b.isCategory) return 1;
          return a.name.localeCompare(b.name, 'tr');
        });
        
      } catch (err) {
        console.error('Klasör okuma hatası:', err);
        return next(err);
      }
      
      // Helper fonksiyon - dosya boyutunu formatla
      function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      }
      
      return res.render('loads/folder-browser', {
        positionNo,
        safePosNo,
        subfolders,
        parentFiles,
        categoryFolders
      });
    });
  },

  // POST /loads/position/:positionNo/upload-parent - Ana klasöre dosya yükle
  uploadToParentFolder(req, res, next) {
    const path = require('path');
    const fs = require('fs');
    
    const positionNo = req.params.positionNo;
    const safePosNo = (positionNo || '').replace(/\//g, '-');
    const parentPath = path.join(__dirname, '../../uploads', safePosNo);
    
    // Klasör yoksa oluştur
    if (!fs.existsSync(parentPath)) {
      fs.mkdirSync(parentPath, { recursive: true });
    }
    
    // Dosya yüklendi mi?
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Dosya yüklenmedi' });
    }
    
    // Helper: Multer'ın Latin-1 olarak decode ettiği dosya adını UTF-8'e çevir
    function fixFilename(filename) {
      try {
        return Buffer.from(filename, 'latin1').toString('utf8');
      } catch (e) {
        return filename;
      }
    }
    
    try {
      // Temp klasöründen ana klasöre taşı
      const originalName = fixFilename(req.file.originalname);
      const destPath = path.join(parentPath, originalName);
      
      // Aynı isimde dosya varsa yeni isim oluştur
      let finalPath = destPath;
      let counter = 1;
      while (fs.existsSync(finalPath)) {
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        finalPath = path.join(parentPath, `${baseName}_${counter}${ext}`);
        counter++;
      }
      
      // Dosyayı taşı (cross-device için copyFile + unlink kullan)
      try {
        fs.renameSync(req.file.path, finalPath);
      } catch (renameErr) {
        // EXDEV hatası: farklı dosya sistemleri arası taşıma
        if (renameErr.code === 'EXDEV') {
          fs.copyFileSync(req.file.path, finalPath);
          fs.unlinkSync(req.file.path);
        } else {
          throw renameErr;
        }
      }
      
      return res.json({ 
        success: true, 
        message: 'Dosya yüklendi',
        filename: path.basename(finalPath)
      });
    } catch (err) {
      console.error('Dosya yükleme hatası:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // POST /loads/position/:positionNo/delete-parent-file - Ana klasörden dosya sil
  deleteParentFile(req, res, next) {
    const path = require('path');
    const fs = require('fs');
    
    const positionNo = req.params.positionNo;
    const safePosNo = (positionNo || '').replace(/\//g, '-');
    const filename = req.body.filename;
    
    if (!filename) {
      return res.status(400).json({ success: false, message: 'Dosya adı belirtilmedi' });
    }
    
    const filePath = path.join(__dirname, '../../uploads', safePosNo, filename);
    
    // Güvenlik kontrolü - path traversal önleme
    const parentPath = path.join(__dirname, '../../uploads', safePosNo);
    if (!filePath.startsWith(parentPath)) {
      return res.status(400).json({ success: false, message: 'Geçersiz dosya yolu' });
    }
    
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'Dosya bulunamadı' });
      }
      
      // Sadece dosyayı sil, klasör değilse
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        return res.status(400).json({ success: false, message: 'Klasörler bu şekilde silinemez' });
      }
      
      fs.unlinkSync(filePath);
      
      return res.json({ success: true, message: 'Dosya silindi' });
    } catch (err) {
      console.error('Dosya silme hatası:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // POST /loads/document/:id/delete - Evrak sil
  deleteDocument(req, res, next) {
    const docId = req.params.id;
    const path = require('path');
    const fs = require('fs');
    
    // Önce dosya bilgisini al
    const sql = `SELECT id, position_no, filename, original_name, category FROM documents WHERE id = ?`;
    db.get(sql, [docId], (err, doc) => {
      if (err) return next(err);
      if (!doc) return res.status(404).json({ success: false, message: 'Evrak bulunamadı' });
      
      // Dosyayı sil
      const filePath = path.join(__dirname, '../../uploads', doc.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Veritabanından sil
      const deleteSql = `DELETE FROM documents WHERE id = ?`;
      db.run(deleteSql, [docId], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        // Log document deletion for the position
        try {
          LogModel.create({
            username: req.session && req.session.user ? req.session.user.username : null,
            role: req.session && req.session.user ? req.session.user.role : null,
            entity: 'position',
            entity_id: doc.position_no,
            action: 'delete_document',
            field: 'documents',
            old_value: JSON.stringify({ id: doc.id, filename: doc.filename, original_name: doc.original_name, category: doc.category }),
            new_value: null
          });
        } catch (e) { console.error('Log create error (delete document):', e); }

        res.json({ success: true, message: 'Evrak silindi' });
      });
    });
  },

  // GET /loads/new - Yeni pozisyon oluştur ve edit sayfasına yönlendir
  createNewPosition(req, res, next) {
    // Yeni pozisyon numarası üret
    LoadModel.getNextPositionNo((err, nextPositionNo) => {
      if (err) return next(err);

      // Minimum veriyle yeni yük oluştur
      const data = {
        position_no: nextPositionNo,
        customer_name: '',
        consignee_name: '',
        loading_country: 'Türkiye',
        loading_city: '',
        loading_address: '',
        unloading_country: '',
        unloading_city: '',
        unloading_address: '',
        goods_description: '',
        packages: null,
        pallets: null,
        ldm: null,
        gross_weight: null,
        net_weight: null,
        truck_plate: '',
        trailer_plate: '',
        driver_name: '',
        t1_mrn: '',
        exit_date: '',
        arrival_date: '',
        loading_date: '',
        unloading_date: '',
        navlun_currency: null,
        navlun_amount: null,
        ydg_amount: null,
        fatura_kime: '',
        cost_currency: 'TRY',
        cost_amount: null,
        notes: '',
        created_by: req.session.user.username,
        seal_code: null,
        ordino_cost: 0,
        mrn_no: null,
        ref: null,
      };

      LoadModel.create(data, (err, newLoadId) => {
        if (err) return next(err);
        
        // Hızlı pozisyon oluşturma logu
        const logData = {
          username: req.session.user.username,
          role: req.session.user.role,
          entity: 'position',
          entity_id: null,
          entity_id_text: nextPositionNo,
          action: 'Hızlı Yükleme Oluşturuldu',
          field: '-',
          old_value: null,
          new_value: '-',
          machine_name: req.headers['x-machine-name'] || req.ip || 'bilinmiyor'
        };
        LogModel.create(logData, () => {});

        // Bildirim gönder - Yeni pozisyon oluşturuldu
        NotificationService.notifyNewPosition(nextPositionNo, req.session.user.username)
          .catch(err => console.error('[Notification] Error:', err));

        // Pozisyon detay sayfasına yönlendir
        res.redirect(`/loads/position/${encodeURIComponent(nextPositionNo)}`);
      });
    });
  },

  // CMR PDF Export - Generate CMR consignment note
  exportCMR(req, res, next) {
    const cmrGenerator = require('../services/cmrGenerator');
    const positionNo = req.params.positionNo;

    // Get position data
    LoadModel.getByPositionNo(positionNo, (err, loads) => {
      if (err) return next(err);
      if (!loads || loads.length === 0) {
        return res.status(404).send('Pozisyon bulunamadı');
      }

      // Use the first load for CMR (main load data)
      const load = loads[0];

      // Set response headers
      const filename = `CMR_${positionNo.replace(/\//g, '-')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      cmrGenerator.generateCmrTemplatePdfBuffer(load, { flatten: true })
        .then((pdfBuffer) => res.end(pdfBuffer))
        .catch(next);
    });
  },

  // T1/GMR evrak listesini getir (API endpoint for GÜRAY modal)
  getT1GMRDocuments(req, res, next) {
    const positionNo = req.params.positionNo;
    
    const docSql = `SELECT id, filename, original_name, created_at FROM documents WHERE position_no = ? AND category = 'T1/GMR' AND (type IS NULL OR trim(type) = '') ORDER BY created_at DESC`;
    
    db.all(docSql, [positionNo], (err, documents) => {
      if (err) {
        console.error('[getT1GMRDocuments] Database error:', err);
        return res.json({ success: false, error: err.message });
      }
      
      return res.json({ 
        success: true, 
        documents: documents || [],
        count: (documents || []).length
      });
    });
  },

  // GÜRAY EMAIL - T1/GMR evraklarını mail ile gönder
  async sendGurayEmail(req, res, next) {
    const nodemailer = require('nodemailer');
    const positionNo = req.params.positionNo;
    const year = req.query.year || new Date().getFullYear();

    try {
      // Validate environment variables
      const gurayEmailTo = process.env.GURAY_EMAIL_TO;
      if (!gurayEmailTo) {
        console.error('[GurayEmail] GURAY_EMAIL_TO environment variable is not set');
        return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('GÜRAY email adresi tanımlı değil. Lütfen sistem yöneticisiyle iletişime geçin.')}`);
      }

      const mailUser = process.env.MAIL_USER;
      const mailPassword = process.env.MAIL_PASSWORD;
      if (!mailUser || !mailPassword) {
        console.error('[GurayEmail] MAIL_USER or MAIL_PASSWORD not configured');
        return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('Mail sunucu ayarları eksik. Lütfen sistem yöneticisiyle iletişime geçin.')}`);
      }

      // Get position data for trailer_plate and driver_name
      LoadModel.getByPositionNo(positionNo, (loadErr, loads) => {
        if (loadErr) {
          console.error('[GurayEmail] Load fetch error:', loadErr);
          return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('Pozisyon bilgileri alınamadı: ' + loadErr.message)}`);
        }

        if (!loads || loads.length === 0) {
          return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('Pozisyon bulunamadı.')}`);
        }

        const load = loads[0];
        const trailerPlate = load.trailer_plate || 'Bilinmiyor';
        const driverName = load.driver_name || 'Bilinmiyor';

        // Get T1/GMR documents for this position
        const safePosNo = (positionNo || '').replace(/\//g, '-');
        const docSql = `SELECT * FROM documents WHERE position_no = ? AND category = 'T1/GMR' AND (type IS NULL OR trim(type) = '') ORDER BY created_at DESC`;
        
        db.all(docSql, [positionNo], async (err, documents) => {
          if (err) {
            console.error('[GurayEmail] Database error:', err);
            return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('Veritabanı hatası: ' + err.message)}`);
          }

          if (!documents || documents.length === 0) {
            return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('Bu pozisyonda T1/GMR kategorisinde evrak bulunamadı.')}`);
          }

          // Build attachments array
          const attachments = [];
          const uploadsDir = path.join(__dirname, '../../uploads');
          const missingFiles = [];

          for (const doc of documents) {
            // The filename in DB is stored as: safePosNo/safeCategory/filename
            // So the full path is: uploads/safePosNo/safeCategory/filename
            const filePath = path.join(uploadsDir, doc.filename);
            
            if (fs.existsSync(filePath)) {
              attachments.push({
                filename: doc.original_name || path.basename(doc.filename),
                path: filePath
              });
            } else {
              // Try alternate path structure
              const altPath = path.join(uploadsDir, safePosNo, 'T1-GMR', path.basename(doc.filename));
              if (fs.existsSync(altPath)) {
                attachments.push({
                  filename: doc.original_name || path.basename(doc.filename),
                  path: altPath
                });
              } else {
                missingFiles.push(doc.original_name || doc.filename);
                console.warn('[GurayEmail] File not found:', filePath, 'or', altPath);
              }
            }
          }

          if (attachments.length === 0) {
            const errorMsg = missingFiles.length > 0 
              ? `T1/GMR dosyaları bulunamadı: ${missingFiles.join(', ')}`
              : 'T1/GMR dosyaları bulunamadı.';
            return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent(errorMsg)}`);
          }

          // Create mail transporter (reuse existing SMTP config)
          const transporter = nodemailer.createTransport({
            host: process.env.MAIL_HOST || 'smtp.yandex.com',
            port: parseInt(process.env.MAIL_PORT) || 465,
            secure: process.env.MAIL_SECURE === 'true' || true,
            auth: {
              user: mailUser,
              pass: mailPassword
            }
          });

          // Build email with trailer plate and driver name
          const fromAddress = process.env.GURAY_EMAIL_FROM || mailUser;
          const emailSubject = `${trailerPlate} - ${driverName} - T1 CMR ve GMR.`;
          const mailOptions = {
            from: fromAddress,
            to: gurayEmailTo,
            subject: emailSubject,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <p>${trailerPlate} - ${driverName}'nın - T1 CMR ve GMR evrakları ektedir.</p>
                <p><strong>Pozisyon No:</strong> ${positionNo}</p>
                <p><strong>Ek Sayısı:</strong> ${attachments.length} dosya</p>
                <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 12px;">
                  Bu mail BEST Freight ERP sistemi tarafından otomatik olarak gönderilmiştir.
                </p>
              </div>
            `,
            attachments: attachments
          };

          // Send email
          try {
            const info = await transporter.sendMail(mailOptions);
            console.log('[GurayEmail] Email sent successfully:', info.messageId);

            // Log the action
            try {
              LogModel.create({
                username: req.session && req.session.user ? req.session.user.username : null,
                role: req.session && req.session.user ? req.session.user.role : null,
                entity: 'position',
                entity_id: null,
                entity_id_text: positionNo,
                action: 'guray_email_sent',
                field: 'T1/GMR',
                old_value: null,
                new_value: JSON.stringify({ to: gurayEmailTo, attachments: attachments.length, messageId: info.messageId, trailerPlate, driverName })
              });
            } catch (logErr) {
              console.error('[GurayEmail] Log create error:', logErr);
            }

            // Redirect with success message
            const successMsg = `T1/GMR evrakları (${attachments.length} dosya) başarıyla gönderildi.`;
            return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&success=${encodeURIComponent(successMsg)}`);

          } catch (mailErr) {
            console.error('[GurayEmail] Mail send error:', mailErr);
            return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('Mail gönderilemedi: ' + mailErr.message)}`);
          }
        });
      });

    } catch (e) {
      console.error('[GurayEmail] Unexpected error:', e);
      return res.redirect(`/loads/position/${encodeURIComponent(positionNo)}?year=${year}&error=${encodeURIComponent('Beklenmeyen hata: ' + e.message)}`);
    }
  },
};

module.exports = loadController;
