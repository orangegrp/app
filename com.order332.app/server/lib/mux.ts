import "server-only"

export type MuxAssetStatus = "preparing" | "ready" | "errored"

export interface MuxDirectUpload {
  id: string
  url: string
  status: string
  assetId: string | null
}

export interface MuxPlaybackId {
  id: string
  policy: "public" | "signed" | "drm"
}

export interface MuxAsset {
  id: string
  status: MuxAssetStatus
  duration: number | null
  aspectRatio: string | null
  playbackIds: MuxPlaybackId[]
  masterAccess: "none" | "temporary" | null
  masterStatus: "preparing" | "ready" | "errored" | null
  masterUrl: string | null
  errors: { type?: string; messages?: string[] } | null
}

function cleanEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

interface MuxCredentials {
  tokenId: string
  tokenSecret: string
}

function getMuxCredentials(): MuxCredentials {
  const tokenId = cleanEnvValue(process.env.MUX_TOKEN_ID)
  const tokenSecret = cleanEnvValue(process.env.MUX_TOKEN_SECRET)

  if (!tokenId || !tokenSecret) {
    throw new Error(
      "Mux API credentials are not configured (set MUX_TOKEN_ID and MUX_TOKEN_SECRET)"
    )
  }

  return { tokenId, tokenSecret }
}

export async function getMuxWhoAmI(): Promise<{
  organizationId: string | null
  organizationName: string | null
  environmentId: string | null
  environmentName: string | null
  environmentType: string | null
  accessTokenName: string | null
}> {
  const json = await muxRequest<{
    data: {
      organization_id?: string
      organization_name?: string
      environment_id?: string
      environment_name?: string
      environment_type?: string
      access_token_name?: string
    }
  }>("/system/v1/whoami")

  return {
    organizationId: json.data.organization_id ?? null,
    organizationName: json.data.organization_name ?? null,
    environmentId: json.data.environment_id ?? null,
    environmentName: json.data.environment_name ?? null,
    environmentType: json.data.environment_type ?? null,
    accessTokenName: json.data.access_token_name ?? null,
  }
}

function muxAuthHeaderFor(credentials: MuxCredentials): string {
  const encoded = Buffer.from(
    `${credentials.tokenId}:${credentials.tokenSecret}`
  ).toString("base64")
  return `Basic ${encoded}`
}

async function muxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url =
    path.startsWith("/video/") || path.startsWith("/system/")
      ? `https://api.mux.com${path}`
      : `https://api.mux.com/video/v1${path}`

  const credentials = getMuxCredentials()
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: muxAuthHeaderFor(credentials),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { messages?: string[]; message?: string }
    }
    const detail =
      body.error?.messages?.join("; ") ??
      body.error?.message ??
      `Mux request failed: ${res.status}`

    if (res.status === 401) {
      throw new Error(
        `${detail}. Verify MUX_TOKEN_ID and MUX_TOKEN_SECRET match the same Mux Video API access token and server was restarted after env changes.`
      )
    }

    throw new Error(detail)
  }

  if (res.status === 204) return {} as T
  return (await res.json()) as T
}

export async function createMuxDirectUpload(params: {
  corsOrigin?: string
  passthrough?: string
}): Promise<MuxDirectUpload> {
  const payload: Record<string, unknown> = {
    new_asset_settings: {
      playback_policies: ["signed"],
      video_quality: "basic",
      master_access: "temporary",
    },
  }

  if (params.corsOrigin) payload.cors_origin = params.corsOrigin
  if (params.passthrough) {
    ;(payload.new_asset_settings as Record<string, unknown>).passthrough =
      params.passthrough
  }

  const json = await muxRequest<{
    data: { id: string; url: string; status: string; asset_id?: string | null }
  }>("/uploads", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  return {
    id: json.data.id,
    url: json.data.url,
    status: json.data.status,
    assetId: json.data.asset_id ?? null,
  }
}

export async function getMuxDirectUpload(
  uploadId: string
): Promise<MuxDirectUpload> {
  const json = await muxRequest<{
    data: { id: string; url: string; status: string; asset_id?: string | null }
  }>(`/uploads/${encodeURIComponent(uploadId)}`)

  return {
    id: json.data.id,
    url: json.data.url,
    status: json.data.status,
    assetId: json.data.asset_id ?? null,
  }
}

export async function getMuxAsset(assetId: string): Promise<MuxAsset> {
  const json = await muxRequest<{
    data: {
      id: string
      status: MuxAssetStatus
      duration?: number
      aspect_ratio?: string
      playback_ids?: Array<{ id: string; policy: "public" | "signed" | "drm" }>
      master_access?: "none" | "temporary"
      master?: { status?: "preparing" | "ready" | "errored"; url?: string }
      errors?: { type?: string; messages?: string[] }
    }
  }>(`/assets/${encodeURIComponent(assetId)}`)

  const data = json.data
  return {
    id: data.id,
    status: data.status,
    duration: typeof data.duration === "number" ? data.duration : null,
    aspectRatio: data.aspect_ratio ?? null,
    playbackIds: data.playback_ids ?? [],
    masterAccess: data.master_access ?? null,
    masterStatus: data.master?.status ?? null,
    masterUrl: data.master?.url ?? null,
    errors: data.errors ?? null,
  }
}

export async function enableMuxMasterAccess(assetId: string): Promise<void> {
  await muxRequest(`/assets/${encodeURIComponent(assetId)}/master-access`, {
    method: "PUT",
    body: JSON.stringify({ master_access: "temporary" }),
  })
}

export async function deleteMuxAsset(assetId: string): Promise<void> {
  await muxRequest(`/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  })
}
