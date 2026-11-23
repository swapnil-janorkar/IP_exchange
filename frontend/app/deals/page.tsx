"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { getMyDeals, type DealSummary } from "@/lib/api"

export default function DealsPage() {
  const { user, isAuthenticated } = useAuth()
  const [deals, setDeals] = useState<DealSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getMyDeals(user.access_token)
      .then(setDeals)
      .catch((failure) =>
        setError(failure instanceof Error ? failure.message : "Could not load deals."),
      )
      .finally(() => setIsLoading(false))
  }, [user])

  if (!isAuthenticated || !user) {
    return (
      <main className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <Card className="glass-card border-0 max-w-md w-full">
          <CardContent className="p-10 text-center">
            <p className="text-sm opacity-60">Sign in to view your deals.</p>
            <Button asChild className="mt-4"><Link href="/">Go to sign in</Link></Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen violet-gradient-bg">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link href={user.role === "innovator" ? "/patents" : "/browse"} className="mb-6 inline-flex items-center gap-2 text-sm opacity-60 hover:opacity-100">
          <ArrowLeft className="h-4 w-4" />
          {user.role === "innovator" ? "My patents" : "Browse patents"}
        </Link>
        <header className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-40">IPX</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">My deals</h1>
          <p className="mt-2 text-sm opacity-55">Review interest, sign NDAs, and access shared documents.</p>
        </header>

        {error && (
          <Card className="glass-card mb-5 border-0">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-16 opacity-60">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading deals…
          </div>
        )}

        {!isLoading && !error && deals.length === 0 && (
          <Card className="glass-card border-0">
            <CardContent className="p-10 text-center">
              <h2 className="font-bold">No deals yet</h2>
              <p className="mt-2 text-sm opacity-55">
                {user.role === "organisation"
                  ? "Express interest in a listed patent to start a deal."
                  : "Organisation interest in your listed patents will appear here."}
              </p>
              {user.role === "organisation" && (
                <Button asChild className="mt-5"><Link href="/browse">Browse patents</Link></Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {deals.map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`} className="block group">
              <Card className="glass-card border-0 transition-all group-hover:scale-[1.005]">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <h2 className="font-bold group-hover:text-primary">{deal.patent_title}</h2>
                    <p className="mt-1 text-xs opacity-45">
                      Deal #{deal.id} · {user.id === deal.buyer_id ? "Your interest" : "Incoming interest"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold capitalize">{deal.status.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs opacity-50">
                      {deal.nda_complete
                        ? "NDA signed · documents available"
                        : deal.nda_document_id
                          ? "NDA awaiting signatures"
                          : "NDA not uploaded"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
