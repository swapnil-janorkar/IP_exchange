import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/auth-context"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "IPX — IP Exchange Platform",
  description:
    "The professional platform for innovators and organisations to list, discover, and transact intellectual property.",
  keywords: ["IP Exchange", "intellectual property", "patents", "licensing", "innovation"],
  openGraph: {
    title: "IPX — IP Exchange Platform",
    description: "List, discover, and transact intellectual property with confidence.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
