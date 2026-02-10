import { type NextRequest, NextResponse } from "next/server"
import { getChannels } from "@/lib/channels"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/**
 * HLS Proxy with catch-all routing
 *
 * URL patterns:
 *   /api/proxy/CHANNEL_ID.m3u8          → channel entry point (playlist)
 *   /api/proxy/s?url=ENCODED_URL        → resource proxy (sub-playlists, .ts segments, keys, etc.)
 *   /api/proxy/s?url=ENCODED&h=ENCODED  → resource proxy with custom headers
 *
 * The key insight: rewritten URLs inside playlists use /api/proxy/s?url= so
 * the player transparently fetches every sub-resource through our proxy.
 * For sub-playlists (.m3u8), we re-rewrite them too, so the chain is fully proxied.
 */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type, Content-Range",
  "Access-Control-Max-Age": "86400",
}

// ── OPTIONS preflight ──────────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ── HEAD support (some players probe with HEAD first) ──────────────────────
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const res = await GET(request, { params })
  return new NextResponse(null, { status: res.status, headers: res.headers })
}

// ── Main GET handler ───────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params
  const url = new URL(request.url)
  const origin = url.origin

  try {
    // ── Pattern 1: /api/proxy/CHANNEL_ID.m3u8 ──────────────────────────
    if (segments.length === 1 && segments[0].endsWith(".m3u8")) {
      const channelId = segments[0].slice(0, -5) // strip ".m3u8"
      return await handleChannelPlaylist(channelId, origin)
    }

    // ── Pattern 2: /api/proxy/s?url=ENCODED_URL ────────────────────────
    if (segments[0] === "s") {
      const encodedUrl = url.searchParams.get("url")
      if (!encodedUrl) {
        return new NextResponse("Missing ?url= param", { status: 400, headers: CORS })
      }
      const headersParam = url.searchParams.get("h") || undefined
      return await handleResourceProxy(encodedUrl, origin, headersParam)
    }

    return new NextResponse("Unknown proxy route", { status: 404, headers: CORS })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown proxy error"
    console.error("[proxy] Error:", msg)
    return new NextResponse(`#EXTM3U\n#EXT-X-ERROR:${msg}`, {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl" },
    })
  }
}

// ── Channel entry point ────────────────────────────────────────────────────
async function handleChannelPlaylist(channelId: string, proxyOrigin: string) {
  const channels = await getChannels()
  const channel = channels.find((c) => c.id === channelId)

  if (!channel) {
    return new NextResponse("#EXTM3U\n#EXT-X-ERROR:Channel not found", {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl" },
    })
  }

  const fetchHeaders = buildFetchHeaders(channel.sourceUrl, channel.customHeaders)
  const res = await fetchRetry(channel.sourceUrl, fetchHeaders)

  if (!res.ok) {
    return new NextResponse(`#EXTM3U\n#EXT-X-ERROR:Upstream ${res.status}`, {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl" },
    })
  }

  const body = await res.text()
  const baseUrl = getBaseUrl(channel.sourceUrl)

  // Encode custom headers once for all sub-requests
  const hParam = channel.customHeaders
    ? encodeURIComponent(JSON.stringify(channel.customHeaders))
    : undefined

  const rewritten = rewritePlaylist(body, baseUrl, proxyOrigin, hParam)

  return new NextResponse(rewritten, {
    headers: {
      ...CORS,
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  })
}

// ── Resource proxy (segments, sub-playlists, keys, etc.) ───────────────────
async function handleResourceProxy(
  encodedUrl: string,
  proxyOrigin: string,
  headersParam?: string,
) {
  let targetUrl: string
  try {
    targetUrl = Buffer.from(encodedUrl, "base64url").toString("utf-8")
  } catch {
    return new NextResponse("Invalid URL encoding", { status: 400, headers: CORS })
  }

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new NextResponse("Invalid URL scheme", { status: 400, headers: CORS })
  }

  // Parse optional custom headers
  let customHeaders: Record<string, string> | undefined
  if (headersParam) {
    try {
      customHeaders = JSON.parse(decodeURIComponent(headersParam))
    } catch { /* ignore */ }
  }

  const fetchHeaders = buildFetchHeaders(targetUrl, customHeaders)
  const res = await fetchRetry(targetUrl, fetchHeaders)

  if (!res.ok) {
    return new NextResponse(`Upstream ${res.status}`, {
      status: res.status >= 400 && res.status < 500 ? res.status : 502,
      headers: CORS,
    })
  }

  const contentType = res.headers.get("content-type") || ""

  // If this is a playlist (sub-playlist / variant), rewrite it too
  if (isPlaylistContent(contentType, targetUrl)) {
    const body = await res.text()
    const baseUrl = getBaseUrl(targetUrl)
    const rewritten = rewritePlaylist(body, baseUrl, proxyOrigin, headersParam)

    return new NextResponse(rewritten, {
      headers: {
        ...CORS,
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  }

  // Binary passthrough for .ts segments, .aac, .mp4, .key, .vtt, etc.
  const buffer = await res.arrayBuffer()
  const responseHeaders: Record<string, string> = {
    ...CORS,
    "Content-Type": detectContentType(targetUrl, contentType),
    "Content-Length": buffer.byteLength.toString(),
    "Cache-Control": "public, max-age=600, immutable",
  }

  return new NextResponse(buffer, { headers: responseHeaders })
}

// ── Playlist rewriting ─────────────────────────────────────────────────────
// Rewrites every URI (segment paths, sub-playlist paths, URI="..." in tags)
// to go through /api/proxy/s?url=BASE64
function rewritePlaylist(
  content: string,
  baseUrl: string,
  proxyOrigin: string,
  headersParam?: string,
): string {
  const lines = content.split("\n")
  const result: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    // Rewrite URI="..." inside tags like #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA
    if (line.startsWith("#") && /URI\s*=\s*"/i.test(line)) {
      const rewritten = line.replace(/URI\s*=\s*"([^"]+)"/gi, (_, uri) => {
        const proxyUrl = makeProxyUrl(uri, baseUrl, proxyOrigin, headersParam)
        return `URI="${proxyUrl}"`
      })
      result.push(rewritten)
      continue
    }

    // Pass-through comment/tag lines and empty lines
    if (line.startsWith("#") || line.trim().length === 0) {
      result.push(line)
      continue
    }

    // This is a URI line (segment .ts, sub-playlist .m3u8, etc.)
    const proxyUrl = makeProxyUrl(line.trim(), baseUrl, proxyOrigin, headersParam)
    result.push(proxyUrl)
  }

  return result.join("\n")
}

