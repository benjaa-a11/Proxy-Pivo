import React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import "./globals.css"

const _inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const _jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" })

export const metadata: Metadata = {
  title: "StreamProxy - HLS Proxy Manager",
  description:
    "Professional HLS/M3U8 proxy manager with persistent channel storage, universal URL support, and optimized buffering for stable TV streaming.",
}

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${_inter.variable} ${_jetbrains.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
