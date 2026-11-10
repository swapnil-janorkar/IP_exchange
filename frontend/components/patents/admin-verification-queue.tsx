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
  MessageSquare,
  Sparkles,
  TrendingUp,
  CircleDot,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  getVerificationQueue,
  approvePatent,
  rejectPatent,
  listPatent,
  requestPatentInfo,
  markPatentSold,
  type Patent,
} from "@/lib/api"
import { StatusBadge } from "./patent-listing-form"

// ─── Workflow status order for display ───────────────────────────────────────

const STATUS_FLOW = [
  { key: "draft",                     label: "Draft",           color: "hsl(215 20% 55%)" },
  { key: "pending_verification",      label: "Pending Review",  color: "hsl(38 92% 60%)"  },
  { key: "additional_info_requested", label: "Info Requested",  color: "hsl(280 70% 65%)" },
  { key: "verified",                  label: "Verified",        color: "hsl(142 71% 55%)" },
  { key: "listed",                    label: "Listed",          color: "hsl(243 75% 65%)" },
  { key: "sold",                      label: "Sold",            color: "hsl(20 80% 55%)"  },
]

// ─── Modal Base ───────────────────────────────────────────────────────────────

function ModalBase({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "hsl(222 20% 7% / 0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-5 animate-scale-in"
        style={{
          background: "hsl(222 18% 11%)",
          border: "1px solid hsl(222 16% 22%)",
          boxShadow: "0 24px 64px hsl(0 0% 0% / 0.5)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

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
    <ModalBase onClose={onCancel}>
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
          onClick={() => onConfirm(reason.trim())}
          disabled={!valid || isLoading}
          style={{ background: "hsl(0 84% 55%)", color: "#fff" }}
        >
          {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejecting…</> : <><XCircle className="h-4 w-4 mr-2" />Reject Patent</>}
        </Button>
      </div>
    </ModalBase>
  )
}

// ─── Request Info Modal ───────────────────────────────────────────────────────

function RequestInfoModal({
  patent,
  onConfirm,
  onCancel,
  isLoading,
}: {
  patent: Patent
  onConfirm: (message: string) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [message, setMessage] = useState("")
  const [focused, setFocused] = useState(false)
  const valid = message.trim().length >= 10

  return (
    <ModalBase onClose={onCancel}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "hsl(280 70% 65%/0.12)", color: "hsl(280 70% 65%)" }}>
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold text-sm" style={{ color: "hsl(210 40% 98%)" }}>Request Additional Information</h3>
          <p className="text-xs opacity-50 mt-0.5 leading-relaxed">
            Ask the innovator to provide more information before you can approve.
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
          Information Requested <span style={{ color: "hsl(0 84% 60%)" }}>*</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Please provide the official filing number and jurisdiction. Also attach a notarized copy of the grant certificate…"
          rows={4}
          style={{
            background: "hsl(222 16% 9%)",
            border: `1px solid ${focused ? "hsl(280 70% 65%/0.5)" : "hsl(222 16% 20%)"}`,
            color: "hsl(210 40% 98%)",
            borderRadius: "0.75rem",
            padding: "0.65rem 0.875rem",
            fontSize: "0.875rem",
            outline: "none",
            width: "100%",
            resize: "vertical" as const,
            transition: "border-color 0.15s",
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {!valid && message.length > 0 && (
          <p className="text-xs" style={{ color: "hsl(38 92% 60%)" }}>Message must be at least 10 characters.</p>
        )}
      </div>

      <div className="flex gap-3 justify-end pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button
          onClick={() => onConfirm(message.trim())}
          disabled={!valid || isLoading}
          style={{ background: "hsl(280 70% 55%)", color: "#fff" }}
        >
          {isLoading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
            : <><MessageSquare className="h-4 w-4 mr-2" />Send Request</>}
        </Button>
      </div>
    </ModalBase>
  )
}

// ─── Status Flow Diagram (inline) ────────────────────────────────────────────

function StatusFlowDiagram({ currentStatus }: { currentStatus: string }) {
  return (
    <div className="flex items-center gap-1 flex-wrap mt-2">
      {STATUS_FLOW.map((s, i) => {
        const isActive = s.key === currentStatus
        const isPast = STATUS_FLOW.findIndex((x) => x.key === currentStatus) > i
        return (
          <React.Fragment key={s.key}>
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: isActive ? `${s.color}22` : isPast ? "hsl(142 71% 55%/0.08)" : "transparent",
                color: isActive ? s.color : isPast ? "hsl(142 71% 55%)" : "hsl(215 20% 40%)",
                border: `1px solid ${isActive ? `${s.color}44` : isPast ? "hsl(142 71% 55%/0.2)" : "hsl(222 16% 20%)"}`,
              }}
            >
              {isActive && <CircleDot className="h-3 w-3" />}
              {s.label}
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <span className="text-xs opacity-20">→</span>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Patent Queue Card ────────────────────────────────────────────────────────

function PatentQueueCard({
  patent,
  onApprove,
  onReject,
  onList,
  onRequestInfo,
  onMarkSold,
  actionLoading,
}: {
  patent: Patent
  onApprove: () => void
  onReject: () => void
  onList: () => void
  onRequestInfo: () => void
  onMarkSold: () => void
  actionLoading: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const submittedAt = new Date(patent.updated_at).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric",
  })
  const isVerified = patent.status === "verified"
  const isPending = patent.status === "pending_verification"
  const isInfoRequested = patent.status === "additional_info_requested"
  const isListed = patent.status === "listed"

  return (
    <div
      className="rounded-2xl transition-all duration-200"
      style={{
        background: "hsl(222 18% 10%)",
        border: `1px solid ${expanded ? "hsl(222 16% 26%)" : isInfoRequested ? "hsl(280 70% 65%/0.3)" : "hsl(222 16% 18%)"}`,
        boxShadow: expanded ? "0 8px 32px hsl(0 0% 0%/0.3)" : "none",
      }}
    >
      {/* Header */}
      <div className="p-5 flex items-start gap-4">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 65%)" }}
        >
          <FileText className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: "hsl(210 40% 98%)" }}>{patent.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs opacity-40 font-mono">#{patent.id}</span>
                <span className="opacity-20">·</span>
                <span className="text-xs opacity-40">Updated {submittedAt}</span>
                <span className="opacity-20">·</span>
                <span className="text-xs opacity-40">Owner #{patent.owner_id}</span>
              </div>
            </div>
            <StatusBadge status={patent.status} />
          </div>

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

        <button
          onClick={() => setExpanded((v) => !v)}
          className="opacity-40 hover:opacity-70 transition-opacity shrink-0"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-4 animate-fade-in" style={{ borderTop: "1px solid hsl(222 16% 16%)" }}>
          {/* Status flow diagram */}
          <div className="pt-4">
            <p className="text-xs uppercase tracking-wider opacity-40 mb-2">Status Workflow</p>
            <StatusFlowDiagram currentStatus={patent.status} />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider opacity-40 mb-2">Description</p>
            <p className="text-sm opacity-70 leading-relaxed">{patent.description}</p>
          </div>

          {/* Proof document */}
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

          {/* Info request message */}
          {isInfoRequested && patent.rejection_reason && (
            <div className="flex flex-col gap-2 rounded-xl p-4" style={{ background: "hsl(280 70% 65%/0.06)", border: "1px solid hsl(280 70% 65%/0.25)" }}>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" style={{ color: "hsl(280 70% 65%)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(280 70% 65%)" }}>
                  Info Requested from Innovator
                </span>
              </div>
              <p className="text-xs opacity-70 leading-relaxed">{patent.rejection_reason}</p>
            </div>
          )}

          {/* AI Summary */}
          {patent.ai_summary && (
            <div className="flex flex-col gap-2 rounded-xl p-4" style={{ background: "hsl(243 75% 65%/0.06)", border: "1px solid hsl(243 75% 65%/0.2)" }}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" style={{ color: "hsl(243 75% 70%)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(243 75% 70%)" }}>
                  AI-Generated Summary
                </span>
              </div>
              <p className="text-xs opacity-70 leading-relaxed italic">{patent.ai_summary}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div
        className="px-5 py-4 flex items-center gap-2 flex-wrap"
        style={{ borderTop: "1px solid hsl(222 16% 14%)" }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold opacity-40 hover:opacity-70 transition-opacity"
        >
          <Eye className="h-3.5 w-3.5" />
          {expanded ? "Hide details" : "View details"}
        </button>

        <div className="flex-1" />

        {/* PENDING_VERIFICATION actions */}
        {isPending && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={actionLoading}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={onRequestInfo}
              disabled={actionLoading}
              style={{ background: "hsl(280 70% 55%)", color: "#fff" }}
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Request Info
            </Button>
            <Button
              size="sm"
              onClick={onApprove}
              disabled={actionLoading}
              style={{ background: "hsl(142 71% 45%)", color: "#fff", boxShadow: "0 4px 16px hsl(142 71% 45%/0.3)" }}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Approve
            </Button>
          </>
        )}

        {/* ADDITIONAL_INFO_REQUESTED — can still approve or reject */}
        {isInfoRequested && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={actionLoading}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={onApprove}
              disabled={actionLoading}
              style={{ background: "hsl(142 71% 45%)", color: "#fff" }}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Approve Anyway
            </Button>
          </>
        )}

        {/* VERIFIED — publish to marketplace */}
        {isVerified && (
          <Button
            size="sm"
            onClick={onList}
            disabled={actionLoading}
            style={{ background: "hsl(243 75% 65%)", color: "#fff", boxShadow: "0 4px 16px hsl(243 75% 65%/0.3)" }}
          >
            {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <List className="h-4 w-4 mr-1.5" />}
            Publish to Marketplace
          </Button>
        )}

        {/* LISTED — mark as sold */}
        {isListed && (
          <Button
            size="sm"
            onClick={onMarkSold}
            disabled={actionLoading}
            style={{ background: "hsl(20 80% 50%)", color: "#fff", boxShadow: "0 4px 16px hsl(20 80% 50%/0.3)" }}
          >
            {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-1.5" />}
            Mark as Sold
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ patents }: { patents: Patent[] }) {
  const pending = patents.filter((p) => p.status === "pending_verification").length
  const infoReq = patents.filter((p) => p.status === "additional_info_requested").length
  const verified = patents.filter((p) => p.status === "verified").length
  const listed = patents.filter((p) => p.status === "listed").length

  const stats = [
    { label: "Pending Review", value: pending,  color: "hsl(38 92% 60%)",  icon: <ClipboardList className="h-4 w-4" /> },
    { label: "Info Requested", value: infoReq,  color: "hsl(280 70% 65%)", icon: <MessageSquare  className="h-4 w-4" /> },
    { label: "Verified",       value: verified, color: "hsl(142 71% 55%)", icon: <CheckCircle2   className="h-4 w-4" /> },
    { label: "Listed",         value: listed,   color: "hsl(243 75% 65%)", icon: <Shield         className="h-4 w-4" /> },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: "hsl(222 18% 10%)", border: "1px solid hsl(222 16% 18%)" }}>
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

// ─── Main Component ───────────────────────────────────────────────────────────

type FilterTab = "all" | "pending_verification" | "additional_info_requested" | "verified" | "listed"

interface AdminVerificationQueueProps {
  token: string
}

export default function AdminVerificationQueue({ token }: AdminVerificationQueueProps) {
  const [patents, setPatents] = useState<Patent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Patent | null>(null)
  const [infoTarget, setInfoTarget] = useState<Patent | null>(null)
  const [filter, setFilter] = useState<FilterTab>("all")

  const loadQueue = useCallback(async () => {
    setIsLoading(true); setError(null)
    try {
      const queue = await getVerificationQueue(token, 100, 0)
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
      const updated = await rejectPatent(rejectTarget.id, reason, token)
      setPatents((prev) => prev.filter((p) => p.id !== updated.id))
      setRejectTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed.")
    } finally { setActionLoading(null) }
  }

  const handleRequestInfoConfirm = async (message: string) => {
    if (!infoTarget) return
    setActionLoading(infoTarget.id)
    try {
      const updated = await requestPatentInfo(infoTarget.id, message, token)
      setPatents((prev) => prev.map((p) => (p.id === infoTarget.id ? updated : p)))
      setInfoTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send info request.")
    } finally { setActionLoading(null) }
  }

  const handleList = async (patent: Patent) => {
    setActionLoading(patent.id)
    try {
      const updated = await listPatent(patent.id, token)
      setPatents((prev) => prev.map((p) => (p.id === patent.id ? updated : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish patent.")
    } finally { setActionLoading(null) }
  }

  const handleMarkSold = async (patent: Patent) => {
    setActionLoading(patent.id)
    try {
      const updated = await markPatentSold(patent.id, token)
      setPatents((prev) => prev.map((p) => (p.id === patent.id ? updated : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark as sold.")
    } finally { setActionLoading(null) }
  }

  const FILTER_TABS: { key: FilterTab; label: string }[] = [
    { key: "all",                       label: "All" },
    { key: "pending_verification",      label: "Pending" },
    { key: "additional_info_requested", label: "Info Requested" },
    { key: "verified",                  label: "Verified → Publish" },
    { key: "listed",                    label: "Listed → Sold" },
  ]

  const filtered = filter === "all" ? patents : patents.filter((p) => p.status === filter)

  const badgeCount = (key: FilterTab) =>
    key === "all" ? patents.length : patents.filter((p) => p.status === key).length

  const badgeColor: Record<FilterTab, string> = {
    all:                       "hsl(243 75% 65%)",
    pending_verification:      "hsl(38 92% 60%)",
    additional_info_requested: "hsl(280 70% 65%)",
    verified:                  "hsl(142 71% 55%)",
    listed:                    "hsl(243 75% 65%)",
  }

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
            <p className="text-sm opacity-50">Review, approve, and manage patent submissions</p>
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
        <div className="flex gap-2 mb-5 flex-wrap">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key
            const count = badgeCount(tab.key)
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5"
                style={{
                  background: active ? "hsl(243 75% 65%/0.15)" : "transparent",
                  color: active ? "hsl(243 75% 75%)" : "hsl(215 20% 50%)",
                  border: `1px solid ${active ? "hsl(243 75% 65%/0.4)" : "hsl(222 16% 20%)"}`,
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-xs"
                    style={{ background: `${badgeColor[tab.key]}22`, color: badgeColor[tab.key] }}
                  >
                    {count}
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
                {patents.length === 0 ? "Queue is empty" : "No patents match this filter"}
              </p>
              <p className="text-sm opacity-40 mt-1">
                {patents.length === 0
                  ? "No patents are awaiting review right now."
                  : "Try switching to a different filter tab."}
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
                onRequestInfo={() => setInfoTarget(patent)}
                onMarkSold={() => handleMarkSold(patent)}
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
            <span>→ Mark Sold →</span>
            <span className="font-semibold" style={{ color: "hsl(20 80% 55%)" }}>Sold</span>
            <span className="opacity-30 mx-1">|</span>
            <span>Pending → Request Info →</span>
            <span className="font-semibold" style={{ color: "hsl(280 70% 65%)" }}>Info Requested</span>
            <span className="opacity-30 mx-1">|</span>
            <span>Pending → Reject →</span>
            <span className="font-semibold" style={{ color: "hsl(0 84% 60%)" }}>Rejected</span>
          </div>
          <p className="text-xs opacity-30 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            AI summary + embedding generated automatically on approval
          </p>
        </div>
      )}

      {/* Modals */}
      {rejectTarget && (
        <RejectModal
          patent={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          isLoading={actionLoading === rejectTarget.id}
        />
      )}
      {infoTarget && (
        <RequestInfoModal
          patent={infoTarget}
          onConfirm={handleRequestInfoConfirm}
          onCancel={() => setInfoTarget(null)}
          isLoading={actionLoading === infoTarget.id}
        />
      )}
    </div>
  )
}
