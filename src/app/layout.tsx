import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AuroraStream — Player IPTV Xtream Codes",
  description:
    "Player IPTV com interface estilo dashboard Aurora (Xbox 360): filmes, séries, TV ao vivo e futebol via Xtream Codes, com buffer anti-travamento e visual glass.",
  keywords: ["IPTV", "Xtream Codes", "player", "TV Box", "HLS", "m3u8"],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  // PWA instalável (Android/Chrome/Edge — base para o futuro APK via TWA)
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AuroraStream",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#05070b] text-white`}
      >
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          richColors
          toastOptions={{
            style: {
              background: "rgba(15, 20, 28, 0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
            },
          }}
        />
      </body>
    </html>
  );
}
