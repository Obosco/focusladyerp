const fs = require('fs');
const path = require('path');

const root = __dirname;
const svgPath = path.join(root, 'public', 'focus-lady-logo.svg');
const outDir = path.join(root, 'build-icons');

fs.mkdirSync(outDir, { recursive: true });

const svg = fs.readFileSync(svgPath, 'utf8');
const safeSvg = svg.replace(/<\?xml[^>]*\?>/g, '').trim();

const iconData = {
  fileName: 'focus-lady-logo.svg',
  width: 512,
  height: 512,
  content: safeSvg,
};

fs.writeFileSync(path.join(outDir, 'icon-info.json'), JSON.stringify(iconData, null, 2));
console.log('Prepared icon metadata for packaging.');
