"use client"

import React from "react"
import useSWR, { mutate } from "swr"
import { Radio, Tv, Zap, Shield, Download, Globe, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChannelForm } from "@/components/channel-form"
import { ChannelList } from "@/components/channel-list"
import type { Channel } from "@/lib/channels"

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => {
      if (!r.ok) return []
      return r.json()
    })
    .then((data) => (Array.isArray(data) ? data : []))

export default function DashboardPage() {
  const { data, isLoading } = useSWR<Channel[]>("/api/channels", fetcher, {
    refreshInterval: 5000,
    fallbackData: [],
    revalidateOnFocus: true,
  })
  const channels = Array.isArray(data) ? data : []

  async function handleAdd(formData: {
    id: string
    name: string
    sourceUrl: string
    logo?: string
    group?: string
  }) {
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || "Error al agregar el canal")
    }
    await mutate("/api/channels")
  }

  async function handleUpdate(id: string, updates: Partial<Channel>) {
    const res = await fetch("/api/channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || "Error al actualizar el canal")
    }
    await mutate("/api/channels")
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/channels?id=${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error("Error al eliminar el canal")
    await mutate("/api/channels")
  }

  const groupCounts = channels.reduce<Record<string, number>>((acc, ch) => {
    const g = ch.group || "Sin grupo"
    acc[g] = (acc[g] || 0) + 1
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Tv className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                StreamProxy
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                HLS Proxy Manager
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {channels.length > 0 && (
              <a href="/api/export" download="channels.m3u">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs bg-transparent h-8"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exportar M3U</span>
                </Button>
              </a>
            )}
            <div className="flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_6px_hsl(168,80%,45%)]" />
              <span className="text-[10px] sm:text-xs font-medium text-primary">Activo</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 sm:mb-8">
          <StatsCard
            icon={<Radio className="h-4 w-4" />}
            label="Canales"
            value={channels.length.toString()}
          />
          <StatsCard
            icon={<Globe className="h-4 w-4" />}
            label="Grupos"
            value={Object.keys(groupCounts).length.toString()}
          />
          <StatsCard
            icon={<Zap className="h-4 w-4" />}
            label="Protocolo"
            value="HLS"
          />
          <StatsCard
            icon={<Shield className="h-4 w-4" />}
            label="CORS"
            value="Activo"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
            {/* Add Channel Panel */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-5">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Nuevo Canal
                </h2>
              </div>
              <ChannelForm onAdd={handleAdd} />
            </div>

            {/* Info Panel */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Funcionamiento
                </h3>
              </div>
              <div className="flex flex-col gap-3 text-xs text-muted-foreground leading-relaxed">
                <InfoStep num="01" text="Define un ID unico y la URL original del stream" />
                <InfoStep num="02" text="Se genera /api/proxy/{id}.m3u8 bajo tu dominio" />
                <InfoStep num="03" text="El proxy reescribe todos los recursos para pasar por tu servidor" />
                <InfoStep num="04" text="Los canales se guardan en data/channels.json (persistente en Git)" />
                <InfoStep num="05" text="Las URLs proxy funcionan siempre, sin necesidad del dashboard" />
              </div>
            </div>

            {/* Storage Info */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Almacenamiento
                </h3>
              </div>
              <div className="flex flex-col gap-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Los canales se persisten en{" "}
                  <code className="text-primary bg-primary/10 px-1 py-0.5 rounded text-[10px] font-mono">
                    data/channels.json
                  </code>
                </p>
                <p>
                  Este archivo se incluye en el repositorio Git, por lo que las URLs del proxy
                  continuan funcionando tras cada deploy sin necesidad de recrear los canales.
                </p>
              </div>
            </div>
          </div>

          {/* Channel List */}
          <div className="lg:col-span-8 xl:col-span-9">
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Canales Registrados
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {channels.length} {channels.length === 1 ? "canal" : "canales"}
                </span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                  <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="text-sm">Cargando canales...</span>
                </div>
              ) : (
                <ChannelList
                  channels={channels}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatsCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-base sm:text-lg font-bold text-foreground font-mono">{value}</p>
      </div>
    </div>
  )
}

function InfoStep({ num, text }: { num: string; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-primary font-bold shrink-0 font-mono">{num}</span>
      <span>{text}</span>
    </div>
  )
}
