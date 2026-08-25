#!/usr/bin/env node
// ★ แปลงไฟล์ .gat (GRAT 1.2) → maps-gat/<map>.json (RLE compact) สำหรับ GAT wander ใน userscript
//   ใช้: node scripts/gat2json.js <โฟลเดอร์ที่มี .gat> [โฟลเดอร์ปลายทาง=maps-gat]
//   format .gat: [magic 4B "GRAT"][ver 2B][w i32][h i32] + ต่อ cell 20B = ความสูง4มุม(f32) + type(u32)
//   type 0 = เดินได้ (อื่น ๆ = กันเดิน/น้ำ) — เก็บค่าดิบทั้งหมด RLE เป็น "type x count" คั่นด้วย ,
const fs = require('fs');
const path = require('path');

const srcDir = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, '..', 'maps-gat');
if (!srcDir) { console.error('ใช้: node scripts/gat2json.js <โฟลเดอร์ .gat> [ปลายทาง]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.toLowerCase().endsWith('.gat'));
let ok = 0, fail = 0, totalOut = 0;
for (const f of files) {
  try {
    const b = fs.readFileSync(path.join(srcDir, f));
    const magic = b.toString('ascii', 0, 4);
    if (magic !== 'GRAT') throw new Error('magic ไม่ใช่ GRAT: ' + magic);
    const ver = b.readUInt8(4) + '.' + b.readUInt8(5);
    const w = b.readInt32LE(6), h = b.readInt32LE(10);
    if (w <= 0 || h <= 0 || w * h > 4000000) throw new Error('ขนาดแปลก: ' + w + 'x' + h);
    if (14 + w * h * 20 !== b.length) throw new Error('size mismatch: header+' + w + '*' + h + '*20 != ' + b.length + ' (ver ' + ver + ')');
    // RLE ค่า type
    const runs = [];
    let cur = -1, cnt = 0;
    for (let i = 0; i < w * h; i++) {
      const t = b.readUInt32LE(14 + i * 20 + 16);
      if (t === cur) cnt++;
      else { if (cnt) runs.push(cur + 'x' + cnt); cur = t; cnt = 1; }
    }
    runs.push(cur + 'x' + cnt);
    const mapName = f.replace(/\.gat$/i, '');
    const json = JSON.stringify({ map: mapName, w, h, rle: runs.join(',') });
    fs.writeFileSync(path.join(outDir, mapName + '.json'), json);
    totalOut += json.length;
    ok++;
  } catch (e) {
    console.error('✗ ' + f + ': ' + e.message);
    fail++;
  }
}
console.log('แปลงสำเร็จ ' + ok + ' ไฟล์' + (fail ? ' · พ้ม ' + fail + ' ไฟล์' : '') + ' · รวม ' + (totalOut / 1024).toFixed(0) + ' KB → ' + outDir);
