import { NextRequest, NextResponse } from "next/server"
import { getChannels } from "@/lib/channels"

export async function GET(request: NextRequest) {
  try {
    const channels = await getChannels()
    const origin = request.headers.get("host") || "localhost:3000"
    const protocol = request.headers.get("x-forwarded-proto") || "http"
    const baseUrl = `${protocol}://${origin}`

    let m3u = "#EXTM3U\n\n"

    for (const channel of channels) {
      m3u += `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}",${channel.name}\n`
      m3u += `${baseUrl}/api/proxy/${channel.id}.m3u8\n\n`
    }

    return new NextResponse(m3u, {
      headers: {
        "Content-Type": "application/x-mpegurl",
        "Content-Disposition": 'attachment; filename="channels.m3u"',
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to export" }, { status: 500 })
  }
}
