/**
 * Generates every brand asset from `config/brand.json`.
 *
 * Run with `yarn brand:assets`. Files written:
 *   public/brand/mark.svg             adaptive mark
 *   public/brand/wordmark.svg         adaptive wordmark
 *   public/brand/lockup.svg           adaptive mark + wordmark
 *   public/brand/lockup-on-dark.png   paper artwork, for dark backgrounds
 *   public/brand/lockup-on-light.png  ink artwork, for light backgrounds
 *   public/brand/tile.svg             app-icon tile
 *   public/brand/icon-{192,512,1024}.png
 *   app/icon.svg                      favicon (SVG)
 *   app/favicon.ico                   favicon (16/32/48)
 *   app/apple-icon.png                180x180 touch icon
 *
 * Nothing here is hand-maintained, so the SVG files, the raster icons, and the
 * React `<Logo />` (which reads the same JSON) always describe one mark.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

const root = process.cwd();
const brand = JSON.parse(
  readFileSync(join(root, "config/brand.json"), "utf8"),
);

const { ink, paper } = brand.colors;
const { viewBox, inset, stroke } = brand.mark;
const far = viewBox - inset;
const frameSize = far - inset;
const fillPoints = `${inset},${inset} ${inset},${far} ${far},${far}`;
const tracking = brand.wordmarkTrackingEm * 40;
const { scale } = brand.tile;

const publicBrand = join(root, "public/brand");
const appDir = join(root, "app");
mkdirSync(publicBrand, { recursive: true });

const noWrap = (svg) => svg.replace(/\n\s*/g, "");

/** The mark: a square, half filled along the diagonal — the pool. */
const markShapes = (color) =>
  `<rect x="${inset}" y="${inset}" width="${frameSize}" height="${frameSize}" fill="none" stroke="${color}" stroke-width="${stroke}"/>` +
  `<polygon points="${fillPoints}" fill="${color}"/>`;

const adaptiveStyle = (color) =>
  `<style>svg{color:${color}}@media (prefers-color-scheme:dark){svg{color:${color === ink ? paper : ink}}}</style>`;

const markSvg = (options = {}) => {
  const { color = null, adaptive = false } = options;
  return noWrap(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" role="img" aria-label="${brand.wordmark}">
    ${adaptive ? adaptiveStyle(ink) : ""}
    ${markShapes(adaptive ? "currentColor" : color)}
  </svg>`);
};

const textSvg = (options = {}) => {
  const {
    color = null,
    adaptive = false,
    x = 8,
    y = 62,
    size = 40,
    width = 520,
    height = 96,
  } = options;
  return noWrap(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${brand.wordmark}">
    ${adaptive ? adaptiveStyle(ink) : ""}
    <text x="${x}" y="${y}" font-family="${brand.fontStack}" font-size="${size}" font-weight="500" letter-spacing="${tracking}" fill="${adaptive ? "currentColor" : color}">${brand.wordmark}</text>
  </svg>`);
};

const lockupSvg = (options = {}) => {
  const { color = null, adaptive = false } = options;
  const markSize = 64;
  const gap = 24;
  const padding = 16;
  const textX = padding + markSize + gap;
  const width = 496;
  const height = 96;
  return noWrap(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${brand.wordmark}">
    ${adaptive ? adaptiveStyle(ink) : ""}
    <g transform="translate(${padding} ${(height - markSize) / 2})">${markShapes(adaptive ? "currentColor" : color)}</g>
    <text x="${textX}" y="${height / 2 + 14}" font-family="${brand.fontStack}" font-size="40" font-weight="500" letter-spacing="${tracking}" fill="${adaptive ? "currentColor" : color}">${brand.wordmark}</text>
  </svg>`);
};

const tileSvg = () => {
  const offset = (brand.tile.size * (1 - scale)) / 2;
  return noWrap(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${brand.tile.size} ${brand.tile.size}" role="img" aria-label="${brand.wordmark}">
    <rect width="${brand.tile.size}" height="${brand.tile.size}" fill="${ink}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${markShapes(paper)}</g>
  </svg>`);
};

const svgFiles = {
  "public/brand/mark.svg": markSvg({ adaptive: true }),
  "public/brand/wordmark.svg": textSvg({ adaptive: true }),
  "public/brand/lockup.svg": lockupSvg({ adaptive: true }),
  "public/brand/tile.svg": tileSvg(),
  "app/icon.svg": tileSvg(),
};

for (const [file, contents] of Object.entries(svgFiles)) {
  writeFileSync(join(root, file), `${contents}\n`);
  console.log(`svg   ${file}`);
}

// Next statically parses `alt`, so it has to be a literal in each route file.
// Verify those literals instead of generating them, so they cannot drift.
const socialAlt = `${brand.wordmark} — ${brand.tagline} ${brand.subtagline}`;
for (const file of ["app/opengraph-image.tsx", "app/twitter-image.tsx"]) {
  const source = readFileSync(join(root, file), "utf8");
  if (!source.includes(`"${socialAlt}"`)) {
    throw new Error(`${file}: alt does not match config/brand.json`);
  }
  console.log(`ok    ${file}  alt in sync`);
}

const tile = Buffer.from(tileSvg());
const lockupOnDark = Buffer.from(lockupSvg({ color: paper }));
const lockupOnLight = Buffer.from(lockupSvg({ color: ink }));

const pngTargets = [
  ["public/brand/icon-192.png", tile, 192],
  ["public/brand/icon-512.png", tile, 512],
  ["public/brand/icon-1024.png", tile, 1024],
  ["app/apple-icon.png", tile, 180],
  ["public/brand/lockup-on-dark.png", lockupOnDark, 992],
  ["public/brand/lockup-on-light.png", lockupOnLight, 992],
];

const pngs = {};
for (const [file, source, width] of pngTargets) {
  const out = await sharp(source).resize({ width }).png().toBuffer();
  writeFileSync(join(root, file), out);
  pngs[file] = out;
  console.log(`png   ${file}  ${width}w`);
}

// A missing monospace font silently renders an empty wordmark, so fail loudly.
for (const [file, buffer] of Object.entries({
  "public/brand/lockup-on-dark.png": pngs["public/brand/lockup-on-dark.png"],
  "public/brand/lockup-on-light.png": pngs["public/brand/lockup-on-light.png"],
})) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
  const ratio = opaque / (info.width * info.height);
  if (ratio < 0.02) {
    throw new Error(
      `${file}: only ${(ratio * 100).toFixed(2)}% ink — is a monospace font installed?`,
    );
  }
  console.log(`ok    ${file}  ${(ratio * 100).toFixed(1)}% ink`);
}

/** ICO container with PNG payloads (16/32/48). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach(({ size, buffer }, index) => {
    const at = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(buffer.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += buffer.length;
  });

  return Buffer.concat([
    header,
    directory,
    ...entries.map((entry) => entry.buffer),
  ]);
}

const icoEntries = [];
for (const size of [16, 32, 48]) {
  icoEntries.push({
    size,
    buffer: await sharp(tile).resize(size, size).png().toBuffer(),
  });
}
const ico = buildIco(icoEntries);
writeFileSync(join(appDir, "favicon.ico"), ico);
console.log(`ico   app/favicon.ico  ${icoEntries.length} sizes`);

const sizes = readFileSync(join(appDir, "favicon.ico")).subarray(0, 6);
if (sizes.readUInt16LE(2) !== 1 || sizes.readUInt16LE(4) !== 3) {
  throw new Error("app/favicon.ico: malformed ICO directory");
}
