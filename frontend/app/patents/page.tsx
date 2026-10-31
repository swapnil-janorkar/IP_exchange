"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Plus, Lightbulb, Loader2, AlertCircle, FileText, Calendar, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import PatentListingForm, { StatusBadge } from "@/components/patents/patent-listing-form"
import { getMyPatents, type Patent } from "@/lib/api"

// ─── Patent Card (my patents list) ──────────────────────────────────────────

function PatentCard({ patent }: { patent: Patent }) {
  const createdAt = new Date(patent.created_at).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric",
  })
  const keywordList = patent.keywords.split(",").filter(Boolean)

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:border-opacity-60"
      style={{
        background: "hsl(222 18% 10%)",
        border: "1px solid hsl(222 16% 18%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 65%)" }}
          >
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate" style={{ color: "hsl(210 40% 98%)" }}>
              {patent.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs opacity-40 font-mono">#{patent.id}</span>
              <span className="opacity-20">·</span>
              <span className="flex items-center gap-1 text-xs opacity-40">
                <Calendar className="h-3 w-3" />
                {createdAt}
              </span>
            </div>
          </div>
        </div>
        <StatusBadge status={patent.status} />
      </div>

      <p className="text-xs opacity-50 leading-relaxed line-clamp-2">{patent.description}</p>

      {keywordList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywordList.slice(0, 4).map((kw, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full text-xs"
              style={{ background: "hsl(243 75% 65%/0.08)", color: "hsl(243 75% 70%)", border: "1px solid hsl(243 75% 65%/0.15)" }}
            >
              {kw.trim()}
            </span>
          ))}
          {keywordList.length > 4 && (
            <span className="text-xs opacity-30 self-center">+{keywordList.length - 4}</span>
          )}
        </div>
      )}

      {patent.rejection_reason && (
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2"
          style={{ background: "hsl(0 84% 60%/0.08)", border: "1px solid hsl(0 84% 60%/0.2)" }}
        >
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
          <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>
            <strong>Rejected: </strong>{patent.rejection_reason}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PatentsPage() {
  const { user, isAuthenticated } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [patents, setPatents] = useState<Patent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isInnovator = user?.role === "innovator"

  const loadPatents = useCallback(async () => {
    if (!user?.access_token || !isInnovator) { setIsLoading(false); return }
    setIsLoading(true); setError(null)
    try {
      const list = await getMyPatents(user.access_token)
      setPatents(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patents.")
    } finally { setIsLoading(false) }
  }, [user, isInnovator])

  useEffect(() => { loadPatents() }, [loadPatents])

  // Not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg font-bold opacity-60">Please sign in to access this page.</p>
        </div>
      </div>
    )
  }

  // Not an innovator
  if (!isInnovator) {
    return (
      <div className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-lg font-bold opacity-60">This page is for Innovators.</p>
          <p className="text-sm opacity-40 mt-2">Switch your role to Innovator to list and manage patents.</p>
        </div>
      </div>
    )
  }

  // Show the listing form
  if (showForm) {
    return (
      <div className="min-h-screen violet-gradient-bg py-8">
        <PatentListingForm
          token={user.access_token}
          onSuccess={(patent) => {
            setShowForm(false)
            loadPatents()
          }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    )
  }

  // Patent dashboard
  return (
    <div className="min-h-screen violet-gradient-bg">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8 animate-float-up">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-black tracking-tighter text-gradient">IPX</span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-40">My Patents</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "hsl(210 40% 98%)" }}>
              Your IP Portfolio
            </h1>
            <p className="text-sm opacity-50 mt-1">Manage, track, and submit your inventions</p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={loadPatents} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="lg" onClick={() => setShowForm(true)} style={{ boxShadow: "0 4px 20px hsl(243 75% 65%/0.3)" }}>
              <Plus className="h-4 w-4 mr-2" />
              List a Patent
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5" style={{ background: "hsl(0 84% 60%/0.1)", border: "1px solid hsl(0 84% 60%/0.3)" }}>
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(0 84% 60%)" }}>{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "hsl(243 75% 65%)" }} />
              <p className="text-sm opacity-40">Loading your patents…</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && patents.length === 0 && (
          <Card className="glass-card border-0 animate-scale-in">
            <CardContent className="p-16 flex flex-col items-center gap-5 text-center">
              <div
                className="h-20 w-20 rounded-3xl flex items-center justify-center"
                style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 65%)" }}
              >
                <Lightbulb className="h-10 w-10" />
              </div>
              <div>
                <p className="text-xl font-black tracking-tight mb-2" style={{ color: "hsl(210 40% 98%)" }}>
                  No Patents Yet
                </p>
                <p className="text-sm opacity-50 max-w-xs">
                  List your first patent and start connecting with organisations looking for your innovation.
                </p>
              </div>
              <Button size="lg" onClick={() => setShowForm(true)} style={{ boxShadow: "0 4px 20px hsl(243 75% 65%/0.3)" }}>
                <Plus className="h-4 w-4 mr-2" />
                List Your First Patent
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Patent list */}
        {!isLoading && patents.length > 0 && (
          <div className="flex flex-col gap-4 stagger">
            {patents.map((patent) => (
              <div key={patent.id} className="animate-float-up opacity-0">
                <PatentCard patent={patent} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
