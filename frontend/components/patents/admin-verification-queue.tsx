"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  Shield,
  CheckCircle2,
  XCircle,
  List,
  AlertCircle,
  Loader2,
  FileText,
  RefreshCw,
  Eye,
  Tag,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  getVerificationQueue,
  approvePatent,
  rejectPatent,
  listPatent,
  type Patent,
} from "@/lib/api"
import { StatusBadge } from "./patent-listing-form"

// ─── Reject Modal ────────────────────────────────────────────────────────────

function RejectModal({
  patent,
  onConfirm,
  onCancel,
  isLoading,
}: {
  patent: Patent
  onConfirm: (reason: string) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [reason, setReason] = useState("")
  const [focused, setFocused] = useState(false)
  const valid = reason.trim().length >= 5

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "hsl(222 20% 7% / 0.8)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-5 animate-scale-in"
        style={{ background: "hsl(222 18% 11%)", border: "1px solid hsl(222 16% 22%)", boxShadow: "0 24px 64px hsl(0 0% 0% / 0.5)" }}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "hsl(0 84% 60%/0.12)", color: "hsl(0 84% 60%)" }}>
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm" style={{ color: "hsl(210 40% 98%)" }}>Reject Patent</h3>
            <p className="text-xs opacity-50 mt-0.5 leading-relaxed">
              Provide a clear reason so the innovator knows what to fix before resubmitting.
            </p>
          </div>
        </div>

        <div className="rounded-xl p-3 text-xs" style={{ background: "hsl(222 16% 9%)", border: "1px solid hsl(222 16% 18%)" }}>
          <span className="opacity-40">Patent: </span>
          <span className="font-semibold" style={{ color: "hsl(210 40% 98%)" }}>{patent.title}</span>
          <span className="opacity-40"> (#{patent.id})</span>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold" style={{ color: "hsl(210 40% 75%)" }}>
            Rejection Reason <span style={{ color: "hsl(0 84% 60%)" }}>*</span>
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Missing proof of filing, description too vague, duplicate submission…"
            rows={4}
            style={{
              background: "hsl(222 16% 9%)",
              border: `1px solid ${!valid && reason.length > 0 ? "hsl(0 84% 60%/0.5)" : focused ? "hsl(0 84% 60%/0.5)" : "hsl(222 16% 20%)"}`,
              color: "hsl(210 40% 98%)",
              borderRadius: "0.75rem",
              padding: "0.65rem 0.875rem",
              fontSize: "0.875rem",
              outline: "none",
              width: "100%",
              resize: "vertical" as const,
              boxShadow: focused ? "0 0 0 3px hsl(0 84% 60%/0.08)" : "none",
              transition: "border-color 0.15s",
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {!valid && reason.length > 0 && (
            <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>Reason must be at least 5 characters.</p>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={isLoading}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
            disabled={!valid || isLoading}
          >
            {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rejecting…</> : <><XCircle className="h-4 w-4 mr-2" /> Reject Patent</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Patent Queue Card ───────────────────────────────────────────────────────

function PatentQueueCard({
  patent,
  onApprove,
  onReject,
  onList,
  actionLoading,
}: {
  patent: Patent
  onApprove: () => void
  onReject: () => void
  onList: () => void
  actionLoading: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const submittedAt = new Date(patent.updated_at).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric",
  })
  const isVerified = patent.status === "verified"
  const isPending = patent.status === "pending_verification"

  return (
    <div
      className="rounded-2xl transition-all duration-200"
      style={{
        background: "hsl(222 18% 10%)",
        border: `1px solid ${expanded ? "hsl(222 16% 26%)" : "hsl(222 16% 18%)"}`,
        boxShadow: expanded ? "0 8px 32px hsl(0 0% 0%/0.3)" : "none",
      }}
    >
      {/* Card Header */}
      <div className="p-5 flex items-start gap-4">
        {/* Icon */}
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 65%)" }}
        >
          <FileText className="h-5 w-5" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: "hsl(210 40% 98%)" }}>{patent.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs opacity-40 font-mono">#{patent.id}</span>
                <span className="opacity-20">·</span>
                <span className="text-xs opacity-40">Submitted {submittedAt}</span>
                <span className="opacity-20">·</span>
                <span className="text-xs opacity-40">Owner #{patent.owner_id}</span>
              </div>
            </div>
            <StatusBadge status={patent.status} />
          </div>

          {/* Keywords */}
          {patent.keywords && (
            <div className="flex flex-wrap gap-1 mt-2">
              {patent.keywords.split(",").filter(Boolean).slice(0, 4).map((kw, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "hsl(243 75% 65%/0.08)", color: "hsl(243 75% 70%)", border: "1px solid hsl(243 75% 65%/0.15)" }}>
                  {kw.trim()}
                </span>
              ))}
              {patent.keywords.split(",").filter(Boolean).length > 4 && (
                <span className="text-xs opacity-30 self-center">+{patent.keywords.split(",").filter(Boolean).length - 4} more</span>
              )}
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="opacity-40 hover:opacity-70 transition-opacity shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div
          className="px-5 pb-5 flex flex-col gap-4 animate-fade-in"
          style={{ borderTop: "1px solid hsl(222 16% 16%)" }}
        >
          <div className="pt-4">
            <p className="text-xs uppercase tracking-wider opacity-40 mb-2">Description</p>
            <p className="text-sm opacity-70 leading-relaxed">{patent.description}</p>
          </div>

          {patent.proof_document_url ? (
            <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: "hsl(142 71% 55%/0.06)", border: "1px solid hsl(142 71% 55%/0.2)" }}>
              <FileText className="h-4 w-4 shrink-0" style={{ color: "hsl(142 71% 55%)" }} />
              <span className="text-xs font-medium flex-1" style={{ color: "hsl(142 71% 55%)" }}>Proof document attached</span>
              <a
                href={`http://localhost:8000${patent.proof_document_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: "hsl(142 71% 55%)" }}
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: "hsl(38 92% 60%/0.06)", border: "1px solid hsl(38 92% 60%/0.2)" }}>
              <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "hsl(38 92% 60%)" }} />
              <span className="text-xs font-medium" style={{ color: "hsl(38 92% 60%)" }}>No proof document provided</span>
            </div>
          )}

          {patent.ai_summary && (
            <div>
              <p className="text-xs uppercase tracking-wider opacity-40 mb-2">AI Summary</p>
              <p className="text-xs opacity-60 leading-relaxed italic">{patent.ai_summary}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div
        className="px-5 py-4 flex items-center gap-3 flex-wrap"
        style={{ borderTop: "1px solid hsl(222 16% 14%)" }}
      >
        {/* View details shortcut */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold opacity-40 hover:opacity-70 transition-opacity"
        >
          <Eye className="h-3.5 w-3.5" />
          {expanded ? "Hide details" : "View details"}
        </button>

        <div className="flex-1" />

        {isPending && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={actionLoading}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={onApprove}
              disabled={actionLoading}
              style={{ background: "hsl(142 71% 45%)", color: "#fff", boxShadow: "0 4px 16px hsl(142 71% 45%/0.3)" }}
              className="hover:opacity-90"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Approve
            </Button>
          </>
        )}

        {isVerified && (
          <Button
            size="sm"
            onClick={onList}
            disabled={actionLoading}
            style={{ background: "hsl(243 75% 65%)", color: "#fff", boxShadow: "0 4px 16px hsl(243 75% 65%/0.3)" }}
            className="hover:opacity-90"
          >
            {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <List className="h-4 w-4 mr-1.5" />}
            Publish to Marketplace
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Stats Bar ───────────────────────────────────────────────────────────────

function StatsBar({ patents }: { patents: Patent[] }) {
  const pending = patents.filter((p) => p.status === "pending_verification").length
  const verified = patents.filter((p) => p.status === "verified").length

  const stats = [
    { label: "In Queue", value: pending, color: "hsl(38 92% 60%)", icon: <ClipboardList className="h-4 w-4" /> },
    { label: "Verified", value: verified, color: "hsl(142 71% 55%)", icon: <CheckCircle2 className="h-4 w-4" /> },
    { label: "Total Shown", value: patents.length, color: "hsl(243 75% 65%)", icon: <Shield className="h-4 w-4" /> },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-2xl p-4 flex flex-col gap-2"
          style={{ background: "hsl(222 18% 10%)", border: "1px solid hsl(222 16% 18%)" }}
        >
          <div className="flex items-center gap-2" style={{ color: s.color }}>
            {s.icon}
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{s.label}</span>
          </div>
          <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface AdminVerificationQueueProps {
  token: string
}

export default function AdminVerificationQueue({ token }: AdminVerificationQueueProps) {
  const [patents, setPatents] = useState<Patent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Patent | null>(null)
  const [filter, setFilter] = useState<"all" | "pending_verification" | "verified">("all")

  const loadQueue = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      const queue = await getVerificationQueue(token, 50, 0)
      setPatents(queue)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load verification queue.")
    } finally { setIsLoading(false) }
  }, [token])

  useEffect(() => { loadQueue() }, [loadQueue])

  const handleApprove = async (patent: Patent) => {
    setActionLoading(patent.id)
    try {
      const updated = await approvePatent(patent.id, token)
      setPatents((prev) => prev.map((p) => (p.id === patent.id ? updated : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.")
    } finally { setActionLoading(null) }
  }

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectTarget) return
    setActionLoading(rejectTarget.id)
    try {
      await rejectPatent(rejectTarget.id, reason, token)
      setPatents((prev) => prev.filter((p) => p.id !== rejectTarget.id))
      setRejectTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed.")
    } finally { setActionLoading(null) }
  }

  const handleList = async (patent: Patent) => {
    setActionLoading(patent.id)
    try {
      const updated = await listPatent(patent.id, token)
      setPatents((prev) => prev.filter((p) => p.id !== patent.id))
      void updated
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish patent.")
    } finally { setActionLoading(null) }
  }

  const filtered = filter === "all" ? patents : patents.filter((p) => p.status === filter)

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 animate-float-up">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(243 75% 65%/0.15)", color: "hsl(243 75% 65%)" }}>
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight" style={{ color: "hsl(210 40% 98%)" }}>
              Verification Queue
            </h1>
            <p className="text-sm opacity-50">Review and approve patent submissions — FIFO order</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadQueue} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {!isLoading && patents.length > 0 && <StatsBar patents={patents} />}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5 animate-fade-in" style={{ background: "hsl(0 84% 60%/0.1)", border: "1px solid hsl(0 84% 60%/0.3)" }}>
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
          <p className="text-sm font-medium" style={{ color: "hsl(0 84% 60%)" }}>{error}</p>
        </div>
      )}

      {/* Filter tabs */}
      {!isLoading && patents.length > 0 && (
        <div className="flex gap-2 mb-5">
          {(["all", "pending_verification", "verified"] as const).map((f) => {
            const labels: Record<string, string> = {
              all: "All",
              pending_verification: "Pending Review",
              verified: "Verified → Publish",
            }
            const active = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200"
                style={{
                  background: active ? "hsl(243 75% 65%/0.15)" : "transparent",
                  color: active ? "hsl(243 75% 75%)" : "hsl(215 20% 50%)",
                  border: `1px solid ${active ? "hsl(243 75% 65%/0.4)" : "hsl(222 16% 20%)"}`,
                }}
              >
                {labels[f]}
                {f === "pending_verification" && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs" style={{ background: "hsl(38 92% 60%/0.2)", color: "hsl(38 92% 60%)" }}>
                    {patents.filter((p) => p.status === "pending_verification").length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "hsl(243 75% 65%)" }} />
            <p className="text-sm opacity-40">Loading queue…</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <Card className="glass-card border-0">
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: "hsl(142 71% 55%/0.1)", color: "hsl(142 71% 55%)" }}>
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: "hsl(210 40% 98%)" }}>
                {patents.length === 0 ? "Queue is empty" : "No patents match filter"}
              </p>
              <p className="text-sm opacity-40 mt-1">
                {patents.length === 0
                  ? "No patents are awaiting review right now."
                  : `Try switching to a different filter tab.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue items */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex flex-col gap-4 stagger">
          {filtered.map((patent) => (
            <div key={patent.id} className="animate-float-up opacity-0">
              <PatentQueueCard
                patent={patent}
                onApprove={() => handleApprove(patent)}
                onReject={() => setRejectTarget(patent)}
                onList={() => handleList(patent)}
                actionLoading={actionLoading === patent.id}
              />
            </div>
          ))}
        </div>
      )}

      {/* Workflow legend */}
      {!isLoading && (
        <div
          className="mt-8 rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "hsl(222 18% 9%)", border: "1px solid hsl(222 16% 16%)" }}
        >
          <p className="text-xs uppercase tracking-wider opacity-40 font-semibold">Admin Workflow</p>
          <div className="flex items-center gap-2 flex-wrap text-xs opacity-60">
            <span className="font-semibold" style={{ color: "hsl(38 92% 60%)" }}>Pending Review</span>
            <span>→ Approve →</span>
            <span className="font-semibold" style={{ color: "hsl(142 71% 55%)" }}>Verified</span>
            <span>→ Publish →</span>
            <span className="font-semibold" style={{ color: "hsl(243 75% 65%)" }}>Listed</span>
            <span className="opacity-40 mx-2">|</span>
            <span>Pending Review → Reject →</span>
            <span className="font-semibold" style={{ color: "hsl(0 84% 60%)" }}>Rejected</span>
            <span className="opacity-40">(owner can fix &amp; resubmit)</span>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          patent={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          isLoading={actionLoading === rejectTarget.id}
        />
      )}
    </div>
  )
}
