const MUSIC_CACHE_DB_NAME = "order332-music-cache"
const MUSIC_CACHE_DB_VERSION = 1
const MUSIC_CACHE_STORE = "tracks"

export const DEFAULT_MUSIC_CACHE_MAX_BYTES = 150 * 1024 * 1024

const MIN_FREE_SPACE_BYTES = 12 * 1024 * 1024
const inFlightWarmups = new Map<string, Promise<CacheWarmResult>>()

let dbPromise: Promise<IDBDatabase> | null = null
let persistRequested = false

interface CachedTrackRecord {
  key: string
  userId: string
  trackId: string
  sourceUrl: string
  blob: Blob
  sizeBytes: number
  updatedAt: number
  lastAccessedAt: number
}

export interface CachedTrackSource {
  src: string
  sizeBytes: number
  release: () => void
}

export type CacheWarmResult = "cached" | "skipped" | "aborted"

function isSupported(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function trackCacheKey(userId: string, trackId: string): string {
  return `${userId}:${trackId}`
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(MUSIC_CACHE_DB_NAME, MUSIC_CACHE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MUSIC_CACHE_STORE)) {
        const store = db.createObjectStore(MUSIC_CACHE_STORE, {
          keyPath: "key",
        })
        store.createIndex("by_user", "userId", { unique: false })
        store.createIndex("by_user_access", ["userId", "lastAccessedAt"], {
          unique: false,
        })
        store.createIndex("by_access", "lastAccessedAt", { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open music cache DB"))
  })

  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error("IDB transaction aborted"))
    tx.onerror = () => reject(tx.error ?? new Error("IDB transaction failed"))
  })
}

async function requestPersistentStorageIfNeeded(): Promise<void> {
  if (persistRequested) return
  persistRequested = true
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return
  try {
    await navigator.storage.persist()
  } catch {
    // Best effort only.
  }
}

async function estimateHasSpaceFor(bytes: number): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate)
    return true
  try {
    const { usage, quota } = await navigator.storage.estimate()
    const usageNum = typeof usage === "number" ? usage : Number.NaN
    const quotaNum = typeof quota === "number" ? quota : Number.NaN
    if (!Number.isFinite(usageNum) || !Number.isFinite(quotaNum)) return true
    return quotaNum - usageNum >= bytes + MIN_FREE_SPACE_BYTES
  } catch {
    return true
  }
}

async function getRecord(
  db: IDBDatabase,
  key: string
): Promise<CachedTrackRecord | null> {
  const tx = db.transaction(MUSIC_CACHE_STORE, "readonly")
  const store = tx.objectStore(MUSIC_CACHE_STORE)

  const value = await new Promise<CachedTrackRecord | null>(
    (resolve, reject) => {
      const req = store.get(key)
      req.onsuccess = () =>
        resolve((req.result as CachedTrackRecord | undefined) ?? null)
      req.onerror = () =>
        reject(req.error ?? new Error("Failed to read cached track"))
    }
  )

  await txDone(tx)
  return value
}

async function putRecord(
  db: IDBDatabase,
  record: CachedTrackRecord
): Promise<void> {
  const tx = db.transaction(MUSIC_CACHE_STORE, "readwrite")
  const store = tx.objectStore(MUSIC_CACHE_STORE)
  store.put(record)
  await txDone(tx)
}

async function listAllRecords(db: IDBDatabase): Promise<CachedTrackRecord[]> {
  const tx = db.transaction(MUSIC_CACHE_STORE, "readonly")
  const store = tx.objectStore(MUSIC_CACHE_STORE)
  const rows: CachedTrackRecord[] = []

  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor()
    req.onerror = () =>
      reject(req.error ?? new Error("Failed to read music cache"))
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve()
        return
      }
      rows.push(cursor.value as CachedTrackRecord)
      cursor.continue()
    }
  })

  await txDone(tx)
  return rows
}

async function deleteByKeys(db: IDBDatabase, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const tx = db.transaction(MUSIC_CACHE_STORE, "readwrite")
  const store = tx.objectStore(MUSIC_CACHE_STORE)
  for (const key of keys) store.delete(key)
  await txDone(tx)
}

