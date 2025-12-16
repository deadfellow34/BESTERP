/**
 * CMR (Convention on the Contract for the International Carriage of Goods by Road) Generator
 * Generates international CMR consignment notes
 */

const PdfPrinter = require('pdfmake');
const fonts = require('../../pdf/fonts');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const printer = new PdfPrinter(fonts);

function getCmrTemplateBuffer() {
  const templatePath = path.join(__dirname, '..', '..', 'pdf', 'getPrintCmrPdf.pdf');
  return fs.readFileSync(templatePath);
}

function joinNonEmpty(parts, separator = ' ') {
  return (parts || []).map(v => (v == null ? '' : String(v)).trim()).filter(Boolean).join(separator);
}

function formatDateTr(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('tr-TR');
  } catch (_) {
    return String(value);
  }
}

function pickFirstNonEmpty(...values) {
  for (const v of values) {
    const s = v == null ? '' : String(v).trim();
    if (s) return s;
  }
  return '';
}

function sanitizeForWinAnsi(input) {
  if (input == null) return '';
  return String(input)
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c');
}

async function embedRobotoFont(pdfDoc) {
  // pdf-lib needs fontkit to embed TrueType fonts
  let fontkit;
  try {
    fontkit = require('@pdf-lib/fontkit');
  } catch (_) {
    fontkit = null;
  }

  if (!fontkit) return null;

  try {
    pdfDoc.registerFontkit(fontkit);
    const fontPath = path.join(__dirname, '..', '..', 'pdf', 'Roboto-Regular.ttf');
    const fontBytes = fs.readFileSync(fontPath);
    return await pdfDoc.embedFont(fontBytes, { subset: true });
  } catch (_) {
    return null;
  }
}

function fitFontSizeToWidth(text, font, maxWidth, preferredSize, minSize) {
  if (!text) return preferredSize;
  const safePreferred = typeof preferredSize === 'number' ? preferredSize : 10;
  const safeMin = typeof minSize === 'number' ? minSize : 6;
  let size = safePreferred;
  try {
    // Shrink until the text fits (simple, predictable)
    // Guard with a small iteration cap.
    for (let i = 0; i < 20; i += 1) {
      const width = font.widthOfTextAtSize(text, size);
      if (width <= maxWidth || size <= safeMin) break;
      size -= 0.5;
    }
  } catch (_) {
    // If font metrics fail, just keep preferred size.
  }
  return Math.max(size, safeMin);
}

function getFieldWidgetRects(pdfDoc, form, fieldName) {
  try {
    const textField = form.getTextField(fieldName);
    const widgets = textField.acroField.getWidgets();
    const pages = pdfDoc.getPages();
    const rects = [];

    for (const widget of widgets) {
      const rect = widget.getRectangle();
      const pref = widget.P();
      let pageIndex = 0;
      if (pref) {
        const idx = pages.findIndex(p => String(p.ref) === String(pref));
        if (idx >= 0) pageIndex = idx;
      }
      rects.push({ pageIndex, rect });
    }

    return rects;
  } catch (_) {
    return [];
  }
}

function drawTextInRects(pdfDoc, rects, text, font, drawOptions = {}) {
  if (!text) return;
  const pages = pdfDoc.getPages();
  const padding = typeof drawOptions.padding === 'number' ? drawOptions.padding : 2;
  const preferredSize = typeof drawOptions.fontSize === 'number' ? drawOptions.fontSize : 8;
  const minSize = typeof drawOptions.minFontSize === 'number' ? drawOptions.minFontSize : 6;
  const yOffset = typeof drawOptions.yOffset === 'number' ? drawOptions.yOffset : 0;
  const vAlign = drawOptions.vAlign === 'top' ? 'top' : 'center';

  for (const { pageIndex, rect } of rects) {
    const page = pages[pageIndex] || pages[0];
    if (!page || !rect) continue;

    const maxWidth = Math.max(0, rect.width - padding * 2);
    const size = fitFontSizeToWidth(text, font, maxWidth, preferredSize, minSize);

    // pdf-lib's y is baseline.
    // For short boxes, top-align is more robust to avoid spilling into the label area below.
    const x = rect.x + padding;
    const y = vAlign === 'top'
      ? rect.y + rect.height - size - padding + yOffset
      : rect.y + (rect.height - size) / 2 + yOffset;

    try {
      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    } catch (_) {
      // ignore drawing errors (e.g., encoding)
    }
  }
}

