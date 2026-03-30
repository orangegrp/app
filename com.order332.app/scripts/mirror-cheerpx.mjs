#!/usr/bin/env node
/**
 * Downloads the CheerpX ESM bundle (and tun/* chunks) from the upstream CDN
 * into public/cheerpx/{version}/ for same-origin loading. Run: pnpm mirror-cheerpx
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_ROOT = join(__dirname, '..', 'public', 'cheerpx', '1.2.9')
const BASE = 'https://cxrtnc.leaningtech.com/1.2.9/'

const patterns = [
  /import\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g,
  // import ipStackAwait from "./ipstack.js"
  /from\s+['"](\.\/[^'"]+)['"]/g,
  // import "./wasm_exec.js" (side-effect only — not matched by "from")
  /import\s+['"](\.\/[^'"]+)['"]/g,
  /['"](\.\/[^'"]+\.wasm)['"]/g,
  // cx_esm.js loads cheerpOS.js, cxcore.js, etc. via script tags — bare filenames, same dir
  /['"]([a-zA-Z0-9][a-zA-Z0-9_./-]*\.(?:js|mjs|wasm))['"]/g,
]

function dirOf(fromPath) {
  return fromPath.includes('/') ? fromPath.replace(/\/[^/]+$/, '/') : ''
}

/** Resolve ./foo, tun/bar.js, or bare cheerpOS.js relative to fromPath's directory */
function resolveAssetPath(fromPath, raw) {
  if (raw.startsWith('/')) return null
  const baseDir = dirOf(fromPath)
  if (raw.startsWith('./')) return baseDir + raw.slice(2)
  return baseDir + raw
}

async function crawl() {
  const queue = ['cx.esm.js']
  const seen = new Set()
  while (queue.length) {
    const path = queue.shift()
    if (seen.has(path)) continue
    seen.add(path)
    const url = BASE + path
    const res = await fetch(url)
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const outPath = join(OUT_ROOT, path)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, buf)
    const isJs = path.endsWith('.js') || path.endsWith('.mjs')
    if (!isJs) continue
    const full = buf.toString('utf8')
    for (const re of patterns) {
      let m
      re.lastIndex = 0
      while ((m = re.exec(full))) {
        const raw = m[1]
        const next = resolveAssetPath(path, raw)
        if (next && !seen.has(next)) queue.push(next)
      }
    }
  }
  return seen
}

const files = await crawl()
console.log(`mirror-cheerpx: wrote ${files.size} files under public/cheerpx/1.2.9/`)
