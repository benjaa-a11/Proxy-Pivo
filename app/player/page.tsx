"use client"

import { Suspense, useEffect, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Volume2, VolumeX, Maximize, Signal, AlertTriangle, RotateCcw } from "lucide-react"
import useSWR from "swr"
import type { Channel } from "@/lib/channels"

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((d) => (Array.isArray(d) ? d : []))

function PlayerContent() {
  const searchParams = useSearchParams()
  const channelId = searchParams.get("id")
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<{ destroy: () => void } | null>(null)
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading")
  const [muted, setMuted] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [retryCount, setRetryCount] = useState(0)

  const { data: channels = [] } = useSWR<Channel[]>("/api/channels", fetcher)
  const channel = channels.find((c) => c.id === channelId)

  const proxyUrl = channelId ? `/api/proxy/${channelId}.m3u8` : null

  const initPlayer = useCallback(async () => {
    if (!proxyUrl || !videoRef.current) return

    const video = videoRef.current
    setStatus("loading")
    setErrorMsg("")

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // Check native HLS support (Safari/iOS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxyUrl
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.play().catch(() => {})
          setStatus("playing")
        },
        { once: true },
      )
      video.addEventListener(
        "error",
        () => {
          setStatus("error")
          setErrorMsg("Error al cargar el stream nativo")
        },
        { once: true },
      )
      return
    }

    // Use HLS.js
    try {
      const Hls = (await import("hls.js")).default

      if (!Hls.isSupported()) {
        setStatus("error")
        setErrorMsg("Tu navegador no soporta HLS")
        return
      }

      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: true,
        enableWorker: true,
        lowLatencyMode: false,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 1000,
        startFragPrefetch: true,
        testBandwidth: true,
        progressive: true,
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.withCredentials = false
        },
      })

      hlsRef.current = hls

      hls.loadSource(proxyUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        setStatus("playing")
        setRetryCount(0)
      })

      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (status !== "playing") {
          setStatus("playing")
        }
      })

      hls.on(Hls.Events.ERROR, (_event: string, data: { fatal: boolean; type: string; details: string }) => {
        console.error("[v0] HLS Error:", data.type, data.details, "fatal:", data.fatal)
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("[v0] Network error, attempting recovery...")
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("[v0] Media error, attempting recovery...")
              hls.recoverMediaError()
              break
            default:
              setStatus("error")
              setErrorMsg(`Error fatal: ${data.details}`)
              break
          }
        }
      })
    } catch (err) {
      console.error("[v0] Player init error:", err)
      setStatus("error")
      setErrorMsg("Error al inicializar el reproductor")
    }
  }, [proxyUrl, status])

  useEffect(() => {
    initPlayer()
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxyUrl, retryCount])

  function toggleMute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setMuted(!muted)
    }
  }

  function toggleFullscreen() {
    const container = videoRef.current?.parentElement
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }

  function handleRetry() {
    setRetryCount((c) => c + 1)
  }

  if (!channelId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold text-foreground">Canal no especificado</h1>
          <p className="text-sm text-muted-foreground">{"Usa ?id=CHANNEL_ID en la URL"}</p>
          <a href="/" className="text-primary text-sm hover:underline">
            Volver al panel
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[hsl(220,20%,2%)] flex flex-col relative">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-[hsl(220,20%,2%)/0.9] to-transparent">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />
            <span>Panel</span>
          </a>
          {channel && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-foreground/30 text-xs">|</span>
              <span className="text-foreground font-semibold text-sm">{channel.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {status === "playing" && (
            <div className="flex items-center gap-2 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-medium border border-green-500/30">
              <Signal className="h-3 w-3" />
              <span>EN VIVO</span>
            </div>
          )}
          {status === "loading" && (
            <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium border border-primary/20">
              <div className="h-2 w-2 border border-primary/30 border-t-primary rounded-full animate-spin" />
              <span>Cargando</span>
            </div>
          )}
        </div>
      </div>

      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center relative">
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-[hsl(220,20%,2%)]">
            <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-foreground/60">Conectando al stream...</p>
            <p className="text-xs text-foreground/30 font-mono">{proxyUrl}</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-[hsl(220,20%,2%)]">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <p className="text-lg font-bold text-destructive">Error de Conexion</p>
            <p className="text-sm text-foreground/50 max-w-md text-center">{errorMsg}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full max-h-screen object-contain"
          playsInline
          autoPlay
          controls={false}
        />
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-[hsl(220,20%,2%)/0.9] to-transparent">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/10"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/10"
            title="Recargar stream"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 text-foreground/70 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/10"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[hsl(220,20%,2%)] flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <PlayerContent />
    </Suspense>
  )
}