async function enforceCacheBudget(
  db: IDBDatabase,
  maxBytes: number
): Promise<void> {
  const records = await listAllRecords(db)
  let total = records.reduce((sum, record) => sum + record.sizeBytes, 0)
  if (total <= maxBytes) return

  const ordered = [...records].sort((a, b) => {
    if (a.lastAccessedAt !== b.lastAccessedAt) {
      return a.lastAccessedAt - b.lastAccessedAt
    }
    return a.updatedAt - b.updatedAt
  })

  const keysToDelete: string[] = []
  for (const record of ordered) {
    if (total <= maxBytes) break
    total -= record.sizeBytes
    keysToDelete.push(record.key)
  }

  await deleteByKeys(db, keysToDelete)
}

export async function getCachedTrackSource(
  userId: string,
  trackId: string
): Promise<CachedTrackSource | null> {
  if (!isSupported()) return null

  const db = await openDb()
  const key = trackCacheKey(userId, trackId)
  const record = await getRecord(db, key)
  if (!record) return null

  record.lastAccessedAt = Date.now()
  void putRecord(db, record)

  const objectUrl = URL.createObjectURL(record.blob)
  let released = false

  return {
    src: objectUrl,
    sizeBytes: record.sizeBytes,
    release: () => {
      if (released) return
      released = true
      URL.revokeObjectURL(objectUrl)
    },
  }
}

export async function warmTrackCache(params: {
  userId: string
  trackId: string
  sourceUrl: string
  signal?: AbortSignal
  maxBytes?: number
}): Promise<CacheWarmResult> {
  if (!isSupported()) return "skipped"

  const {
    userId,
    trackId,
    sourceUrl,
    signal,
    maxBytes = DEFAULT_MUSIC_CACHE_MAX_BYTES,
  } = params
  const key = trackCacheKey(userId, trackId)

  const inFlight = inFlightWarmups.get(key)
  if (inFlight) return inFlight

  const task = (async (): Promise<CacheWarmResult> => {
    if (signal?.aborted) return "aborted"

    try {
      await requestPersistentStorageIfNeeded()
      const response = await fetch(sourceUrl, {
        signal,
        cache: "no-store",
      })

      if (signal?.aborted) return "aborted"
      if (!response.ok) return "skipped"

      const contentType = response.headers.get("content-type") ?? ""
      if (
        contentType &&
        !contentType.startsWith("audio/") &&
        !contentType.startsWith("application/octet-stream")
      ) {
        return "skipped"
      }

      const blob = await response.blob()
      if (signal?.aborted) return "aborted"
      if (!blob.size || blob.size > maxBytes) return "skipped"

      const hasSpace = await estimateHasSpaceFor(blob.size)
      if (!hasSpace) return "skipped"

      const now = Date.now()
      const db = await openDb()
      await putRecord(db, {
        key,
        userId,
        trackId,
        sourceUrl,
        blob,
        sizeBytes: blob.size,
        updatedAt: now,
        lastAccessedAt: now,
      })

      await enforceCacheBudget(db, maxBytes)
      return "cached"
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        signal?.aborted
      ) {
        return "aborted"
      }
      return "skipped"
    }
  })()

  inFlightWarmups.set(key, task)

  try {
    return await task
  } finally {
    inFlightWarmups.delete(key)
  }
}

export async function purgeMusicCacheForUser(userId: string): Promise<void> {
  if (!isSupported()) return
  const db = await openDb()
  const tx = db.transaction(MUSIC_CACHE_STORE, "readwrite")
  const store = tx.objectStore(MUSIC_CACHE_STORE)
  const index = store.index("by_user")

  await new Promise<void>((resolve, reject) => {
    const req = index.openKeyCursor(IDBKeyRange.only(userId))
    req.onerror = () =>
      reject(req.error ?? new Error("Failed to purge user music cache"))
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve()
        return
      }
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
  })

  await txDone(tx)
}

export async function purgeAllMusicCache(): Promise<void> {
  if (!isSupported()) return
  const db = await openDb()
  const tx = db.transaction(MUSIC_CACHE_STORE, "readwrite")
  tx.objectStore(MUSIC_CACHE_STORE).clear()
  await txDone(tx)
}
