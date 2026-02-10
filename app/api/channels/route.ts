import { NextResponse } from "next/server"
import { getChannels, addChannel, removeChannel } from "@/lib/channels"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const channels = await getChannels()
    return NextResponse.json(channels)
  } catch (e) {
    console.error("[v0] GET /api/channels error:", e)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, sourceUrl } = body

    if (!name || !sourceUrl) {
      return NextResponse.json({ error: "Name and source URL are required" }, { status: 400 })
    }

    const urlStr = sourceUrl.trim()
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    const channel = await addChannel(name, urlStr)
    return NextResponse.json(channel, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to add channel" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Channel ID is required" }, { status: 400 })
    }

    await removeChannel(id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 })
  }
}
