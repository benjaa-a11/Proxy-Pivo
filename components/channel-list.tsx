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
  Pencil,
  X,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Channel } from "@/lib/channels"

interface ChannelListProps {
  channels: Channel[]
  onDelete: (id: string) => Promise<void>
  onUpdate: (id: string, updates: Partial<Channel>) => Promise<void>
}

interface TestResult {
  ok: boolean
  error?: string
  latencyMs?: number
  isMaster?: boolean
  isMedia?: boolean
  segmentCount?: number
  type?: string
}

export function ChannelList({ channels, onDelete, onUpdate }: ChannelListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    sourceUrl: string
    logo: string
    group: string
  }>({ name: "", sourceUrl: "", logo: "", group: "" })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState("")

  function getProxyUrl(channel: Channel) {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/api/proxy/${channel.id}.m3u8`
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
        [channel.id]: { ok: false, error: "Error en la solicitud" },
      }))
    } finally {
      setTestingId(null)
    }
  }

  function startEdit(channel: Channel) {
    setEditingId(channel.id)
    setEditForm({
      name: channel.name,
      sourceUrl: channel.sourceUrl,
      logo: channel.logo || "",
      group: channel.group || "",
    })
    setEditError("")
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError("")
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) {
      setEditError("El nombre es obligatorio")
      return
    }
    if (!editForm.sourceUrl.trim()) {
      setEditError("La URL es obligatoria")
      return
    }
    if (
      !editForm.sourceUrl.trim().startsWith("http://") &&
      !editForm.sourceUrl.trim().startsWith("https://")
    ) {
      setEditError("La URL debe comenzar con http:// o https://")
      return
    }

    setEditLoading(true)
    setEditError("")
    try {
      await onUpdate(id, {
        name: editForm.name.trim(),
        sourceUrl: editForm.sourceUrl.trim(),
        logo: editForm.logo.trim() || undefined,
        group: editForm.group.trim() || undefined,
      })
      setEditingId(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al actualizar"
      setEditError(msg)
    } finally {
      setEditLoading(false)
    }
  }

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border border-border">
          <Radio className="h-7 w-7 opacity-40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground/60">No hay canales registrados</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Agrega tu primer canal usando el formulario
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {channels.map((channel) => {
        const test = testResults[channel.id]
        const isTesting = testingId === channel.id
        const isEditing = editingId === channel.id

        return (
          <div
            key={channel.id}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 transition-all hover:bg-muted/40 hover:border-border/80"
          >
            {isEditing ? (
              /* ── Edit mode ────────────────────────────────────── */
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    Editando Canal
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={cancelEdit}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Nombre
                    </label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="bg-muted/50 border-border text-foreground text-sm h-8 font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Grupo
                    </label>
                    <Input
                      value={editForm.group}
                      onChange={(e) => setEditForm((f) => ({ ...f, group: e.target.value }))}
                      placeholder="Opcional"
                      className="bg-muted/50 border-border text-foreground text-sm h-8"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    URL de Origen
                  </label>
                  <Input
                    value={editForm.sourceUrl}
                    onChange={(e) => setEditForm((f) => ({ ...f, sourceUrl: e.target.value }))}
                    className="bg-muted/50 border-border text-foreground text-sm h-8 font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Logo URL (opcional)
                  </label>
                  <Input
                    value={editForm.logo}
                    onChange={(e) => setEditForm((f) => ({ ...f, logo: e.target.value }))}
                    placeholder="https://..."
                    className="bg-muted/50 border-border text-foreground text-sm h-8"
                  />
                </div>
                {editError && (
                  <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5">
                    {editError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelEdit}
                    className="text-xs h-8"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveEdit(channel.id)}
                    disabled={editLoading}
                    className="text-xs h-8 gap-1.5"
                  >
                    {editLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              /* ── View mode ────────────────────────────────────── */
              <>
                {/* Row 1: Name + Actions */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
                        test?.ok
                          ? "bg-green-500 shadow-[0_0_8px_theme(colors.green.500)]"
                          : test && !test.ok
                            ? "bg-destructive shadow-[0_0_8px_hsl(0,72%,51%)]"
                            : "bg-primary/60"
                      }`}
                    />
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {channel.name}
                    </h3>
                    {channel.group && (
                      <span className="hidden sm:inline-flex text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium">
                        {channel.group}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0 bg-muted/50 px-1.5 py-0.5 rounded">
                      {channel.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
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
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Abrir reproductor"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(channel)}
                      title="Editar canal"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
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
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0 w-12">
                      Origen
                    </span>
                    <code className="text-[11px] text-muted-foreground font-mono truncate min-w-0">
                      {channel.sourceUrl}
                    </code>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-primary font-semibold shrink-0 w-12">
                      Proxy
                    </span>
                    <code className="text-[11px] text-primary font-mono truncate min-w-0">
                      {getProxyUrl(channel)}
                    </code>
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

                {/* Row 3: Test result */}
                {test && (
                  <div
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                      test.ok
                        ? "bg-green-500/10 border border-green-500/20 text-green-400"
                        : "bg-destructive/10 border border-destructive/20 text-destructive"
                    }`}
                  >
                    {test.ok ? (
                      <Wifi className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {test.ok ? (
                      <span className="font-mono">
                        OK - {test.latencyMs}ms
                        {test.type ? ` - ${test.type}` : ""}
                        {test.segmentCount ? ` - ${test.segmentCount} items` : ""}
                      </span>
                    ) : (
                      <span className="font-mono">{test.error || "Conexion fallida"}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
