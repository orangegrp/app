#!/usr/bin/env node
/**
 * Downloads WebVM ext2 disk images into public/webpc-disks/.
 *
 * disks.webvm.io returns 500 for bare GET /file.ext2 but serves data with
 * ?s=<start>&e=<end> (end inclusive), matching CheerpX CloudDevice HTTP fallback.
 *
 * Debian is also mirrored on GitHub releases (plain HTTPS).
 *
 * Optional: WEBPC_ALPINE_DISK_URL overrides the default alpine source.
 *
 * Run: pnpm fetch-webpc-disks
 */
import { mkdir, open } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'webpc-disks')

/** 4 MiB chunks — fewer round trips than 4 KiB */
const CHUNK = 4 * 1024 * 1024

const DISKS = [
  {
    file: 'debian_large_20230522_5044875331_2.ext2',
    sources: [
      'https://github.com/leaningtech/webvm/releases/download/ext2_image/debian_large_20230522_5044875331.ext2',
      'https://disks.webvm.io/debian_large_20230522_5044875331_2.ext2',
    ],
  },
  {
    file: 'alpine_20251007.ext2',
    sources: [
      process.env.WEBPC_ALPINE_DISK_URL,
      'https://disks.webvm.io/alpine_20251007.ext2',
    ].filter(Boolean),
  },
]

async function downloadStreamToFile(url, destPath) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  const len = res.headers.get('content-length')
  console.log(`fetch-webpc-disks: streaming (${len ? `${len} bytes` : 'unknown size'})`)
  await mkdir(dirname(destPath), { recursive: true })
  const out = createWriteStream(destPath)
  await pipeline(Readable.fromWeb(res.body), out)
}

/**
 * HEAD with ?s=0&e=0 returns full image Content-Length (CheerpX disk API).
 */
async function readTotalBytes(baseUrl) {
  const u = new URL(baseUrl)
  u.searchParams.set('s', '0')
  u.searchParams.set('e', '0')
  const res = await fetch(u, { method: 'HEAD', redirect: 'follow' })
  if (!res.ok) throw new Error(`HEAD ${u} → ${res.status}`)
  const len = res.headers.get('content-length')
  if (!len) throw new Error(`HEAD missing Content-Length: ${baseUrl}`)
  return parseInt(len, 10)
}

async function downloadViaDiskQueryChunks(baseUrl, destPath) {
  const total = await readTotalBytes(baseUrl)
  console.log(`fetch-webpc-disks: ${destPath} (${total} bytes, chunked ?s=&e=)`)
  await mkdir(dirname(destPath), { recursive: true })
  const fh = await open(destPath, 'w')
  try {
    let pos = 0
    while (pos < total) {
      const end = Math.min(pos + CHUNK - 1, total - 1)
      const u = new URL(baseUrl)
      u.searchParams.set('s', String(pos))
      u.searchParams.set('e', String(end))
      const res = await fetch(u, { redirect: 'follow' })
      if (!res.ok) throw new Error(`GET ${u} → ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const expected = end - pos + 1
      if (buf.length !== expected) {
        throw new Error(`Chunk ${pos}-${end}: expected ${expected} bytes, got ${buf.length}`)
      }
      await fh.write(buf, 0, buf.length, pos)
      pos = end + 1
      if (pos % (64 * 1024 * 1024) < CHUNK || pos >= total) {
        console.log(`fetch-webpc-disks: … ${Math.min(pos, total)}/${total}`)
      }
    }
  } finally {
    await fh.close()
  }
}

async function downloadDisk({ file, sources }, destPath) {
  let lastErr
  for (const url of sources) {
    try {
      const useChunks = url.includes('disks.webvm.io')
      if (useChunks) await downloadViaDiskQueryChunks(url, destPath)
      else await downloadStreamToFile(url, destPath)
      console.log(`fetch-webpc-disks: wrote ${file}`)
      return
    } catch (e) {
      lastErr = e
      console.warn(`fetch-webpc-disks: ${url} failed:`, e instanceof Error ? e.message : e)
    }
  }
  throw lastErr ?? new Error(`No sources left for ${file}`)
}

for (const spec of DISKS) {
  const dest = join(OUT_DIR, spec.file)
  await downloadDisk(spec, dest)
}
console.log('fetch-webpc-disks: done')