function makeProxyUrl(
  uri: string,
  baseUrl: string,
  proxyOrigin: string,
  headersParam?: string,
): string {
  const absolute = resolveUrl(uri, baseUrl)
  const encoded = Buffer.from(absolute, "utf-8").toString("base64url")
  let proxyUrl = `${proxyOrigin}/api/proxy/s?url=${encoded}`
  if (headersParam) proxyUrl += `&h=${headersParam}`
  return proxyUrl
}

// ── URL resolution ─────────────────────────────────────────────────────────
function resolveUrl(uri: string, baseUrl: string): string {
  // Already absolute
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri
  // Protocol-relative
  if (uri.startsWith("//")) return "https:" + uri
  // Absolute path
  if (uri.startsWith("/")) {
    try {
      const u = new URL(baseUrl)
      return `${u.protocol}//${u.host}${uri}`
    } catch {
      return baseUrl + uri
    }
  }
  // Relative path — append to base directory
  return baseUrl + uri
}

function getBaseUrl(fullUrl: string): string {
  const i = fullUrl.lastIndexOf("/")
  return i > 8 ? fullUrl.substring(0, i + 1) : fullUrl + "/"
}

// ── Fetch with retry ───────────────────────────────────────────────────────
async function fetchRetry(
  url: string,
  headers: Record<string, string>,
  retries = 2,
): Promise<Response> {
  let lastErr: Error | null = null
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, {
        headers,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      lastErr = e as Error
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastErr || new Error("Fetch failed")
}

// ── Header builder ─────────────────────────────────────────────────────────
function buildFetchHeaders(
  targetUrl: string,
  custom?: Record<string, string>,
): Record<string, string> {
  let origin = ""
  let referer = ""
  try {
    const u = new URL(targetUrl)
    origin = u.origin
    referer = u.origin + "/"
  } catch { /* */ }

  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: origin,
    Referer: referer,
    Connection: "keep-alive",
    ...(custom || {}),
  }
}

// ── Content detection ──────────────────────────────────────────────────────
function isPlaylistContent(contentType: string, url: string): boolean {
  const ct = contentType.toLowerCase()
  if (ct.includes("mpegurl") || ct.includes("m3u")) return true
  const path = url.split("?")[0].toLowerCase()
  if (path.endsWith(".m3u8") || path.endsWith(".m3u")) return true
  return false
}

function detectContentType(url: string, fallback: string): string {
  const path = url.split("?")[0].toLowerCase()
  if (path.endsWith(".ts")) return "video/mp2t"
  if (path.endsWith(".aac")) return "audio/aac"
  if (path.endsWith(".mp4") || path.endsWith(".m4s") || path.endsWith(".fmp4")) return "video/mp4"
  if (path.endsWith(".m4a")) return "audio/mp4"
  if (path.endsWith(".vtt") || path.endsWith(".webvtt")) return "text/vtt"
  if (path.endsWith(".key")) return "application/octet-stream"
  if (path.endsWith(".mp3")) return "audio/mpeg"
  return fallback || "application/octet-stream"
}
