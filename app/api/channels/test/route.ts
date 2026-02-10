import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json({ ok: false, error: "URL es obligatoria" }, { status: 400 })
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json({ ok: false, error: "Esquema de URL invalido" }, { status: 400 })
    }

    let origin: string
    let referer: string
    try {
      const u = new URL(url)
      origin = u.origin
      referer = u.origin + "/"
    } catch {
      return NextResponse.json({ ok: false, error: "URL malformada" }, { status: 400 })
    }

    const startTime = Date.now()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

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
      signal: controller.signal,
    })

    clearTimeout(timeout)
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

    const isM3u8 = text.includes("#EXTM3U") || text.includes("#EXT-X-")
    const isMaster = text.includes("#EXT-X-STREAM-INF")
    const isMedia = text.includes("#EXTINF")
    const lines = text.split("\n").filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"))

    return NextResponse.json({
      ok: true,
      latencyMs,
      contentType,
      isHls: isM3u8,
      isMaster,
      isMedia,
      segmentCount: lines.length,
      playlistSize: text.length,
      httpStatus: res.status,
      type: isM3u8 ? (isMaster ? "Master Playlist" : isMedia ? "Media Playlist" : "HLS") : "Non-HLS Content",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido"
    return NextResponse.json({
      ok: false,
      error: message.includes("abort") || message.includes("timeout")
        ? "Timeout de conexion (15s)"
        : message,
    })
  }
}
