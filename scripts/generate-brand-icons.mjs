/**
 * Generate square favicons + default OG image from the ANSHA logo mark.
 * Run: node scripts/generate-brand-icons.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + count * dirEntrySize;
  const entries = [];
  for (const item of pngBuffers) {
    entries.push({ size: item.size, buffer: item.buffer, offset });
    offset += item.buffer.length;
  }
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  let o = 6;
  for (const e of entries) {
    out.writeUInt8(e.size >= 256 ? 0 : e.size, o);
    out.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    out.writeUInt8(0, o + 2);
    out.writeUInt8(0, o + 3);
    out.writeUInt16LE(1, o + 4);
    out.writeUInt16LE(32, o + 6);
    out.writeUInt32LE(e.buffer.length, o + 8);
    out.writeUInt32LE(e.offset, o + 12);
    o += 16;
  }
  for (const e of entries) {
    e.buffer.copy(out, e.offset);
  }
  return out;
}

async function main() {
  const logo = path.join(root, 'public/images/ansha-trading-logo.jpg');
  // Tight crop of the gear + "A" mark (square, no wordmark).
  const crop = { left: 30, top: 120, width: 520, height: 520 };
  const markBuf = await sharp(logo).extract(crop).png().toBuffer();

  async function squarePng(size, paddingRatio = 0.08) {
    const pad = Math.round(size * paddingRatio);
    const inner = Math.max(1, size - pad * 2);
    const resized = await sharp(markBuf)
      .resize(inner, inner, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    return sharp({
      create: { width: size, height: size, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: resized, left: pad, top: pad }])
      .png()
      .toBuffer();
  }

  async function maskablePng(size) {
    const pad = Math.round(size * 0.12);
    const inner = Math.max(1, size - pad * 2);
    const resized = await sharp(markBuf)
      .resize(inner, inner, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    return sharp({
      create: { width: size, height: size, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: resized, left: pad, top: pad }])
      .png()
      .toBuffer();
  }

  const favicon48 = await squarePng(48, 0.06);
  const files = {
    'public/icons/favicon-48.png': favicon48,
    'public/icons/icon-192.png': await squarePng(192, 0.08),
    'public/icons/icon-512.png': await squarePng(512, 0.08),
    'public/icons/apple-touch-icon.png': await squarePng(180, 0.08),
    'public/icons/icon-192-maskable.png': await maskablePng(192),
    'public/icons/icon-512-maskable.png': await maskablePng(512),
    'public/icons/icon-mark.png': markBuf,
  };

  for (const [rel, buf] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.writeFileSync(abs, buf);
    console.log('wrote', rel, buf.length);
  }

  const ico = createIco([
    { size: 16, buffer: await squarePng(16, 0.05) },
    { size: 32, buffer: await squarePng(32, 0.05) },
    { size: 48, buffer: favicon48 },
  ]);
  fs.writeFileSync(path.join(root, 'public/favicon.ico'), ico);
  console.log('wrote public/favicon.ico', ico.length);

  const ogW = 1200;
  const ogH = 630;
  const logoResized = await sharp(logo)
    .resize(Math.round(ogW * 0.78), Math.round(ogH * 0.62), {
      fit: 'inside',
      background: '#ffffff',
    })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logoResized).metadata();
  const left = Math.round((ogW - (logoMeta.width || 0)) / 2);
  const top = Math.round((ogH - (logoMeta.height || 0)) / 2);
  await sharp({
    create: { width: ogW, height: ogH, channels: 3, background: '#ffffff' },
  })
    .composite([{ input: logoResized, left, top }])
    .jpeg({ quality: 90 })
    .toFile(path.join(root, 'public/images/og-default.jpg'));
  console.log('wrote public/images/og-default.jpg');

  for (const f of ['_preview-mark.png', '_c1.png', '_c2.png', '_c3.png', '_c4.png']) {
    const p = path.join(root, 'public/icons', f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
