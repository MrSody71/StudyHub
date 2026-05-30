#!/usr/bin/env node
/**
 * Generates a placeholder 256×256 ICO file for StudyHub.
 * Output: build/icon.ico  (solid blue #3b82f6, PNG-compressed)
 *
 * To use your own icon:
 *   1. Create a 256×256 (or larger) image in any editor.
 *   2. Export / convert to .ico format (use IcoFX, GIMP, or an online
 *      converter such as convertico.com).
 *   3. Replace build/icon.ico with your file.
 *   This script will not overwrite an existing icon.ico.
 */

'use strict'
const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

// ── CRC-32 (needed for PNG chunks) ──────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = (c >>> 8) ^ CRC_TABLE[(c ^ b) & 0xFF]
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const lenBuf    = Buffer.allocUnsafe(4)
  const crcBuf    = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32BE(data.length, 0)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf])
}

// ── Build a solid-colour RGBA PNG ───────────────────────────────────────────
function solidPNG(width, height, r, g, b, a = 255) {
  // IHDR
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(width,  0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8]  = 8   // bit depth
  ihdr[9]  = 6   // colour type: RGBA
  ihdr[10] = 0   // compression
  ihdr[11] = 0   // filter
  ihdr[12] = 0   // interlace

  // Raw scanlines: 1 filter byte + width×4 RGBA bytes per row
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowBase = y * (1 + width * 4)
    raw[rowBase] = 0 // filter = None
    for (let x = 0; x < width; x++) {
      const px = rowBase + 1 + x * 4
      raw[px]     = r
      raw[px + 1] = g
      raw[px + 2] = b
      raw[px + 3] = a
    }
  }

  const idat = zlib.deflateSync(raw, { level: 1 }) // fast deflate

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Wrap a single PNG into an ICO container ─────────────────────────────────
// Uses the "PNG-compressed" ICO variant supported on Windows Vista+.
// Width/height byte = 0 means 256 per the ICO spec.
function pngToICO(pngBuf, size = 256) {
  const encodedSize = size === 256 ? 0 : size

  const header = Buffer.allocUnsafe(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = 1 (icon)
  header.writeUInt16LE(1, 4) // image count = 1

  const entry = Buffer.allocUnsafe(16)
  entry[0] = encodedSize // width
  entry[1] = encodedSize // height
  entry[2] = 0           // colour count (0 = true-colour)
  entry[3] = 0           // reserved
  entry.writeUInt16LE(1,              4)  // planes
  entry.writeUInt16LE(32,             6)  // bit count
  entry.writeUInt32LE(pngBuf.length,  8)  // image data size
  entry.writeUInt32LE(22,            12)  // offset = 6 + 16

  return Buffer.concat([header, entry, pngBuf])
}

// ── Main ─────────────────────────────────────────────────────────────────────
const BUILD_DIR = path.join(__dirname, '..', 'build')
const OUT_PATH  = path.join(BUILD_DIR, 'icon.ico')

fs.mkdirSync(BUILD_DIR, { recursive: true })

if (fs.existsSync(OUT_PATH)) {
  console.log('build/icon.ico already exists — skipping generation.')
  console.log('Delete it and re-run to regenerate, or replace it with your own icon.')
  process.exit(0)
}

// Brand blue: #3b82f6 = rgb(59, 130, 246)
const png = solidPNG(256, 256, 59, 130, 246)
const ico = pngToICO(png, 256)
fs.writeFileSync(OUT_PATH, ico)

console.log('✓ Placeholder icon created: build/icon.ico')
console.log('  Size: 256×256, colour: #3b82f6 (StudyHub blue)')
console.log()
console.log('  To replace with your own icon:')
console.log('  1. Prepare a 256×256 (or 512×512) image (PNG or any format).')
console.log('  2. Convert to .ico (IcoFX, GIMP "Export As", or convertico.com).')
console.log('  3. Overwrite build/icon.ico — the new icon will be used on next build.')
