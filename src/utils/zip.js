// A tiny ZIP writer (no extra package): zip a folder into a Buffer.
// Used for the weekly backup DM and the backup in `npm run menu`.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
    date:
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

/** All files below `dir` (relative paths with "/"), skipping what `skip(rel)` says. */
function listFiles(dir, skip = () => false, prefix = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, prefix), {
    withFileTypes: true,
  })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (skip(rel, e.isDirectory())) continue;
    if (e.isDirectory()) out.push(...listFiles(dir, skip, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

/**
 * Zip the files below `dir` into a Buffer.
 * skip(rel, isDir) → true leaves a file or folder out.
 */
function zipFolder(dir, skip) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const files = listFiles(dir, skip);
  for (const rel of files) {
    const data = fs.readFileSync(path.join(dir, rel));
    const packed = zlib.deflateRawSync(data);
    const name = Buffer.from(rel, 'utf8');
    const crc = crc32(data);
    const { time, date } = dosTime(fs.statSync(path.join(dir, rel)).mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return {
    buffer: Buffer.concat([...locals, ...centrals, end]),
    files: files.length,
  };
}

module.exports = { zipFolder };
