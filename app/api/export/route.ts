import { type NextRequest, NextResponse } from "next/server"
import { getChannels } from "@/lib/channels"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const channels = await getChannels()
    const host = request.headers.get("host") || "localhost:3000"
    const proto = request.headers.get("x-forwarded-proto") || "http"
    const baseUrl = `${proto}://${host}`

    let m3u = "#EXTM3U\n"
    m3u += `#EXTM3U url-tvg=""\n\n`

    for (const channel of channels) {
      const attrs: string[] = [
        `tvg-id="${channel.id}"`,
        `tvg-name="${channel.name}"`,
      ]
      if (channel.logo) attrs.push(`tvg-logo="${channel.logo}"`)
      if (channel.group) attrs.push(`group-title="${channel.group}"`)

      m3u += `#EXTINF:-1 ${attrs.join(" ")},${channel.name}\n`
      m3u += `${baseUrl}/api/proxy/${channel.id}.m3u8\n\n`
    }

    return new NextResponse(m3u, {
      headers: {
        "Content-Type": "application/x-mpegurl; charset=utf-8",
        "Content-Disposition": 'attachment; filename="channels.m3u"',
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to export" }, { status: 500 })
  }
}