async function generateCmrTemplatePdfBuffer(load, options = {}) {
  const templateBytes = getCmrTemplateBuffer();
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  // Prefer Unicode font (Roboto) to support Turkish characters.
  // Fall back to Helvetica (WinAnsi) with best-effort sanitization.
  const robotoFont = await embedRobotoFont(pdfDoc);
  const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const appearanceFont = robotoFont || fallbackFont;

  const setText = (fieldName, value, fieldOptions = {}) => {
    try {
      const textField = form.getTextField(fieldName);
      const raw = value == null ? '' : String(value);
      const v = robotoFont ? raw : sanitizeForWinAnsi(raw);
      textField.setText(v);

      if (fieldOptions && typeof fieldOptions.fontSize === 'number') {
        try {
          textField.setFontSize(fieldOptions.fontSize);
        } catch (_) {
          // ignore (some fields may not have a DA font size)
        }
      }
    } catch (_) {
      // Ignore missing field names to allow incremental mapping
    }
  };

  // Field mapping (provided by user)
  // Per user request:
  // - rectangle76TextField_1 should contain BEST company info
  // - rectangle47TextField_1 should be empty
  setText('rectangle47TextField_1', '');
  setText('rectangle76TextField_1', 'BEST ULUSLARARASI NAKLIYAT VE TICAR iKITELLI OSB\nDEPARKO SAN SIT NO 22 TR-. ISTANBUL');

  setText('rectangle77TextField_1', load?.customer_name);
  setText('rectangle78TextField_1', load?.consignee_name);
  const loadingCity = pickFirstNonEmpty(load?.loading?.city, load?.loading_city);
  const loadingCountry = pickFirstNonEmpty(load?.loading?.country, load?.loading_country);

  // These two boxes are short and pdf-lib sometimes generates clipped/empty appearances.
  // We'll still set the form field, but also draw overlay text post-flatten using widget rectangles.
  const rect79Raw = joinNonEmpty([loadingCity, loadingCountry], ' / ');
  const rect80Raw = joinNonEmpty([load?.unloading_country, load?.unloading_city], ' ');
  const rect79Text = robotoFont ? rect79Raw : sanitizeForWinAnsi(rect79Raw);
  const rect80Text = robotoFont ? rect80Raw : sanitizeForWinAnsi(rect80Raw);
  const rect79Rects = getFieldWidgetRects(pdfDoc, form, 'rectangle79TextField_1');
  const rect80Rects = getFieldWidgetRects(pdfDoc, form, 'rectangle80TextField_1');

  // Important: Do NOT set these two form fields to avoid duplicate/overlapping text.
  // We'll draw them directly after flatten using widget rectangles.
  setText('rectangle79TextField_1', '');
  setText('rectangle80TextField_1', '');
  setText('rectangle87TextField_1_0', load?.packages);
  setText('rectangle88TextField_1_0', load?.goods_description);

  // Note: Only one rectangle84 field exists in the template; use adjacent fields for date/country.
  setText('rectangle84TextField_1', joinNonEmpty([load?.truck_plate, load?.trailer_plate], ' '));
  setText('rectangle85TextField_1', formatDateTr(load?.loading_date));
  setText('rectangle86TextField_1', 'TR');

  setText('rectangle90TextField_1_0', load?.gross_weight);

  // Ensure appearances so values render in PDF viewers
  try {
    form.updateFieldAppearances(appearanceFont);
  } catch (_) {
    // ignore
  }

  if (options.flatten !== false) {
    try {
      form.flatten();
    } catch (_) {
      // ignore
    }

    // Draw overlay text after flatten so it cannot be hidden by widget appearance/background.
    // Top align prevents the text from drifting into the label area below the box.
    drawTextInRects(pdfDoc, rect79Rects, rect79Text, appearanceFont, { fontSize: 8, minFontSize: 6, padding: 2, yOffset: 0, vAlign: 'top' });
    drawTextInRects(pdfDoc, rect80Rects, rect80Text, appearanceFont, { fontSize: 8, minFontSize: 6, padding: 2, yOffset: 0, vAlign: 'top' });
  }

  const outBytes = await pdfDoc.save();
  return Buffer.from(outBytes);
}

