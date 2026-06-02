#!/usr/bin/env node
/**
 * Generates a placeholder ICO file for StudyHub.
 * Output: build/icon.ico  (BMP DIB ICO, sizes: 16, 32, 48, 256)
 *
 * Uses proper BMP DIB format (no PNG compression) so electron-builder,
 * Windows Explorer, and every other tool can read it without issue.
 *
 * To use your own icon:
 *   1. Create a 256×256 (or larger) image in any editor.
 *   2. Export / convert to .ico format (IcoFX, GIMP, or an online
 *      converter such as convertico.com).
 *   3. Replace build/icon.ico with your file.
 *   This script will not overwrite an existing icon.ico.
 */

'use strict'
const fs   = require('fs')
const path = require('path')

// ── BMP DIB image for use inside an ICO ──────────────────────────────────────
// Returns BITMAPINFOHEADER + XOR mask (BGRA, bottom-up) + AND mask (all zeros).
function solidBMP(size, r, g, b) {
  const pixelsSize  = size * size * 4
  const maskRowSize = Math.ceil(size / 32) * 4   // padded to DWORD
  const maskSize    = maskRowSize * size

  // BITMAPINFOHEADER (40 bytes)
  const hdr = Buffer.alloc(40)
  hdr.writeUInt32LE(40,        0)   // biSize
  hdr.writeInt32LE(size,       4)   // biWidth
  hdr.writeInt32LE(size * 2,   8)   // biHeight (×2 covers XOR + AND masks)
  hdr.writeUInt16LE(1,        12)   // biPlanes
  hdr.writeUInt16LE(32,       14)   // biBitCount (32-bit BGRA)
  // biCompression … biClrImportant all zero

  // XOR mask — solid colour, BGRA, rows stored bottom-up
  const px = Buffer.alloc(pixelsSize)
  for (let row = 0; row < size; row++) {
    const base = (size - 1 - row) * size * 4  // flip to bottom-up
    for (let col = 0; col < size; col++) {
      const i = base + col * 4
      px[i]     = b
      px[i + 1] = g
      px[i + 2] = r
      px[i + 3] = 255
    }
  }

  // AND mask — all zeros (fully opaque)
  return Buffer.concat([hdr, px, Buffer.alloc(maskSize)])
}

// ── Pack multiple BMP images into one ICO ────────────────────────────────────
function buildICO(sizes, r, g, b) {
  const images = sizes.map(s => solidBMP(s, r, g, b))

  const icoHdr = Buffer.alloc(6)
  icoHdr.writeUInt16LE(0,           0)   // reserved
  icoHdr.writeUInt16LE(1,           2)   // type = ICO
  icoHdr.writeUInt16LE(sizes.length, 4)  // image count

  const dirs  = []
  let offset  = 6 + sizes.length * 16

  for (let i = 0; i < sizes.length; i++) {
    const s   = sizes[i]
    const dir = Buffer.alloc(16)
    dir[0] = s === 256 ? 0 : s   // 0 encodes 256 per ICO spec
    dir[1] = s === 256 ? 0 : s
    dir[2] = 0                    // bColorCount (0 = true-colour)
    dir[3] = 0                    // bReserved
    dir.writeUInt16LE(1,               4)   // wPlanes
    dir.writeUInt16LE(32,              6)   // wBitCount
    dir.writeUInt32LE(images[i].length, 8)  // dwBytesInRes
    dir.writeUInt32LE(offset,          12)  // dwImageOffset
    offset += images[i].length
    dirs.push(dir)
  }

  return Buffer.concat([icoHdr, ...dirs, ...images])
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
const ico = buildICO([16, 32, 48, 256], 59, 130, 246)
fs.writeFileSync(OUT_PATH, ico)

console.log('✓ Placeholder icon created: build/icon.ico')
console.log('  Sizes: 16×16, 32×32, 48×48, 256×256  |  colour: #3b82f6 (BMP DIB ICO)')
console.log()
console.log('  To replace with your own icon:')
console.log('  1. Prepare a 256×256 (or 512×512) image (PNG or any format).')
console.log('  2. Convert to .ico (IcoFX, GIMP "Export As", or convertico.com).')
console.log('  3. Overwrite build/icon.ico — the new icon will be used on next build.')
