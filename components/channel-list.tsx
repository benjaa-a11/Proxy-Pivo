"use client"

import { useState } from "react"
import {
  Copy,
  Trash2,
  Check,
  ExternalLink,
  Radio,
  Play,
  Loader2,
  Wifi,
  WifiOff,
  Activity,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Channel } from "@/lib/channels"

interface ChannelListProps {
  channels: Channel[]
  onDelete: (id: string) => Promise<void>
}

interface TestResult {
  ok: boolean
  error?: string
  latencyMs?: number
  isMaster?: boolean
  isMedia?: boolean
  segmentCount?: number
}

export function ChannelList({ channels, onDelete }: ChannelListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  function getProxyUrl(channel: Channel) {
    if (typeof window === "undefined") return ""
    const origin = window.location.origin
    return `${origin}/api/proxy/${channel.id}.m3u8`
  }

  function getPlayerUrl(channel: Channel) {
    if (typeof window === "undefined") return ""
    return `/player?id=${channel.id}`
  }

  async function handleCopy(channel: Channel) {
    const url = getProxyUrl(channel)
    await navigator.clipboard.writeText(url)
    setCopiedId(channel.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await onDelete(id)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleTest(channel: Channel) {
    setTestingId(channel.id)
    try {
      const res = await fetch("/api/channels/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: channel.sourceUrl }),
      })
      const result = await res.json()
      setTestResults((prev) => ({ ...prev, [channel.id]: result }))
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [channel.id]: { ok: false, error: "Test request failed" },
      }))
    } finally {
      setTestingId(null)
    }
  }

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
        <Radio className="h-12 w-12 opacity-30" />
        <p className="text-sm">No hay canales registrados</p>
        <p className="text-xs opacity-60">Agrega tu primer canal usando el formulario</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {channels.map((channel) => {
        const test = testResults[channel.id]
        const isTesting = testingId === channel.id

        return (
          <div
            key={channel.id}
            className="group flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
          >
            {/* Row 1: Name + Actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-2.5 w-2.5 shrink-0 rounded-full ${
                    test?.ok
                      ? "bg-green-500 shadow-[0_0_8px_theme(colors.green.500)]"
                      : test && !test.ok
                        ? "bg-destructive shadow-[0_0_8px_hsl(0,72%,51%)]"
                        : "bg-primary shadow-[0_0_8px_hsl(168,80%,45%)]"
                  }`}
                />
                <h3 className="text-sm font-semibold text-foreground truncate">{channel.name}</h3>
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">{channel.id}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => handleTest(channel)}
                  disabled={isTesting}
                  title="Probar conexion"
                >
                  {isTesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Activity className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => handleCopy(channel)}
                  title="Copiar URL proxy"
                >
                  {copiedId === channel.id ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
                <a href={getPlayerUrl(channel)} target="_blank" rel="noopener noreferrer">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Abrir reproductor"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(channel.id)}
                  disabled={deletingId === channel.id}
                  title="Eliminar canal"
                >
                  {deletingId === channel.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Row 2: URLs */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0 w-12">
                  Origen
                </span>
                <code className="text-xs text-muted-foreground font-mono truncate">{channel.sourceUrl}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-primary font-semibold shrink-0 w-12">
                  Proxy
                </span>
                <code className="text-xs text-primary font-mono truncate">{getProxyUrl(channel)}</code>
                <a
                  href={getProxyUrl(channel)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Row 3: Test result (if available) */}
            {test && (
              <div
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                  test.ok
                    ? "bg-green-500/10 border border-green-500/20 text-green-400"
                    : "bg-destructive/10 border border-destructive/20 text-destructive"
                }`}
              >
                {test.ok ? <Wifi className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
                {test.ok ? (
                  <span className="font-mono">
                    OK - {test.latencyMs}ms - {test.isMaster ? "Master" : "Media"} playlist
                    {test.segmentCount ? ` - ${test.segmentCount} items` : ""}
                  </span>
                ) : (
                  <span className="font-mono">{test.error || "Connection failed"}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
