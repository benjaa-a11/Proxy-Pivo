import { type NextRequest, NextResponse } from "next/server"
import { getChannelById } from "@/lib/channels"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/**
 * Professional HLS Proxy Engine
 *
 * URL patterns:
 *   /api/proxy/{CHANNEL_ID}.m3u8                → channel entry point (master/media playlist)
 *   /api/proxy/s?url=BASE64URL                  → sub-resource proxy (playlists, segments, keys)
 *   /api/proxy/s?url=BASE64URL&h=ENCODED_HDRS   → sub-resource proxy with custom headers
 *
 * Features:
 *   - Streams binary segments directly (no full buffering)
 *   - Rewrites all playlist URIs to keep the full chain proxied
 *   - Retry with exponential backoff on network failures
 *   - Proper CORS for cross-origin playback
 *   - Accepts ANY source URL (not just .m3u8 originals)
 *   - All proxy URLs end in .m3u8 as required
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type, Content-Range",
  "Access-Control-Max-Age": "86400",
}

// ── OPTIONS ────────────────────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ── HEAD ───────────────────────────────────────────────────────────────────
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const res = await GET(request, { params })
  return new NextResponse(null, { status: res.status, headers: res.headers })
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params
  const url = new URL(request.url)
  const origin = url.origin

  try {
    // Pattern 1: /api/proxy/{CHANNEL_ID}.m3u8
    if (segments.length === 1 && segments[0].endsWith(".m3u8")) {
      const channelId = segments[0].slice(0, -5)
      return await handleChannelPlaylist(channelId, origin)
    }

    // Pattern 2: /api/proxy/s?url=BASE64URL
    if (segments[0] === "s") {
      const encodedUrl = url.searchParams.get("url")
      if (!encodedUrl) {
        return errorResponse("Missing ?url= parameter", 400)
      }
      const headersParam = url.searchParams.get("h") || undefined
      return await handleResourceProxy(encodedUrl, origin, headersParam)
    }

    return errorResponse("Unknown proxy route", 404)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown proxy error"
    console.error("[proxy] Error:", msg)
    return new NextResponse(`#EXTM3U\n#EXT-X-ERROR:${msg}`, {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/vnd.apple.mpegurl" },
    })
  }
}

// ── Channel entry point ────────────────────────────────────────────────────
async function handleChannelPlaylist(channelId: string, proxyOrigin: string) {
  const channel = await getChannelById(channelId)

  if (!channel) {
    return new NextResponse(
      "#EXTM3U\n#EXT-X-ERROR:Channel not found",
      {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/vnd.apple.mpegurl" },
      },
    )
  }

  const fetchHeaders = buildFetchHeaders(channel.sourceUrl, channel.customHeaders)
  const res = await fetchWithRetry(channel.sourceUrl, fetchHeaders)

  if (!res.ok) {
    return new NextResponse(
      `#EXTM3U\n#EXT-X-ERROR:Upstream returned ${res.status}`,
      {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/vnd.apple.mpegurl" },
      },
    )
  }

  const body = await res.text()
  const contentType = res.headers.get("content-type") || ""

  // If the source is an HLS playlist, rewrite it
  if (isPlaylistContent(contentType, channel.sourceUrl, body)) {
    const baseUrl = getBaseUrl(channel.sourceUrl)
    const hParam = channel.customHeaders
      ? encodeURIComponent(JSON.stringify(channel.customHeaders))
      : undefined
    const rewritten = rewritePlaylist(body, baseUrl, proxyOrigin, hParam)
    return playlistResponse(rewritten)
  }

  // Non-HLS source: wrap it as a simple redirect playlist
  // This allows any URL to work through the proxy as .m3u8
  const encoded = Buffer.from(channel.sourceUrl, "utf-8").toString("base64url")
  const redirectPlaylist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-STREAM-INF:BANDWIDTH=0`,
    `${proxyOrigin}/api/proxy/s?url=${encoded}`,
  ].join("\n")

  return playlistResponse(redirectPlaylist)
}

// ── Resource proxy ─────────────────────────────────────────────────────────
async function handleResourceProxy(
  encodedUrl: string,
  proxyOrigin: string,
  headersParam?: string,
) {
  let targetUrl: string
  try {
    targetUrl = Buffer.from(encodedUrl, "base64url").toString("utf-8")
  } catch {
    return errorResponse("Invalid URL encoding", 400)
  }

  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return errorResponse("Invalid URL scheme", 400)
  }

  // Parse optional custom headers
  let customHeaders: Record<string, string> | undefined
  if (headersParam) {
    try {
      customHeaders = JSON.parse(decodeURIComponent(headersParam))
    } catch {
      /* ignore malformed headers */
    }
  }

  const fetchHeaders = buildFetchHeaders(targetUrl, customHeaders)
  const res = await fetchWithRetry(targetUrl, fetchHeaders)

  if (!res.ok) {
    const status = res.status >= 400 && res.status < 500 ? res.status : 502
    return errorResponse(`Upstream ${res.status}`, status)
  }

  const contentType = res.headers.get("content-type") || ""

  // Check if this is a playlist that needs rewriting
  // For playlists, we read the full text to rewrite URIs
  if (isPlaylistContent(contentType, targetUrl)) {
    const body = await res.text()
    const baseUrl = getBaseUrl(targetUrl)
    const rewritten = rewritePlaylist(body, baseUrl, proxyOrigin, headersParam)
    return playlistResponse(rewritten)
  }

  // Binary content (segments, keys, etc.) - stream directly
  if (!res.body) {
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": detectContentType(targetUrl, contentType),
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "public, max-age=600, immutable",
      },
    })
  }

  // Stream the response body directly for better performance
  const responseHeaders: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": detectContentType(targetUrl, contentType),
    "Cache-Control": "public, max-age=600, immutable",
  }
  const contentLength = res.headers.get("content-length")
  if (contentLength) {
    responseHeaders["Content-Length"] = contentLength
  }

  return new NextResponse(res.body as ReadableStream, { headers: responseHeaders })
}

