import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'build-icons');

const logoCandidates = [
  path.join(publicDir, 'focus lady logo.png'),
  path.join(publicDir, 'focus-lady-logo.png'),
  path.join(publicDir, 'focus-lady-logo.svg'),
];

const logoPath = logoCandidates.find((candidate) => fs.existsSync(candidate));

if (!logoPath) {
  console.error('No logo asset found in public/. Expected focus lady logo.png or focus-lady-logo.svg.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const baseLogoName = path.basename(logoPath);
const sizes = [
  { fileName: 'icon-512.png', size: 512 },
  { fileName: 'icon-192.png', size: 192 },
  { fileName: 'icon-maskable-512.png', size: 512 },
  { fileName: 'apple-touch-icon.png', size: 180 },
  { fileName: 'favicon-32.png', size: 32 },
];

const iconInfo = {
  fileName: baseLogoName,
  width: 512,
  height: 512,
};

fs.writeFileSync(path.join(outDir, 'icon-info.json'), JSON.stringify(iconInfo, null, 2));

const logoBuffer = fs.readFileSync(logoPath);

async function generateIcons() {
  for (const { fileName, size } of sizes) {
    await sharp(logoBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, fileName));
  }

  const favicon = await sharp(logoBuffer).resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const pngToIco = (await import('png-to-ico')).default;
  const icoBuffer = await pngToIco(favicon);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

  console.log('Regenerated app icons from the provided logo asset.');
}

generateIcons().catch((error) => {
  console.error('Failed to generate the app icons:', error);
  process.exitCode = 1;
});
