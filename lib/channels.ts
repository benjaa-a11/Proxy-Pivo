import { readFile, writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

export interface Channel {
  id: string
  name: string
  sourceUrl: string
  logo?: string
  group?: string
  customHeaders?: Record<string, string>
  createdAt: string
  updatedAt: string
}

/**
 * Channels are stored in data/channels.json at the project root.
 * This file is committed to the repository so proxy URLs remain
 * functional even when the dashboard is not actively used.
 *
 * On read-only filesystems (e.g. Vercel serverless), an in-memory
 * fallback is used so the proxy can still read the committed file.
 */

const DATA_DIR = join(process.cwd(), "data")
const CHANNELS_FILE = join(DATA_DIR, "channels.json")

// In-memory cache (populated from file on first read)
let memoryCache: Channel[] | null = null
let isReadOnly = false

async function ensureDataDir(): Promise<void> {
  if (isReadOnly) return
  if (!existsSync(DATA_DIR)) {
    try {
      await mkdir(DATA_DIR, { recursive: true })
    } catch {
      isReadOnly = true
    }
  }
}

async function loadFromDisk(): Promise<Channel[]> {
  try {
    const raw = await readFile(CHANNELS_FILE, "utf-8")
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as Channel[]
    return []
  } catch {
    return []
  }
}

async function saveToDisk(channels: Channel[]): Promise<void> {
  memoryCache = channels
  if (isReadOnly) return
  try {
    await ensureDataDir()
    if (isReadOnly) return
    await writeFile(CHANNELS_FILE, JSON.stringify(channels, null, 2), "utf-8")
  } catch {
    isReadOnly = true
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getChannels(): Promise<Channel[]> {
  if (memoryCache !== null) return memoryCache
  await ensureDataDir()
  const channels = await loadFromDisk()
  memoryCache = channels
  return channels
}

export async function getChannelById(id: string): Promise<Channel | undefined> {
  const channels = await getChannels()
  return channels.find((c) => c.id === id)
}

/**
 * Validates that a channel ID is unique and well-formed.
 * IDs must be alphanumeric with hyphens/underscores, 2-64 chars.
 */
export function validateChannelId(id: string, existingChannels: Channel[], excludeId?: string): string | null {
  if (!id || id.trim().length === 0) return "El ID es obligatorio"
  const trimmed = id.trim()
  if (trimmed.length < 2) return "El ID debe tener al menos 2 caracteres"
  if (trimmed.length > 64) return "El ID no puede tener mas de 64 caracteres"
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return "El ID solo puede contener letras, numeros, guiones y guiones bajos"
  const duplicate = existingChannels.find((c) => c.id === trimmed && c.id !== excludeId)
  if (duplicate) return `Ya existe un canal con el ID "${trimmed}"`
  return null
}

export async function addChannel(data: {
  id: string
  name: string
  sourceUrl: string
  logo?: string
  group?: string
  customHeaders?: Record<string, string>
}): Promise<Channel> {
  const channels = await getChannels()
  const now = new Date().toISOString()
  const channel: Channel = {
    id: data.id.trim(),
    name: data.name.trim(),
    sourceUrl: data.sourceUrl.trim(),
    logo: data.logo?.trim() || undefined,
    group: data.group?.trim() || undefined,
    customHeaders: data.customHeaders,
    createdAt: now,
    updatedAt: now,
  }
  channels.push(channel)
  await saveToDisk(channels)
  return channel
}

export async function updateChannel(
  id: string,
  updates: Partial<Omit<Channel, "createdAt">>,
): Promise<Channel | null> {
  const channels = await getChannels()
  const idx = channels.findIndex((c) => c.id === id)
  if (idx === -1) return null

  const updated: Channel = {
    ...channels[idx],
    ...updates,
    id: updates.id?.trim() || channels[idx].id,
    updatedAt: new Date().toISOString(),
  }
  channels[idx] = updated
  await saveToDisk(channels)
  return updated
}

export async function removeChannel(id: string): Promise<boolean> {
  const channels = await getChannels()
  const filtered = channels.filter((c) => c.id !== id)
  if (filtered.length === channels.length) return false
  await saveToDisk(filtered)
  return true
}

export async function reorderChannels(ids: string[]): Promise<void> {
  const channels = await getChannels()
  const ordered: Channel[] = []
  for (const id of ids) {
    const ch = channels.find((c) => c.id === id)
    if (ch) ordered.push(ch)
  }
  // Append any channels not in the ids list
  for (const ch of channels) {
    if (!ids.includes(ch.id)) ordered.push(ch)
  }
  await saveToDisk(ordered)
}

export async function importChannels(newChannels: Channel[]): Promise<{ added: number; skipped: number }> {
  const channels = await getChannels()
  let added = 0
  let skipped = 0
  for (const ch of newChannels) {
    if (channels.some((c) => c.id === ch.id)) {
      skipped++
      continue
    }
    channels.push(ch)
    added++
  }
  await saveToDisk(channels)
  return { added, skipped }
}
