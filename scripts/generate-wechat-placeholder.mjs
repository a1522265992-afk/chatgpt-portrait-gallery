import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const width = 420;
const height = 420;
const pixels = Buffer.alloc(width * height * 4, 255);

function paint(x, y, w, h, [r, g, b, a = 255]) {
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
      const offset = (py * width + px) * 4;
      pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = a;
    }
  }
}

const ink = [23, 23, 23, 255];
const lime = [200, 255, 36, 255];
const cell = 15;

function finder(cx, cy) {
  paint(cx, cy, cell * 7, cell * 7, ink);
  paint(cx + cell, cy + cell, cell * 5, cell * 5, [255, 255, 255, 255]);
  paint(cx + cell * 2, cy + cell * 2, cell * 3, cell * 3, ink);
}

finder(30, 30); finder(285, 30); finder(30, 285);
for (let y = 2; y < 26; y += 1) {
  for (let x = 2; x < 26; x += 1) {
    if ((x < 9 && y < 9) || (x > 18 && y < 9) || (x < 9 && y > 18)) continue;
    if ((x * 13 + y * 7 + x * y) % 5 < 2) paint(x * cell, y * cell, 11, 11, ink);
  }
}
paint(145, 145, 130, 130, lime);
paint(160, 160, 100, 100, ink);
paint(175, 175, 70, 70, [255, 255, 255, 255]);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let c = value;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

const raw = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const row = y * (width * 4 + 1);
  raw[row] = 0;
  pixels.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
header[8] = 8; header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../public/wechat-qr.png', import.meta.url), png);