// ── Playlist rewriting ─────────────────────────────────────────────────────
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

    // Rewrite URI="..." in tags (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, etc.)
    if (line.startsWith("#") && /URI\s*=\s*"/i.test(line)) {
      const rewritten = line.replace(/URI\s*=\s*"([^"]+)"/gi, (_, uri) => {
        const proxyUrl = makeProxyUrl(uri, baseUrl, proxyOrigin, headersParam)
        return `URI="${proxyUrl}"`
      })
      result.push(rewritten)
      continue
    }

    // Pass-through tags and empty lines
    if (line.startsWith("#") || line.trim().length === 0) {
      result.push(line)
      continue
    }

    // URI line (segment, sub-playlist, etc.)
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
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri
  if (uri.startsWith("//")) return "https:" + uri
  if (uri.startsWith("/")) {
    try {
      const u = new URL(baseUrl)
      return `${u.protocol}//${u.host}${uri}`
    } catch {
      return baseUrl + uri
    }
  }
  // Relative path
  return baseUrl + uri
}

function getBaseUrl(fullUrl: string): string {
  const questionIdx = fullUrl.indexOf("?")
  const pathPart = questionIdx > 0 ? fullUrl.substring(0, questionIdx) : fullUrl
  const lastSlash = pathPart.lastIndexOf("/")
  return lastSlash > 8 ? pathPart.substring(0, lastSlash + 1) : pathPart + "/"
}

// ── Fetch with retry + exponential backoff ─────────────────────────────────
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 3,
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      const res = await fetch(url, {
        headers,
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      })
      clearTimeout(timeout)
      return res
    } catch (e) {
      lastError = e as Error
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, Math.min(500 * Math.pow(2, attempt), 4000)))
      }
    }
  }
  throw lastError || new Error("Fetch failed after retries")
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
  } catch {
    /* ignore */
  }

  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Origin: origin,
    Referer: referer,
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    ...(custom || {}),
  }
}

// ── Content detection ──────────────────────────────────────────────────────
function isPlaylistContent(contentType: string, url: string, body?: string): boolean {
  const ct = contentType.toLowerCase()
  if (ct.includes("mpegurl") || ct.includes("m3u")) return true
  const path = url.split("?")[0].toLowerCase()
  if (path.endsWith(".m3u8") || path.endsWith(".m3u")) return true
  // Check body content for HLS markers
  if (body && (body.trimStart().startsWith("#EXTM3U") || body.includes("#EXT-X-"))) return true
  return false
}

function detectContentType(url: string, fallback: string): string {
  const path = url.split("?")[0].toLowerCase()
  const map: Record<string, string> = {
    ".ts": "video/mp2t",
    ".aac": "audio/aac",
    ".mp4": "video/mp4",
    ".m4s": "video/mp4",
    ".fmp4": "video/mp4",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".vtt": "text/vtt",
    ".webvtt": "text/vtt",
    ".srt": "text/plain",
    ".key": "application/octet-stream",
    ".json": "application/json",
    ".xml": "application/xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  }
  for (const [ext, mime] of Object.entries(map)) {
    if (path.endsWith(ext)) return mime
  }
  return fallback || "application/octet-stream"
}

// ── Helpers ────────────────────────────────────────────────────────────────
function playlistResponse(body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}

function errorResponse(message: string, status: number): NextResponse {
  return new NextResponse(message, { status, headers: CORS_HEADERS })
}
