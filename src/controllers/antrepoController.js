const LogModel = require('../models/logModel');

/**
 * Antrepo Controller
 * Antrepo Liste PDF oluşturma işlemleri
 */
module.exports = {
  /**
   * POST /loads/position/:positionNo/antrepo-liste
   * Seçili satırlarla Antrepo Liste PDF oluştur
   */
  async generateAntrepoListePdf(req, res, next) {
    const positionNo = req.params.positionNo;

    // PDF printer tanımla
    const PdfPrinter = require('pdfmake');
    const fonts = require('../../pdf/fonts');
    const printer = new PdfPrinter(fonts);

    try {
      // POST'tan gelen seçili yükler ve plaka
      const selectedLoads = JSON.parse(req.body.selectedLoads || '[]');
      const trailerPlate = req.body.trailerPlate || '-';

      if (selectedLoads.length === 0) {
        return res.status(400).send('Lütfen en az bir satır seçin.');
      }

      // Toplam kap ve kilo hesapla
      let totalPackages = 0;
      let totalWeight = 0;
      selectedLoads.forEach(load => {
        const pkg = parseInt(load.packages);
        const wgt = parseFloat(load.gross_weight);
        if (!isNaN(pkg)) totalPackages += pkg;
        if (!isNaN(wgt)) totalWeight += wgt;
      });

      // Tablo verileri oluştur
      const tableBody = [
        // Header row
        [
          { text: 'GÖNDERİCİ', style: 'tableHeader', alignment: 'left' },
          { text: 'ALICI', style: 'tableHeader', alignment: 'left' },
          { text: 'KAP', style: 'tableHeader', alignment: 'center' },
          { text: 'KİLO', style: 'tableHeader', alignment: 'right' },
          { text: 'GÜMRÜK', style: 'tableHeader', alignment: 'left' }
        ]
      ];

      // Data rows
      selectedLoads.forEach(load => {
        const weight = parseFloat(load.gross_weight);
        // Gümrük - Antrepo formatında göster
        const gumrukAntrepo = [load.unloading_country, load.unloading_city].filter(Boolean).join(' - ') || '-';
        tableBody.push([
          { text: load.customer_name || '-', fontSize: 12 },
          { text: load.consignee_name || '-', fontSize: 12 },
          { text: String(load.packages || '-'), fontSize: 12, alignment: 'center' },
          { text: !isNaN(weight) ? weight.toLocaleString('tr-TR') : '-', fontSize: 12, alignment: 'right' },
          { text: gumrukAntrepo, fontSize: 12 }
        ]);
      });

      // Plaka row
      tableBody.push([
        { text: 'PLAKA', style: 'plakaCell', fillColor: '#4CAF50', color: '#ffffff' },
        { text: trailerPlate, style: 'plakaCell', fillColor: '#4CAF50', color: '#ffffff', colSpan: 4 },
        {}, {}, {}
      ]);

      // Toplam row
      tableBody.push([
        { text: 'TOPLAM', style: 'toplamCell', fillColor: '#f0f0f0' },
        { text: '', fillColor: '#f0f0f0' },
        { text: String(totalPackages), style: 'toplamCell', fillColor: '#f0f0f0', alignment: 'center' },
        { text: totalWeight.toLocaleString('tr-TR'), style: 'toplamCell', fillColor: '#f0f0f0', alignment: 'right' },
        { text: '', fillColor: '#f0f0f0' }
      ]);

      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [40, 50, 40, 40],
        defaultStyle: { font: 'Roboto', fontSize: 12 },
        content: [
          { text: 'ANTREPO LİSTESİ', style: 'header', alignment: 'center', margin: [0, 0, 0, 5] },
          { text: `Pozisyon: ${positionNo}`, style: 'subheader', alignment: 'center', margin: [0, 0, 0, 20] },
          {
            table: {
              headerRows: 1,
              widths: ['28%', '28%', '10%', '14%', '20%'],
              body: tableBody
            },
            layout: {
              fillColor: function(rowIndex) {
                if (rowIndex === 0) return '#FFE600';
                return null;
              },
              hLineWidth: function() { return 1; },
              vLineWidth: function() { return 1; },
              hLineColor: function() { return '#000000'; },
              vLineColor: function() { return '#000000'; },
              paddingLeft: function() { return 10; },
              paddingRight: function() { return 10; },
              paddingTop: function() { return 8; },
              paddingBottom: function() { return 8; }
            }
          }
        ],
        styles: {
          header: { fontSize: 22, bold: true },
          subheader: { fontSize: 14, color: '#333333' },
          tableHeader: { bold: true, fontSize: 13, color: '#000000' },
          plakaCell: { bold: true, fontSize: 12 },
          toplamCell: { bold: true, fontSize: 12 }
        }
      };

      // Log
      try {
        LogModel.create({
          username: req.session && req.session.user ? req.session.user.username : null,
          role: req.session && req.session.user ? req.session.user.role : null,
          entity: 'position',
          entity_id: positionNo,
          action: 'generate_pdf',
          field: 'antrepo_liste',
          old_value: null,
          new_value: JSON.stringify({ position: positionNo, selectedCount: selectedLoads.length })
        });
      } catch (e) { console.error('Log create error (antrepo-liste):', e); }

      // PDF oluştur ve yeni sekmede aç
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="antrepo_liste_${encodeURIComponent(positionNo)}.pdf"`);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (error) {
      next(error);
    }
  }
};
