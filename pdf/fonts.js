// Roboto font definitions for pdfmake (Node.js)
// Download Roboto fonts from https://github.com/google/fonts/tree/main/apache/roboto
// Place Roboto-Regular.ttf and Roboto-Bold.ttf in this folder

const path = require('path');

module.exports = {
  Roboto: {
    normal: path.join(__dirname, 'Roboto-Regular.ttf'),
    bold: path.join(__dirname, 'Roboto-Bold.ttf'),
    italics: path.join(__dirname, 'Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, 'Roboto-BoldItalic.ttf'),
  }
};
