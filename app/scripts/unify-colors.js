const fs = require('fs');
const path = require('path');

const map = {
  '#16766c': '#0052FF', '#126e64': '#003ECC', '#208AEF': '#0052FF',
  '#047857': '#067647', '#85918b': '#64748B', '#52615b': '#475569',
  '#f4f7f5': '#FAFAFC', '#18332d': '#0F172A', '#cbd7d1': '#CBD5E1',
};

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.(tsx?|css)$/.test(entry.name)) continue;
    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    for (const [from, to] of Object.entries(map)) after = after.replace(new RegExp(from, 'gi'), to);
    if (after !== before) { fs.writeFileSync(file, after); console.log('actualizado', file); }
  }
}
walk('src');