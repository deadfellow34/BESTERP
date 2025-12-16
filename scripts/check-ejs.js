const fs = require('fs');
const ejs = require('ejs');
const path = require('path');
const tplPath = path.resolve(__dirname, '../src/views/loads/position.ejs');
try {
  const tpl = fs.readFileSync(tplPath, 'utf8');
  ejs.compile(tpl, {filename: tplPath});
  console.log('EJS template compiled successfully');
} catch (err) {
  console.error('EJS compile error:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
