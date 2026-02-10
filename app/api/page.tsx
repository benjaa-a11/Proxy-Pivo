"use client"

import React from "react"

import useSWR, { mutate } from "swr"
import { Radio, Tv, Zap, Shield, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChannelForm } from "@/components/channel-form"
import { ChannelList } from "@/components/channel-list"
import type { Channel } from "@/lib/channels"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) return []
    return r.json()
  }).then((data) => (Array.isArray(data) ? data : []))

export default function DashboardPage() {
  const { data, isLoading } = useSWR<Channel[]>("/api/channels", fetcher, {
    refreshInterval: 5000,
    fallbackData: [],
  })
  const channels = Array.isArray(data) ? data : []

  async function handleAdd(name: string, sourceUrl: string) {
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sourceUrl }),
    })
    if (!res.ok) throw new Error("Failed to add")
    await mutate("/api/channels")
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/channels?id=${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error("Failed to delete")
    await mutate("/api/channels")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Tv className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">StreamProxy</h1>
              <p className="text-xs text-muted-foreground">Panel de Control HLS</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {channels.length > 0 && (
              <a href="/api/export" download="channels.m3u">
                <Button variant="outline" size="sm" className="gap-2 text-xs bg-transparent">
                  <Download className="h-3.5 w-3.5" />
                  Exportar M3U
                </Button>
              </a>
            )}
            <div className="flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_6px_hsl(168,80%,45%)]" />
              <span className="text-xs font-medium text-primary">Sistema Activo</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatsCard
            icon={<Radio className="h-4 w-4" />}
            label="Canales Activos"
            value={channels.length.toString()}
          />
          <StatsCard icon={<Zap className="h-4 w-4" />} label="Proxy Transparente" value="HLS" />
          <StatsCard icon={<Shield className="h-4 w-4" />} label="CORS + Headers" value="Activo" />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Channel Panel */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-6">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Agregar Canal</h2>
              </div>
              <ChannelForm onAdd={handleAdd} />
            </div>

            {/* Info Panel */}
            <div className="mt-4 rounded-xl border border-border bg-card p-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Como Funciona
              </h3>
              <div className="flex flex-col gap-3 text-xs text-muted-foreground leading-relaxed">
                <div className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">01</span>
                  <span>Agrega la URL M3U8 original del canal de TV</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">02</span>
                  <span>Se genera una URL .m3u8 proxy bajo tu dominio</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">03</span>
                  <span>El proxy reescribe todos los segmentos .ts para pasar por tu servidor</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">04</span>
                  <span>Usa la URL .m3u8 en VLC, IPTV apps, JWPlayer o cualquier reproductor</span>
                </div>
              </div>
            </div>
          </div>

          {/* Channel List */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Canales Registrados
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {channels.length} {channels.length === 1 ? "canal" : "canales"}
                </span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                  <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="text-sm">Cargando canales...</span>
                </div>
              ) : (
                <ChannelList channels={channels} onDelete={handleDelete} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatsCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground font-mono">{value}</p>
      </div>
    </div>
  )
}
