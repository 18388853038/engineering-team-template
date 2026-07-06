const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'server-modern.js');
let c = fs.readFileSync(filePath, 'utf-8');

// Fix read_file path check (use path.resolve on BASE for normalize)
const old1 = 'var resolvedPath = path.resolve(BASE, args.filepath);\n        // path traversal protection\n        if (!resolvedPath.startsWith(BASE)) {';
const new1 = 'var resolvedPath = path.resolve(BASE, args.filepath);\n        var baseNorm = path.resolve(BASE);\n        if (!resolvedPath.startsWith(baseNorm)) {';

// Fix write_file path check
const old2 = 'var fp = path.resolve(BASE, args.filepath);\n        if (!fp.startsWith(BASE)) {';
const new2 = 'var fp = path.resolve(BASE, args.filepath);\n        var baseNorm = path.resolve(BASE);\n        if (!fp.startsWith(baseNorm)) {';

if (c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('read_file check patched');
} else {
  console.log('read_file: pattern not found, checking if already patched...');
  console.log('Contains baseNorm:', c.includes('baseNorm'));
}

if (c.includes(old2)) {
  c = c.replace(old2, new2);
  console.log('write_file check patched');
} else {
  console.log('write_file: pattern not found');
}

fs.writeFileSync(filePath, c, 'utf-8');
console.log('Done');
