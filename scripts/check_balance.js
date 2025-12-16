const fs = require('fs');
const s = fs.readFileSync('src/controllers/vehicleController.js', 'utf8');
let paren = 0, brace = 0, bracket = 0;
let inSingle = false, inDouble = false, inBack = false, inLineComment = false, inBlockComment = false;
let parenStack = [], braceStack = [], bracketStack = [];
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  const next = s[i+1];
  if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
  if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
  if (!inSingle && !inDouble && !inBack && c === '/' && next === '/') { inLineComment = true; i++; continue; }
  if (!inSingle && !inDouble && !inBack && c === '/' && next === '*') { inBlockComment = true; i++; continue; }
  if (!inSingle && !inDouble && c === '`') { inBack = !inBack; continue; }
  if (!inSingle && !inBack && c === '"') { inDouble = !inDouble; continue; }
  if (!inDouble && !inBack && c === "'") { inSingle = !inSingle; continue; }
  if (inSingle || inDouble || inBack) continue;
  if (c === '(') paren++;
  if (c === ')') paren--;
  if (c === '{') brace++;
  if (c === '}') brace--;
  if (c === '[') bracket++;
  if (c === ']') bracket--;
  if (paren < 0 || brace < 0 || bracket < 0) {
    const upTo = s.slice(0, i+1);
    const line = upTo.split(/\r?\n/).length;
    const lines = s.split(/\r?\n/);
    const ctx = lines.slice(Math.max(0,line-3), Math.min(lines.length, line+2)).map((ln,idx)=>`${line-3+idx+1}: ${ln}` ).join('\n');
    console.log('Syntax imbalance at char', i, 'line', line, 'paren', paren, 'brace', brace, 'bracket', bracket);
    console.log(ctx);
    process.exit(1);
  }
}
// Build stacks to find unmatched openings
paren = brace = bracket = 0; inSingle = inDouble = inBack = inLineComment = inBlockComment = false;
for (let i = 0; i < s.length; i++) {
  const c = s[i]; const next = s[i+1];
  if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
  if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i++; } continue; }
  if (!inSingle && !inDouble && !inBack && c === '/' && next === '/') { inLineComment = true; i++; continue; }
  if (!inSingle && !inDouble && !inBack && c === '/' && next === '*') { inBlockComment = true; i++; continue; }
  if (!inSingle && !inDouble && c === '`') { inBack = !inBack; continue; }
  if (!inSingle && !inBack && c === '"') { inDouble = !inDouble; continue; }
  if (!inDouble && !inBack && c === "'") { inSingle = !inSingle; continue; }
  if (inSingle || inDouble || inBack) continue;
  if (c === '(') parenStack.push(i);
  if (c === ')') parenStack.pop();
  if (c === '{') braceStack.push(i);
  if (c === '}') braceStack.pop();
  if (c === '[') bracketStack.push(i);
  if (c === ']') bracketStack.pop();
}
console.log('final stacks lengths', {paren: parenStack.length, brace: braceStack.length, bracket: bracketStack.length});
if (parenStack.length) {
  console.log('Unmatched ( positions (showing last 5):');
  parenStack.slice(-5).forEach(pos=>{ const line = s.slice(0,pos).split(/\r?\n/).length; console.log('char',pos,'line',line); });
}
if (braceStack.length) {
  console.log('Unmatched { positions (showing last 5):');
  braceStack.slice(-5).forEach(pos=>{ const line = s.slice(0,pos).split(/\r?\n/).length; console.log('char',pos,'line',line); });
}
if (bracketStack.length) {
  console.log('Unmatched [ positions (showing last 5):');
  bracketStack.slice(-5).forEach(pos=>{ const line = s.slice(0,pos).split(/\r?\n/).length; console.log('char',pos,'line',line); });
}
