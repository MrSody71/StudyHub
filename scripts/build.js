#!/usr/bin/env node
/**
 * Pre-build helper + electron-builder launcher for Windows.
 *
 * Background
 * ----------
 * electron-builder uses two separate download mechanisms for its tooling:
 *
 *   Node.js (getBin)  →  {LOCALAPPDATA}\electron-builder\Cache\{name}\{name}-{ver}\
 *     downloads: winCodeSign, nsis, nsis-3.node
 *
 *   Go app-builder    →  {LOCALAPPDATA}\electron-builder\{name}-{ver}\
 *     downloads: nsis-resources (needed to build the installer UI)
 *
 * Both mechanisms' Go/Node downloaders time out on GitHub CDN in some network
 * environments. We pre-warm both caches ourselves using system curl (which
 * handles CDN redirects reliably).
 *
 * Additionally, winCodeSign-2.6.0.7z contains macOS symlinks
 * (libcrypto.dylib, libssl.dylib). Windows can't create them without
 * Developer Mode → 7-zip exits with code 2 → electron-builder aborts.
 * Fix: extract ignoring exit code, create empty placeholder files.
 *
 * Usage:  node scripts/build.js [nsis|portable]
 */
'use strict'

const fs    = require('fs')
const path  = require('path')
const os    = require('os')
const { spawnSync, execSync } = require('child_process')

// ── Paths ─────────────────────────────────────────────────────────────────────

const LOCAL_APP_DATA =
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')

// Node.js electron-builder cache root
const NODE_CACHE = path.join(LOCAL_APP_DATA, 'electron-builder', 'Cache')

// Go app-builder cache root (different — no "Cache" subdir)
const GO_CACHE = path.join(LOCAL_APP_DATA, 'electron-builder')

const SEVENZIP = path.join(
  __dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'
)

// ── Artifacts to pre-warm ─────────────────────────────────────────────────────

const ARTIFACTS = [
  {
    // Code-signing / PE-resource tools — used by Node.js electron-builder
    name:     'winCodeSign',
    version:  '2.6.0',
    url:      'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z',
    cacheDir: path.join(NODE_CACHE, 'winCodeSign', 'winCodeSign-2.6.0'),
    // These two darwin entries are macOS symlinks; 7-zip exits 2 on Windows.
    // Create them as empty placeholder files — they're never used on Windows.
    darwinPlaceholders: [
      path.join('darwin', '10.12', 'lib', 'libcrypto.dylib'),
      path.join('darwin', '10.12', 'lib', 'libssl.dylib'),
    ],
  },
  {
    // NSIS installer UI resources — used by Go app-builder.
    // The Go binary receives ELECTRON_BUILDER_CACHE from Node.js and stores
    // artifacts as {CACHE_ROOT}/{name-with-version}/ (flat, no extra subdir).
    name:     'nsis-resources',
    version:  '3.4.1',
    url:      'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z',
    cacheDir: path.join(NODE_CACHE, 'nsis-resources-3.4.1'),
    darwinPlaceholders: [],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function extract(zipPath, destDir) {
  // Ignore exit code: code 2 is expected when the archive contains macOS
  // symlinks. All other files extract cleanly regardless.
  spawnSync(SEVENZIP, ['x', '-bd', '-y', zipPath, `-o${destDir}`], {
    stdio: ['ignore', 'ignore', 'ignore'],
  })
}

function ensureArtifact({ name, version, url, cacheDir, darwinPlaceholders }) {
  // Repair missing darwin placeholders even if the directory already exists
  if (fs.existsSync(cacheDir)) {
    let fixed = 0
    for (const rel of darwinPlaceholders) {
      const full = path.join(cacheDir, rel)
      if (!fs.existsSync(full)) {
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, '')
        fixed++
      }
    }
    if (fixed) process.stdout.write(` (fixed ${fixed} placeholder(s))`)
    console.log(`✓ ${name}-${version} cache OK`)
    return
  }

  // ── Fresh download ────────────────────────────────────────────────────────
  const cacheRoot = path.dirname(cacheDir)
  fs.mkdirSync(cacheRoot, { recursive: true })
  const zipPath = path.join(cacheRoot, `${name}-${version}.7z`)

  process.stdout.write(`  Downloading ${name}-${version}... `)
  const dl = spawnSync('curl', ['-sL', '-o', zipPath, url], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (dl.status !== 0) {
    throw new Error(`curl failed (exit ${dl.status}) downloading ${url}`)
  }
  console.log('done')

  // ── Extract ───────────────────────────────────────────────────────────────
  process.stdout.write(`  Extracting ${name}-${version}... `)
  fs.mkdirSync(cacheDir, { recursive: true })
  extract(zipPath, cacheDir)

  // Create placeholder files for darwin symlinks
  for (const rel of darwinPlaceholders) {
    const full = path.join(cacheDir, rel)
    if (!fs.existsSync(full)) {
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, '')
    }
  }

  try { fs.unlinkSync(zipPath) } catch { /* best-effort */ }
  console.log('done')
  console.log(`✓ ${name}-${version} ready`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

const target = process.argv[2] || 'nsis'
if (target !== 'nsis' && target !== 'portable') {
  console.error(`Unknown target "${target}". Use "nsis" or "portable".`)
  process.exit(1)
}

try {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

  console.log('Checking build tool caches...')
  for (const artifact of ARTIFACTS) {
    ensureArtifact(artifact)
  }

  console.log(`\nBuilding Windows target: ${target}`)
  execSync(`electron-builder --win ${target} --x64`, { stdio: 'inherit' })
} catch (err) {
  console.error('\nBuild failed:', err.message)
  process.exit(1)
}
