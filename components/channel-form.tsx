"use client"

import { useState } from "react"
import { Plus, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ChannelFormProps {
  onAdd: (data: {
    id: string
    name: string
    sourceUrl: string
    logo?: string
    group?: string
  }) => Promise<void>
}

export function ChannelForm({ onAdd }: ChannelFormProps) {
  const [id, setId] = useState("")
  const [name, setName] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [logo, setLogo] = useState("")
  const [group, setGroup] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    const trimId = id.trim()
    const trimName = name.trim()
    const trimUrl = sourceUrl.trim()

    if (!trimId) {
      setError("El ID del canal es obligatorio")
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimId)) {
      setError("El ID solo puede contener letras, numeros, guiones y guiones bajos")
      return
    }

    if (trimId.length < 2) {
      setError("El ID debe tener al menos 2 caracteres")
      return
    }

    if (!trimName) {
      setError("El nombre del canal es obligatorio")
      return
    }

    if (!trimUrl) {
      setError("La URL de origen es obligatoria")
      return
    }

    if (!trimUrl.startsWith("http://") && !trimUrl.startsWith("https://")) {
      setError("La URL debe comenzar con http:// o https://")
      return
    }

    setLoading(true)
    try {
      await onAdd({
        id: trimId,
        name: trimName,
        sourceUrl: trimUrl,
        logo: logo.trim() || undefined,
        group: group.trim() || undefined,
      })
      setId("")
      setName("")
      setSourceUrl("")
      setLogo("")
      setGroup("")
      setSuccess("Canal agregado correctamente")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al agregar el canal"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="channel-id" className="text-xs text-muted-foreground font-medium">
          ID del Canal
        </Label>
        <Input
          id="channel-id"
          placeholder="espn-hd, fox-sports, cnn-en-vivo..."
          value={id}
          onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-sm h-9"
          autoComplete="off"
        />
        <p className="text-[10px] text-muted-foreground/60">
          Este ID se usa en la URL del proxy: /api/proxy/<span className="text-primary">{id || "mi-canal"}</span>.m3u8
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="channel-name" className="text-xs text-muted-foreground font-medium">
          Nombre del Canal
        </Label>
        <Input
          id="channel-name"
          placeholder="ESPN HD"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/40 text-sm h-9"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="source-url" className="text-xs text-muted-foreground font-medium">
          URL de Origen
        </Label>
        <Input
          id="source-url"
          placeholder="https://ejemplo.com/stream/canal.m3u8"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-sm h-9"
          autoComplete="off"
        />
        <p className="text-[10px] text-muted-foreground/60">
          Acepta cualquier URL: .m3u8, .m3u, .ts, .mp4, etc.
        </p>
      </div>

      {/* Advanced fields toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Opciones avanzadas
      </button>

      {showAdvanced && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel-logo" className="text-xs text-muted-foreground font-medium">
              URL del Logo (opcional)
            </Label>
            <Input
              id="channel-logo"
              placeholder="https://ejemplo.com/logo.png"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/40 text-sm h-9"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel-group" className="text-xs text-muted-foreground font-medium">
              Grupo (opcional)
            </Label>
            <Input
              id="channel-group"
              placeholder="Deportes, Noticias, Entretenimiento..."
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/40 text-sm h-9"
              autoComplete="off"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
          <p className="text-xs text-green-400">{success}</p>
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full gap-2 font-semibold h-9 text-sm">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {loading ? "Agregando..." : "Agregar Canal"}
      </Button>
    </form>
  )
}
