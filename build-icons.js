import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
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

sharp(Buffer.from(safeSvg))
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(root, 'public', 'icon-512.png'))
  .then(() => console.log('Generated public/icon-512.png from the FocusLady logo.'))
  .catch((error) => {
    console.error('Failed to generate the desktop icon:', error);
    process.exitCode = 1;
  });
