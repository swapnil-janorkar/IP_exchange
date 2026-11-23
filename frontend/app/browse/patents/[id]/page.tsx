"use client"

import { Suspense, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Bot,
  Calendar,
  Tag,
  FileText,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { expressInterest, getPublicPatent, type ListedPatent } from "@/lib/api"

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default function PatentDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen violet-gradient-bg flex items-center justify-center">
          <div className="flex items-center gap-3 opacity-60">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading patent…
          </div>
        </main>
      }
    >
      <PatentDetailContent />
    </Suspense>
  )
}

function PatentDetailContent() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()

  const [patent, setPatent] = useState<ListedPatent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [interestError, setInterestError] = useState<string | null>(null)
  const [isStartingDeal, setIsStartingDeal] = useState(false)
  const invalidPatentId = Number.isNaN(Number(id))

  const handleExpressInterest = async () => {
    if (!user || !patent) return
    setInterestError(null)
    setIsStartingDeal(true)
    try {
      const deal = await expressInterest(patent.id, user.access_token)
      router.push(`/deals/${deal.id}`)
    } catch (interestFailure) {
      setInterestError(
        interestFailure instanceof Error
          ? interestFailure.message
          : "Could not create a deal.",
      )
    } finally {
      setIsStartingDeal(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !user) return

    const patentId = Number(id)
    if (invalidPatentId) return

    getPublicPatent(patentId, user.access_token)
      .then(setPatent)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load patent.")
      )
      .finally(() => setIsLoading(false))
  }, [id, user, isAuthenticated, invalidPatentId])

  if (!isAuthenticated || !user) {
    return (
      <main className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <Card className="glass-card border-0 max-w-md w-full">
          <CardContent className="p-10 text-center">
            <p className="text-sm opacity-60">Sign in to view patent details.</p>
            <Button asChild className="mt-4">
              <Link href="/">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen violet-gradient-bg">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Back button */}
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-medium opacity-60 hover:opacity-100 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </button>
          <Link href="/deals" className="text-sm font-medium text-primary hover:underline">
            My deals
          </Link>
        </div>

        {isLoading && !invalidPatentId && (
          <div className="flex flex-col items-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm opacity-50">Loading patent…</p>
          </div>
        )}

        {(invalidPatentId || error) && (
          <Card className="glass-card border-0">
            <CardContent className="flex items-center gap-3 p-6">
              <AlertCircle className="h-5 w-5 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
              <p className="text-sm font-medium" style={{ color: "hsl(0 84% 60%)" }}>
                {invalidPatentId ? "Invalid patent ID." : error}
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && patent && (
          <div className="flex flex-col gap-6">
            {/* Header card */}
            <Card className="glass-card border-0">
              <CardContent className="p-6 sm:p-8">
                <div className="flex flex-col gap-4">
                  {/* Title + date */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h1 className="text-2xl font-black tracking-tight sm:text-3xl leading-tight">
                      {patent.title}
                    </h1>
                    <span
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        background: "hsl(243 75% 65% / 0.15)",
                        color: "hsl(243 75% 75%)",
                        border: "1px solid hsl(243 75% 65% / 0.3)",
                      }}
                    >
                      Listed
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs opacity-40">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Listed {formatDate(patent.created_at)}</span>
                  </div>

                  {/* Keywords */}
                  {patent.keywords && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <Tag className="h-3.5 w-3.5 opacity-40 shrink-0" />
                      {patent.keywords
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean)
                        .map((kw) => (
                          <span
                            key={kw}
                            className="rounded-full px-2.5 py-1 text-xs font-medium"
                            style={{
                              background: "hsl(243 75% 65% / 0.12)",
                              color: "hsl(243 75% 72%)",
                              border: "1px solid hsl(243 75% 65% / 0.25)",
                            }}
                          >
                            {kw}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Summary card */}
            <Card className="glass-card border-0">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: "hsl(243 75% 65% / 0.2)" }}
                  >
                    <Sparkles className="h-4 w-4" style={{ color: "hsl(243 75% 70%)" }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold">AI Summary</h2>
                    <p className="text-xs opacity-40">Generated by GPT-4o-mini on approval</p>
                  </div>
                </div>

                {patent.ai_summary ? (
                  <p className="text-sm leading-relaxed opacity-80">{patent.ai_summary}</p>
                ) : (
                  <div
                    className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                    style={{
                      background: "hsl(222 16% 16% / 0.5)",
                      border: "1px solid hsl(222 16% 22%)",
                    }}
                  >
                    <Bot className="h-4 w-4 opacity-40" />
                    <span className="opacity-50">AI summary not yet available for this patent.</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Full description */}
            <Card className="glass-card border-0">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: "hsl(243 75% 65% / 0.15)" }}
                  >
                    <FileText className="h-4 w-4" style={{ color: "hsl(243 75% 70%)" }} />
                  </div>
                  <h2 className="text-sm font-bold">Full Description</h2>
                </div>
                <p className="text-sm leading-relaxed opacity-75 whitespace-pre-wrap">
                  {patent.description}
                </p>
              </CardContent>
            </Card>

            {/* Contact / interest CTA */}
            <Card className="glass-card border-0">
              <CardContent className="p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-sm">Interested in this patent?</h3>
                  <p className="text-xs opacity-50 mt-0.5">
                    Start a deal. Documents stay private until both parties sign the NDA.
                  </p>
                </div>
                {user.role === "organisation" && (
                  <Button
                    className="shrink-0"
                    disabled={isStartingDeal}
                    onClick={handleExpressInterest}
                    style={{
                      background: "hsl(243 75% 65%)",
                      color: "#fff",
                      boxShadow: "0 4px 20px hsl(243 75% 65% / 0.3)",
                    }}
                  >
                    {isStartingDeal && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isStartingDeal ? "Creating deal…" : "Express Interest"}
                  </Button>
                )}
              </CardContent>
            </Card>
            {interestError && (
              <p role="alert" className="text-sm font-medium text-red-400">
                {interestError}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
