"use client"

import { Suspense, useEffect, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Maximize,
  Signal,
  AlertTriangle,
  RotateCcw,
  Settings,
} from "lucide-react"
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
  const hlsRef = useRef<{ destroy: () => void; startLoad: () => void; recoverMediaError: () => void } | null>(null)
  const [status, setStatus] = useState<"loading" | "buffering" | "playing" | "error">("loading")
  const [muted, setMuted] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [retryCount, setRetryCount] = useState(0)
  const [bufferInfo, setBufferInfo] = useState({ level: 0, latency: 0 })
  const [showControls, setShowControls] = useState(true)
  const controlsTimer = useRef<NodeJS.Timeout | null>(null)

  const { data: channels = [] } = useSWR<Channel[]>("/api/channels", fetcher)
  const channel = channels.find((c) => c.id === channelId)

  const proxyUrl = channelId ? `/api/proxy/${channelId}.m3u8` : null

  // Auto-hide controls
  function resetControlsTimer() {
    setShowControls(true)
    if (controlsTimer.current) clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000)
  }

  const initPlayer = useCallback(async () => {
    if (!proxyUrl || !videoRef.current) return

    const video = videoRef.current
    setStatus("loading")
    setErrorMsg("")

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // Native HLS (Safari/iOS)
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
          setErrorMsg("Error al cargar el stream")
        },
        { once: true },
      )
      return
    }

    // HLS.js
    try {
      const Hls = (await import("hls.js")).default

      if (!Hls.isSupported()) {
        setStatus("error")
        setErrorMsg("Tu navegador no soporta reproduccion HLS")
        return
      }

      const hls = new Hls({
        // Buffer configuration - aggressive for stable playback
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
        maxBufferHole: 0.5,

        // Live sync - keep a comfortable distance from live edge
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 12,
        liveDurationInfinity: true,
        liveBackBufferLength: 30,

        // Loading - generous timeouts and retries
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        fragLoadingMaxRetryTimeout: 30000,
        manifestLoadingTimeOut: 30000,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 1000,
        manifestLoadingMaxRetryTimeout: 30000,
        levelLoadingTimeOut: 30000,
        levelLoadingMaxRetry: 8,
        levelLoadingRetryDelay: 1000,
        levelLoadingMaxRetryTimeout: 30000,

        // Performance
        enableWorker: true,
        lowLatencyMode: false,
        startFragPrefetch: true,
        testBandwidth: true,
        progressive: true,
        backBufferLength: 30,

        // ABR - auto quality switching
        abrEwmaDefaultEstimate: 500000,
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.7,

        // XHR setup
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
        if (status === "loading" || status === "buffering") {
          setStatus("playing")
        }
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        // Update buffer info
        if (video.buffered.length > 0) {
          const end = video.buffered.end(video.buffered.length - 1)
          const level = Math.max(0, end - video.currentTime)
          setBufferInfo((prev) => ({ ...prev, level: Math.round(level * 10) / 10 }))
        }
      })

      hls.on(Hls.Events.ERROR, (_event: string, data: { fatal: boolean; type: string; details: string }) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setStatus("buffering")
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              setStatus("error")
              setErrorMsg(`Error fatal: ${data.details}`)
              break
          }
        }
      })

      // Track buffering state
      video.addEventListener("waiting", () => setStatus("buffering"))
      video.addEventListener("playing", () => setStatus("playing"))
    } catch {
      setStatus("error")
      setErrorMsg("Error al inicializar el reproductor")
    }
  }, [proxyUrl])

  useEffect(() => {
    initPlayer()
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [proxyUrl, retryCount, initPlayer])

  useEffect(() => {
    resetControlsTimer()
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current)
    }
  }, [])

  function toggleMute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setMuted(!muted)
    }
  }

  function toggleFullscreen() {
    const container = videoRef.current?.parentElement?.parentElement
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
        <div className="text-center flex flex-col items-center gap-4 px-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Canal no especificado</h1>
          <p className="text-sm text-muted-foreground">{"Usa ?id=CHANNEL_ID en la URL"}</p>
          <a
            href="/"
            className="text-primary text-sm hover:underline flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al panel
          </a>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-[hsl(220,20%,2%)] flex flex-col relative select-none"
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
    >
      {/* Top Bar */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-[hsl(220,20%,2%)] to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Panel</span>
          </a>
          {channel && (
            <div className="flex items-center gap-2 ml-2 sm:ml-4">
              <span className="text-foreground/20">|</span>
              <span className="text-foreground font-semibold text-sm truncate max-w-[200px] sm:max-w-none">
                {channel.name}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === "playing" && (
            <div className="flex items-center gap-1.5 bg-green-500/20 text-green-400 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border border-green-500/30">
              <Signal className="h-3 w-3" />
              <span>EN VIVO</span>
            </div>
          )}
          {(status === "loading" || status === "buffering") && (
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-medium border border-primary/20">
              <div className="h-2 w-2 border border-primary/30 border-t-primary rounded-full animate-spin" />
              <span>{status === "loading" ? "Cargando" : "Buffering"}</span>
            </div>
          )}
          {bufferInfo.level > 0 && status === "playing" && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-foreground/40 font-mono">
              <Settings className="h-3 w-3" />
              <span>Buffer: {bufferInfo.level}s</span>
            </div>
          )}
        </div>
      </div>

      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center relative">
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-[hsl(220,20%,2%)]">
            <div className="relative">
              <div className="h-12 w-12 border-2 border-primary/20 rounded-full" />
              <div className="absolute inset-0 h-12 w-12 border-2 border-transparent border-t-primary rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm text-foreground/60 mb-1">Conectando al stream...</p>
              <p className="text-[10px] text-foreground/30 font-mono max-w-xs truncate px-4">
                {proxyUrl}
              </p>
            </div>
          </div>
        )}

        {status === "buffering" && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-3 bg-[hsl(220,20%,2%)/0.7] rounded-2xl p-6">
              <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-foreground/50">Buffering...</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 z-10 bg-[hsl(220,20%,2%)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground mb-1">Error de Conexion</p>
              <p className="text-sm text-foreground/50 max-w-md px-4">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
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
          onClick={resetControlsTimer}
        />
      </div>

      {/* Bottom Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-[hsl(220,20%,2%)] to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleMute}
            className="p-2.5 text-foreground/70 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/10"
            title={muted ? "Activar sonido" : "Silenciar"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRetry}
            className="p-2.5 text-foreground/70 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/10"
            title="Recargar stream"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 text-foreground/70 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/10"
            title="Pantalla completa"
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
          <div className="relative">
            <div className="h-12 w-12 border-2 border-primary/20 rounded-full" />
            <div className="absolute inset-0 h-12 w-12 border-2 border-transparent border-t-primary rounded-full animate-spin" />
          </div>
        </div>
      }
    >
      <PlayerContent />
    </Suspense>
  )
}
