"use client"

import React from "react"

import { useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface ChannelFormProps {
  onAdd: (name: string, sourceUrl: string) => Promise<void>
}

export function ChannelForm({ onAdd }: ChannelFormProps) {
  const [name, setName] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!name.trim() || !sourceUrl.trim()) {
      setError("Todos los campos son obligatorios")
      return
    }

    if (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://")) {
      setError("La URL debe comenzar con http:// o https://")
      return
    }

    setLoading(true)
    try {
      await onAdd(name.trim(), sourceUrl.trim())
      setName("")
      setSourceUrl("")
    } catch {
      setError("Error al agregar el canal")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="channel-name" className="text-sm text-muted-foreground">
          Nombre del Canal
        </Label>
        <Input
          id="channel-name"
          placeholder="ESPN, Fox Sports, CNN..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="source-url" className="text-sm text-muted-foreground">
          URL M3U8 de Origen
        </Label>
        <Input
          id="source-url"
          placeholder="https://ejemplo.com/stream/canal.m3u8"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/50 font-mono text-sm"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full gap-2 font-semibold">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {loading ? "Agregando..." : "Agregar Canal"}
      </Button>
    </form>
  )
}
