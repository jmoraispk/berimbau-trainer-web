// Rasterize public/icon.svg into PNG icons for the PWA manifest.
// Run with: pnpm icons

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'public/icon.svg');
const outDir = resolve(root, 'public/icons');

await mkdir(outDir, { recursive: true });
const svg = await readFile(src);

const render = (size) => sharp(svg, { density: 384 }).resize(size, size).png();

await render(192).toFile(resolve(outDir, 'icon-192.png'));
await render(512).toFile(resolve(outDir, 'icon-512.png'));

// Maskable icon: safe-zone padding so OS-level circular/rounded masks
// don't clip the berimbau. Pad to ~80% of the canvas.
const maskable = await sharp(svg, { density: 384 })
  .resize(410, 410)
  .extend({
    top: 51,
    bottom: 51,
    left: 51,
    right: 51,
    background: { r: 11, g: 15, b: 26, alpha: 1 },
  })
  .png()
  .toBuffer();
await writeFile(resolve(outDir, 'icon-512-maskable.png'), maskable);

// Apple touch icon (iOS home screen)
await render(180).toFile(resolve(outDir, 'apple-touch-icon.png'));

console.log('Wrote icons/ (192, 512, 512-maskable, apple-touch-icon)');
