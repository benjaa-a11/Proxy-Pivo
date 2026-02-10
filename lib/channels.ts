import { readFile, writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"

export interface Channel {
  id: string
  name: string
  sourceUrl: string
  createdAt: string
  segmentDelay: number
  customHeaders?: Record<string, string>
  status?: "unknown" | "online" | "offline" | "error"
  lastChecked?: string
}

const DATA_DIR = join(process.cwd(), "data")
const CHANNELS_FILE = join(DATA_DIR, "channels.json")

// In-memory fallback when filesystem is read-only (e.g. Vercel serverless)
let memoryStore: Channel[] | null = null
let useMemory = false

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    try {
      await mkdir(DATA_DIR, { recursive: true })
    } catch {
      useMemory = true
    }
  }
}

export async function getChannels(): Promise<Channel[]> {
  if (useMemory) {
    return memoryStore ?? []
  }
  await ensureDataDir()
  if (useMemory) return memoryStore ?? []
  try {
    const data = await readFile(CHANNELS_FILE, "utf-8")
    const channels = JSON.parse(data) as Channel[]
    memoryStore = channels
    return channels
  } catch {
    return memoryStore ?? []
  }
}

export async function saveChannels(channels: Channel[]): Promise<void> {
  memoryStore = channels
  if (useMemory) return
  try {
    await ensureDataDir()
    if (useMemory) return
    await writeFile(CHANNELS_FILE, JSON.stringify(channels, null, 2), "utf-8")
  } catch {
    useMemory = true
  }
}

export async function addChannel(name: string, sourceUrl: string): Promise<Channel> {
  const channels = await getChannels()
  const id = generateId()
  const channel: Channel = {
    id,
    name: name.trim(),
    sourceUrl: sourceUrl.trim(),
    createdAt: new Date().toISOString(),
  }
  channels.push(channel)
  await saveChannels(channels)
  return channel
}

export async function removeChannel(id: string): Promise<void> {
  const channels = await getChannels()
  const filtered = channels.filter((c) => c.id !== id)
  await saveChannels(filtered)
}

export async function updateChannel(id: string, updates: Partial<Channel>): Promise<Channel | null> {
  const channels = await getChannels()
  const idx = channels.findIndex((c) => c.id === id)
  if (idx === -1) return null
  channels[idx] = { ...channels[idx], ...updates }
  await saveChannels(channels)
  return channels[idx]
}

export function getChannelById(id: string): Channel | undefined {
  return memoryStore?.find((c) => c.id === id)
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36)
}
