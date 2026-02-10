import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Test if an HLS URL is reachable and valid
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json({ ok: false, error: "URL is required" }, { status: 400 })
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json({ ok: false, error: "Invalid URL scheme" }, { status: 400 })
    }

    const startTime = Date.now()

    let origin: string
    let referer: string
    try {
      const u = new URL(url)
      origin = u.origin
      referer = u.origin + "/"
    } catch {
      return NextResponse.json({ ok: false, error: "Malformed URL" }, { status: 400 })
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "*/*",
        Origin: origin,
        Referer: referer,
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    })

    const latencyMs = Date.now() - startTime
    const contentType = res.headers.get("content-type") || ""
    const text = await res.text()

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `HTTP ${res.status} ${res.statusText}`,
        latencyMs,
      })
    }

    // Check if it looks like a valid HLS playlist
    const isM3u8 = text.includes("#EXTM3U") || text.includes("#EXT-X-")
    const isMaster = text.includes("#EXT-X-STREAM-INF")
    const isMedia = text.includes("#EXTINF")
    const lines = text.split("\n").filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"))

    return NextResponse.json({
      ok: isM3u8,
      error: isM3u8 ? undefined : "Response is not a valid HLS playlist",
      latencyMs,
      contentType,
      isM3u8,
      isMaster,
      isMedia,
      segmentCount: lines.length,
      playlistSize: text.length,
      httpStatus: res.status,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({
      ok: false,
      error: message.includes("timeout") ? "Connection timeout (10s)" : message,
    })
  }
}
