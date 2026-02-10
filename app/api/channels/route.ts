import { type NextRequest, NextResponse } from "next/server"
import {
  getChannels,
  addChannel,
  removeChannel,
  updateChannel,
  validateChannelId,
} from "@/lib/channels"

export const dynamic = "force-dynamic"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// GET all channels
export async function GET() {
  try {
    const channels = await getChannels()
    return NextResponse.json(channels, { headers: CORS })
  } catch (e) {
    console.error("[channels] GET error:", e)
    return NextResponse.json([], { status: 200, headers: CORS })
  }
}

// POST - add a new channel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, sourceUrl, logo, group, customHeaders } = body

    if (!id || !name || !sourceUrl) {
      return NextResponse.json(
        { error: "ID, nombre y URL de origen son obligatorios" },
        { status: 400, headers: CORS },
      )
    }

    const urlStr = String(sourceUrl).trim()
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      return NextResponse.json(
        { error: "La URL debe comenzar con http:// o https://" },
        { status: 400, headers: CORS },
      )
    }

    const channels = await getChannels()
    const idError = validateChannelId(String(id), channels)
    if (idError) {
      return NextResponse.json({ error: idError }, { status: 400, headers: CORS })
    }

    const channel = await addChannel({
      id: String(id).trim(),
      name: String(name).trim(),
      sourceUrl: urlStr,
      logo: logo ? String(logo).trim() : undefined,
      group: group ? String(group).trim() : undefined,
      customHeaders: customHeaders && typeof customHeaders === "object" ? customHeaders : undefined,
    })

    return NextResponse.json(channel, { status: 201, headers: CORS })
  } catch (e) {
    console.error("[channels] POST error:", e)
    return NextResponse.json(
      { error: "Error al agregar el canal" },
      { status: 500, headers: CORS },
    )
  }
}

// PUT - update a channel
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: "ID del canal es obligatorio" },
        { status: 400, headers: CORS },
      )
    }

    // If renaming the ID, validate the new one
    if (updates.id && updates.id !== id) {
      const channels = await getChannels()
      const idError = validateChannelId(String(updates.id), channels, id)
      if (idError) {
        return NextResponse.json({ error: idError }, { status: 400, headers: CORS })
      }
    }

    if (updates.sourceUrl) {
      const urlStr = String(updates.sourceUrl).trim()
      if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
        return NextResponse.json(
          { error: "La URL debe comenzar con http:// o https://" },
          { status: 400, headers: CORS },
        )
      }
      updates.sourceUrl = urlStr
    }

    const updated = await updateChannel(String(id), updates)
    if (!updated) {
      return NextResponse.json(
        { error: "Canal no encontrado" },
        { status: 404, headers: CORS },
      )
    }

    return NextResponse.json(updated, { headers: CORS })
  } catch (e) {
    console.error("[channels] PUT error:", e)
    return NextResponse.json(
      { error: "Error al actualizar el canal" },
      { status: 500, headers: CORS },
    )
  }
}

// DELETE - remove a channel
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "ID del canal es obligatorio" },
        { status: 400, headers: CORS },
      )
    }

    const removed = await removeChannel(id)
    if (!removed) {
      return NextResponse.json(
        { error: "Canal no encontrado" },
        { status: 404, headers: CORS },
      )
    }

    return NextResponse.json({ success: true }, { headers: CORS })
  } catch (e) {
    console.error("[channels] DELETE error:", e)
    return NextResponse.json(
      { error: "Error al eliminar el canal" },
      { status: 500, headers: CORS },
    )
  }
}
