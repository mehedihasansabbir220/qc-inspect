// Generates PNG app icons with zero dependencies (raw PNG encoding via zlib).
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function png(size, rounded) {
  const bg = [15, 23, 42], fg = [52, 211, 153];
  const r = rounded ? size * 0.22 : 0;
  const s = size / 512;
  const pts = [[150 * s, 268 * s], [222 * s, 340 * s], [372 * s, 180 * s]];
  const w = 24 * s;
  const distSeg = (px, py, [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
      const outside = cx < r && cy < r && Math.hypot(r - cx, r - cy) > r;
      const d = Math.min(distSeg(x, y, pts[0], pts[1]), distSeg(x, y, pts[1], pts[2]));
      const c = d < w ? fg : bg;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = outside ? 0 : 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192, false));
writeFileSync('public/icon-512.png', png(512, false));
writeFileSync('public/apple-touch-icon.png', png(180, false));
console.log('icons written');