/**
 * Generate CMR PDF document
 * @param {Object} load - Load data from database
 * @param {Object} options - Optional settings
 * @returns {PDFDocument} pdfmake document
 */
function generateCMR(load, options = {}) {
  const cmrNumber = options.cmrNumber || `CMR-${load.position_no || load.id}`;
  const issueDate = options.issueDate || new Date().toLocaleDateString('tr-TR');
  
  // Helper function for empty values
  const val = (v) => v || '-';
  
  // Format date helper
  const formatDate = (d) => {
    if (!d) return '-';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('tr-TR');
    } catch (e) {
      return d;
    }
  };

  // CMR document definition following international standard format
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [20, 20, 20, 20],
    
    content: [
      // Header
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'CMR', fontSize: 28, bold: true, color: '#1e40af' },
              { text: 'ULUSLARARASI TAŞ. SÖZL.', fontSize: 9, color: '#64748b', margin: [0, 2, 0, 0] },
              { text: 'Convention Relative au Contrat de Transport', fontSize: 7, color: '#94a3b8', italics: true }
            ]
          },
          {
            width: 'auto',
            stack: [
              { text: 'CMR No:', fontSize: 9, color: '#64748b', alignment: 'right' },
              { text: cmrNumber, fontSize: 14, bold: true, color: '#1e40af', alignment: 'right' },
              { text: `Tarih: ${issueDate}`, fontSize: 9, color: '#64748b', alignment: 'right', margin: [0, 4, 0, 0] }
            ]
          }
        ],
        margin: [0, 0, 0, 15]
      },
      
      // Divider
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 555, y2: 0, lineWidth: 2, lineColor: '#1e40af' }], margin: [0, 0, 0, 15] },
      
      // 1. Sender (Gönderici)
      {
        table: {
          widths: ['50%', '50%'],
          body: [
            [
              {
                stack: [
                  { text: '1. GÖNDERİCİ / SENDER', fontSize: 8, bold: true, color: '#1e40af', margin: [0, 0, 0, 4] },
                  { text: val(load.customer_name), fontSize: 11, bold: true },
                  { text: `${val(load.loading_city)}, ${val(load.loading_country)}`, fontSize: 9, color: '#475569' },
                  { text: val(load.loading_address), fontSize: 8, color: '#64748b', margin: [0, 2, 0, 0] }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                fillColor: '#f8fafc',
                margin: [8, 8, 8, 8]
              },
              {
                stack: [
                  { text: '2. ALICI / CONSIGNEE', fontSize: 8, bold: true, color: '#1e40af', margin: [0, 0, 0, 4] },
                  { text: val(load.consignee_name), fontSize: 11, bold: true },
                  { text: `${val(load.unloading_city)}, ${val(load.unloading_country)}`, fontSize: 9, color: '#475569' },
                  { text: val(load.unloading_address), fontSize: 8, color: '#64748b', margin: [0, 2, 0, 0] }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                fillColor: '#f8fafc',
                margin: [8, 8, 8, 8]
              }
            ]
          ]
        },
        layout: {
          defaultBorder: false,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0
        },
        margin: [0, 0, 0, 10]
      },
      
      // 3. Loading Place / 4. Delivery Place
      {
        table: {
          widths: ['50%', '50%'],
          body: [
            [
              {
                stack: [
                  { text: '3. YÜKLEME YERİ / PLACE OF LOADING', fontSize: 8, bold: true, color: '#059669', margin: [0, 0, 0, 4] },
                  { text: val(load.loading_address), fontSize: 10 },
                  { text: `${val(load.loading_city)}, ${val(load.loading_country)}`, fontSize: 9, color: '#475569' },
                  { text: `Yükleme Tarihi: ${formatDate(load.loading_date)}`, fontSize: 8, color: '#64748b', margin: [0, 4, 0, 0] }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                margin: [8, 8, 8, 8]
              },
              {
                stack: [
                  { text: '4. TESLİM YERİ / PLACE OF DELIVERY', fontSize: 8, bold: true, color: '#dc2626', margin: [0, 0, 0, 4] },
                  { text: val(load.unloading_address), fontSize: 10 },
                  { text: `${val(load.unloading_city)}, ${val(load.unloading_country)}`, fontSize: 9, color: '#475569' },
                  { text: `Varış Tarihi: ${formatDate(load.arrival_date)}`, fontSize: 8, color: '#64748b', margin: [0, 4, 0, 0] }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                margin: [8, 8, 8, 8]
              }
            ]
          ]
        },
        layout: {
          defaultBorder: false,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0
        },
        margin: [0, 0, 0, 10]
      },
      
      // 5-10. Goods Description
      {
        stack: [
          { text: '5-10. MAL BİLGİLERİ / GOODS DESCRIPTION', fontSize: 8, bold: true, color: '#1e40af', margin: [0, 0, 0, 8] },
          {
            table: {
              widths: ['*', '15%', '15%', '15%', '15%'],
              headerRows: 1,
              body: [
                [
                  { text: 'Açıklama / Description', style: 'tableHeader' },
                  { text: 'Koli', style: 'tableHeader', alignment: 'center' },
                  { text: 'Palet', style: 'tableHeader', alignment: 'center' },
                  { text: 'Brüt (kg)', style: 'tableHeader', alignment: 'center' },
                  { text: 'LDM', style: 'tableHeader', alignment: 'center' }
                ],
                [
                  { text: val(load.goods_description), fontSize: 10 },
                  { text: val(load.packages), fontSize: 10, alignment: 'center' },
                  { text: val(load.pallets), fontSize: 10, alignment: 'center' },
                  { text: val(load.gross_weight), fontSize: 10, alignment: 'center' },
                  { text: val(load.ldm), fontSize: 10, alignment: 'center' }
                ]
              ]
            },
            layout: {
              hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => '#e2e8f0',
              vLineColor: () => '#e2e8f0',
              fillColor: (row) => row === 0 ? '#f1f5f9' : null,
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 6,
              paddingBottom: () => 6
            }
          }
        ],
        margin: [0, 0, 0, 15]
      },
      
      // 11-15. Transport Details
      {
        stack: [
          { text: '11-15. TAŞIMA BİLGİLERİ / TRANSPORT DETAILS', fontSize: 8, bold: true, color: '#1e40af', margin: [0, 0, 0, 8] },
          {
            table: {
              widths: ['33.33%', '33.33%', '33.34%'],
              body: [
                [
                  {
                    stack: [
                      { text: 'Çekici Plaka', fontSize: 7, color: '#64748b' },
                      { text: val(load.truck_plate), fontSize: 12, bold: true }
                    ],
                    border: [true, true, true, true],
                    borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                    margin: [8, 6, 8, 6]
                  },
                  {
                    stack: [
                      { text: 'Dorse Plaka', fontSize: 7, color: '#64748b' },
                      { text: val(load.trailer_plate), fontSize: 12, bold: true }
                    ],
                    border: [true, true, true, true],
                    borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                    margin: [8, 6, 8, 6]
                  },
                  {
                    stack: [
                      { text: 'Şoför', fontSize: 7, color: '#64748b' },
                      { text: val(load.driver_name), fontSize: 12, bold: true }
                    ],
                    border: [true, true, true, true],
                    borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                    margin: [8, 6, 8, 6]
                  }
                ]
              ]
            },
            layout: { defaultBorder: false }
          }
        ],
        margin: [0, 0, 0, 15]
      },
      
      // 16-18. Seal & MRN
      {
        table: {
          widths: ['33.33%', '33.33%', '33.34%'],
          body: [
            [
              {
                stack: [
                  { text: '16. MÜHÜR NO / SEAL NO', fontSize: 7, color: '#64748b' },
                  { text: val(load.seal_code), fontSize: 12, bold: true, color: '#7c3aed' }
                ],
                border: [true, true, true, true],
                borderColor: ['#7c3aed', '#7c3aed', '#7c3aed', '#7c3aed'],
                fillColor: '#faf5ff',
                margin: [8, 6, 8, 6]
              },
              {
                stack: [
                  { text: '17. MRN NO', fontSize: 7, color: '#64748b' },
                  { text: val(load.mrn_no || load.t1_mrn), fontSize: 10, bold: true }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                margin: [8, 6, 8, 6]
              },
              {
                stack: [
                  { text: '18. ÇIKIŞ TARİHİ', fontSize: 7, color: '#64748b' },
                  { text: formatDate(load.exit_date), fontSize: 10, bold: true }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                margin: [8, 6, 8, 6]
              }
            ]
          ]
        },
        layout: { defaultBorder: false },
        margin: [0, 0, 0, 15]
      },
      
      // 19-22. Commercial Terms
      {
        stack: [
          { text: '19-22. NAVLUN BİLGİLERİ / FREIGHT CHARGES', fontSize: 8, bold: true, color: '#1e40af', margin: [0, 0, 0, 8] },
          {
            table: {
              widths: ['50%', '50%'],
              body: [
                [
                  {
                    stack: [
                      { text: 'Navlun / Freight', fontSize: 8, color: '#64748b' },
                      {
                        text: load.navlun_amount ? `${load.navlun_amount} ${load.navlun_currency || 'EUR'}` : '-',
                        fontSize: 14,
                        bold: true,
                        color: '#059669'
                      }
                    ],
                    border: [true, true, true, true],
                    borderColor: ['#059669', '#059669', '#059669', '#059669'],
                    fillColor: '#f0fdf4',
                    margin: [8, 8, 8, 8]
                  },
                  {
                    stack: [
                      { text: 'Pozisyon No', fontSize: 8, color: '#64748b' },
                      { text: val(load.position_no), fontSize: 14, bold: true, color: '#1e40af' }
                    ],
                    border: [true, true, true, true],
                    borderColor: ['#1e40af', '#1e40af', '#1e40af', '#1e40af'],
                    fillColor: '#eff6ff',
                    margin: [8, 8, 8, 8]
                  }
                ]
              ]
            },
            layout: { defaultBorder: false }
          }
        ],
        margin: [0, 0, 0, 15]
      },
      
      // Notes section
      {
        stack: [
          { text: '23. NOTLAR / REMARKS', fontSize: 8, bold: true, color: '#1e40af', margin: [0, 0, 0, 4] },
          {
            text: val(load.notes),
            fontSize: 9,
            color: '#475569',
            margin: [0, 0, 0, 0]
          }
        ],
        fillColor: '#f8fafc',
        border: [true, true, true, true],
        borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
        margin: [0, 0, 0, 20]
      },
      
      // Signatures Section
      {
        table: {
          widths: ['33.33%', '33.33%', '33.34%'],
          body: [
            [
              {
                stack: [
                  { text: '22. GÖNDERİCİ İMZASI', fontSize: 7, bold: true, color: '#64748b' },
                  { text: 'Sender\'s Signature', fontSize: 6, color: '#94a3b8', italics: true },
                  { text: '', margin: [0, 40, 0, 0] },
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }] }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                margin: [8, 8, 8, 8]
              },
              {
                stack: [
                  { text: '23. TAŞIYICI İMZASI', fontSize: 7, bold: true, color: '#64748b' },
                  { text: 'Carrier\'s Signature', fontSize: 6, color: '#94a3b8', italics: true },
                  { text: '', margin: [0, 40, 0, 0] },
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }] }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                margin: [8, 8, 8, 8]
              },
              {
                stack: [
                  { text: '24. ALICI İMZASI', fontSize: 7, bold: true, color: '#64748b' },
                  { text: 'Consignee\'s Signature', fontSize: 6, color: '#94a3b8', italics: true },
                  { text: '', margin: [0, 40, 0, 0] },
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }] }
                ],
                border: [true, true, true, true],
                borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                margin: [8, 8, 8, 8]
              }
            ]
          ]
        },
        layout: { defaultBorder: false }
      }
    ],
    
    styles: {
      tableHeader: {
        fontSize: 8,
        bold: true,
        color: '#475569'
      }
    },
    
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10
    },
    
    footer: function(currentPage, pageCount) {
      return {
        columns: [
          { text: `Pozisyon: ${val(load.position_no)}`, fontSize: 7, color: '#94a3b8', margin: [20, 0, 0, 0] },
          { text: `Sayfa ${currentPage} / ${pageCount}`, fontSize: 7, color: '#94a3b8', alignment: 'center' },
          { text: `Oluşturulma: ${new Date().toLocaleString('tr-TR')}`, fontSize: 7, color: '#94a3b8', alignment: 'right', margin: [0, 0, 20, 0] }
        ],
        margin: [0, 0, 0, 10]
      };
    }
  };
  
  return printer.createPdfKitDocument(docDefinition);
}

module.exports = {
  generateCMR,
  getCmrTemplateBuffer,
  generateCmrTemplatePdfBuffer,
  printer
};
