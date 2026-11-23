"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Plus, Lightbulb, Loader2, AlertCircle, FileText, Calendar,
  RefreshCw, ChevronDown, ChevronUp, ExternalLink, Sparkles,
  FilePlus2, Trash2, Upload, X, Pencil, Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import PatentListingForm, { StatusBadge } from "@/components/patents/patent-listing-form"
import {
  getMyPatents, getPatentDocuments, uploadDocument, deletePatentDocument,
  submitPatent, updatePatent, type Patent, type PatentDocument,
} from "@/lib/api"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ─── Statuses that allow edits + document uploads ────────────────────────────
const EDITABLE_STATUSES = new Set(["draft", "rejected", "additional_info_requested"])

// ─── Document list sub-component ─────────────────────────────────────────────

function PatentDocumentList({
  patent,
  token,
  onDocumentChange,
}: {
  patent: Patent
  token: string
  onDocumentChange: () => void
}) {
  const [docs, setDocs] = useState<PatentDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const canEdit = EDITABLE_STATUSES.has(patent.status)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getPatentDocuments(patent.id, token)
      setDocs(list)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [patent.id, token])

  useEffect(() => { loadDocs() }, [loadDocs])

  const handleUpload = async (file: File) => {
    if (file.type !== "application/pdf") { setUploadError("Only PDF files are accepted."); return }
    if (file.size > 10 * 1024 * 1024) { setUploadError("File must be under 10 MB."); return }
    setUploadError(null); setUploading(true)
    try {
      await uploadDocument(patent.id, file, token)
      await loadDocs()
      onDocumentChange()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.")
    } finally { setUploading(false) }
  }

  const handleDelete = async (docId: number) => {
    try {
      await deletePatentDocument(patent.id, docId, token)
      await loadDocs()
      onDocumentChange()
    } catch { /* silent */ }
  }

  if (loading) return <div className="flex items-center gap-2 py-2 opacity-40"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="text-xs">Loading documents…</span></div>

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider opacity-40 font-semibold">Proof Documents ({docs.length})</p>
        {canEdit && docs.length < 5 && (
          <button
            className="flex items-center gap-1 text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: "hsl(243 75% 65%)" }}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FilePlus2 className="h-3 w-3" />}
            Add PDF
          </button>
        )}
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = "" }} />
      </div>

      {uploadError && <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>{uploadError}</p>}

      {docs.length === 0 ? (
        <p className="text-xs opacity-30">No documents attached yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "hsl(222 16% 9%)", border: "1px solid hsl(222 16% 18%)" }}>
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <span className="text-xs flex-1 truncate opacity-70">{doc.file_name}</span>
              <span className="text-xs opacity-30">{(doc.size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
              <a
                href={`${API_BASE}${doc.storage_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-40 hover:opacity-70 transition-opacity"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {canEdit && (
                <button className="opacity-30 hover:opacity-70 transition-opacity" onClick={() => handleDelete(doc.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Patent Card ──────────────────────────────────────────────────────────────

function PatentCard({ patent: initialPatent, token, onRefresh }: {
  patent: Patent
  token: string
  onRefresh: () => void
}) {
  const [patent, setPatent] = useState(initialPatent)
  const [expanded, setExpanded] = useState(false)

  // Inline edit state
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(patent.title)
  const [editDesc, setEditDesc] = useState(patent.description)
  const [editKeywords, setEditKeywords] = useState(patent.keywords)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Sync when parent list refreshes
  useEffect(() => {
    setPatent(initialPatent)
    setEditTitle(initialPatent.title)
    setEditDesc(initialPatent.description)
    setEditKeywords(initialPatent.keywords)
  }, [initialPatent])

  const createdAt = new Date(patent.created_at).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric",
  })
  const keywordList = patent.keywords.split(",").filter(Boolean)
  const canEdit = EDITABLE_STATUSES.has(patent.status)
  const canSubmit = canEdit  // draft / rejected / additional_info_requested

  // ── Save edits
  const handleSaveEdit = async () => {
    if (editTitle.trim().length < 3) { setSaveError("Title must be at least 3 characters."); return }
    if (editDesc.trim().length < 10) { setSaveError("Description must be at least 10 characters."); return }
    setSaving(true); setSaveError(null)
    try {
      const updated = await updatePatent(patent.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        keywords: editKeywords.trim(),
      }, token)
      setPatent(updated)
      setEditing(false)
      onRefresh()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.")
    } finally { setSaving(false) }
  }

  const handleCancelEdit = () => {
    setEditTitle(patent.title)
    setEditDesc(patent.description)
    setEditKeywords(patent.keywords)
    setSaveError(null)
    setEditing(false)
  }

  // ── Submit for review
  const handleSubmit = async () => {
    if (!patent.proof_document_url) {
      setSubmitError("Please attach at least one proof document before submitting.")
      return
    }
    setSubmitting(true); setSubmitError(null)
    try {
      await submitPatent(patent.id, token)
      onRefresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.")
    } finally { setSubmitting(false) }
  }

  const inputStyle: React.CSSProperties = {
    background: "hsl(222 16% 9%)",
    border: "1px solid hsl(222 16% 22%)",
    color: "hsl(210 40% 98%)",
    borderRadius: "0.6rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.8125rem",
    outline: "none",
    width: "100%",
  }

  return (
    <div
      className="rounded-2xl transition-all duration-200"
      style={{
        background: "hsl(222 18% 10%)",
        border: `1px solid ${
          expanded ? "hsl(222 16% 24%)" :
          patent.status === "additional_info_requested" ? "hsl(280 70% 65%/0.3)" :
          patent.status === "rejected" ? "hsl(0 84% 60%/0.2)" :
          patent.status === "draft" ? "hsl(243 75% 65%/0.15)" :
          "hsl(222 16% 18%)"
        }`,
        boxShadow: expanded ? "0 8px 32px hsl(0 0% 0%/0.2)" : "none",
      }}
    >
      {/* ── Header */}
      <div className="p-5 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 65%)" }}>
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: "hsl(210 40% 98%)" }}>{patent.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs opacity-40 font-mono">#{patent.id}</span>
                <span className="opacity-20">·</span>
                <span className="flex items-center gap-1 text-xs opacity-40">
                  <Calendar className="h-3 w-3" />
                  {createdAt}
                </span>
              </div>
            </div>
            <StatusBadge status={patent.status} />
          </div>

          {keywordList.length > 0 && !editing && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {keywordList.slice(0, 4).map((kw, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "hsl(243 75% 65%/0.08)", color: "hsl(243 75% 70%)", border: "1px solid hsl(243 75% 65%/0.15)" }}>
                  {kw.trim()}
                </span>
              ))}
              {keywordList.length > 4 && <span className="text-xs opacity-30 self-center">+{keywordList.length - 4}</span>}
            </div>
          )}
        </div>

        <button onClick={() => setExpanded((v) => !v)} className="opacity-40 hover:opacity-70 transition-opacity shrink-0 mt-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* ── Status banners */}
      {patent.status === "additional_info_requested" && patent.rejection_reason && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "hsl(280 70% 65%/0.08)", border: "1px solid hsl(280 70% 65%/0.2)" }}>
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "hsl(280 70% 65%)" }} />
          <p className="text-xs" style={{ color: "hsl(280 70% 65%)" }}>
            <strong>Admin requested info: </strong>{patent.rejection_reason}
          </p>
        </div>
      )}

      {patent.status === "rejected" && patent.rejection_reason && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "hsl(0 84% 60%/0.08)", border: "1px solid hsl(0 84% 60%/0.2)" }}>
          <X className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
          <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>
            <strong>Rejected: </strong>{patent.rejection_reason}
          </p>
        </div>
      )}

      {patent.ai_summary && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: "hsl(243 75% 65%/0.06)", border: "1px solid hsl(243 75% 65%/0.15)" }}>
          <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "hsl(243 75% 70%)" }} />
          <p className="text-xs opacity-60 italic leading-relaxed">{patent.ai_summary}</p>
        </div>
      )}

      {/* ── Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-4 animate-fade-in" style={{ borderTop: "1px solid hsl(222 16% 15%)" }}>

          {/* Inline edit form (draft / rejected / additional_info_requested) */}
          {editing ? (
            <div className="pt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider opacity-40 font-semibold">Title *</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider opacity-40 font-semibold">Description *</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" as const, minHeight: "90px" }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider opacity-40 font-semibold">Keywords (comma-separated)</label>
                <input
                  value={editKeywords}
                  onChange={(e) => setEditKeywords(e.target.value)}
                  maxLength={500}
                  placeholder="AI, machine learning, robotics…"
                  style={inputStyle}
                />
              </div>
              {saveError && <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>{saveError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>Cancel</Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={saving} style={{ background: "hsl(243 75% 65%)", color: "#fff" }}>
                  {saving
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                    : <><Save className="h-3.5 w-3.5 mr-1.5" />Save Changes</>
                  }
                </Button>
              </div>
            </div>
          ) : (
            <div className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider opacity-40">Description</p>
                {canEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 text-xs font-semibold opacity-50 hover:opacity-90 transition-opacity"
                    style={{ color: "hsl(243 75% 65%)" }}
                  >
                    <Pencil className="h-3 w-3" /> Edit Details
                  </button>
                )}
              </div>
              <p className="text-sm opacity-60 leading-relaxed">{patent.description}</p>
            </div>
          )}

          <PatentDocumentList patent={patent} token={token} onDocumentChange={onRefresh} />
        </div>
      )}

      {/* ── Submit / Resubmit footer — shown for all editable statuses */}
      {canSubmit && (
        <div className="px-5 pb-5 flex flex-col gap-2" style={{ borderTop: "1px solid hsl(222 16% 15%)" }}>
          <div className="pt-4 flex items-center gap-3 flex-wrap">
            <p className="text-xs opacity-50 flex-1">
              {patent.status === "draft"
                ? "Upload a proof document below, then submit for admin review."
                : patent.status === "additional_info_requested"
                ? "Add more documents or update details, then resubmit for admin review."
                : "Fix the issues highlighted above, then resubmit for admin review."}
            </p>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !patent.proof_document_url}
              style={{
                background: patent.proof_document_url ? "hsl(243 75% 65%)" : "hsl(222 16% 24%)",
                color: "#fff",
                opacity: patent.proof_document_url ? 1 : 0.5,
              }}
              title={!patent.proof_document_url ? "Expand card and add a PDF proof document first" : undefined}
            >
              {submitting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Submitting…</>
                : patent.status === "draft"
                ? <><Upload className="h-3.5 w-3.5 mr-1.5" />Submit for Review</>
                : <><Upload className="h-3.5 w-3.5 mr-1.5" />Resubmit</>
              }
            </Button>
          </div>
          {!patent.proof_document_url && (
            <p className="text-xs opacity-35">
              ↑ Expand the card and use <strong>Add PDF</strong> in the Proof Documents section first.
            </p>
          )}
          {submitError && <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>{submitError}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
          onSuccess={() => {
            setShowForm(false)
            loadPatents()
          }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    )
  }

  // Status summary
  const statusCounts = {
    draft:    patents.filter((p) => p.status === "draft").length,
    pending:  patents.filter((p) => p.status === "pending_verification").length,
    info:     patents.filter((p) => p.status === "additional_info_requested").length,
    verified: patents.filter((p) => p.status === "verified").length,
    listed:   patents.filter((p) => p.status === "listed").length,
    sold:     patents.filter((p) => p.status === "sold").length,
    rejected: patents.filter((p) => p.status === "rejected").length,
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
            <Button asChild variant="outline" size="sm">
              <Link href="/deals">My Deals</Link>
            </Button>
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

        {/* Status summary bar */}
        {!isLoading && patents.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-6 animate-float-up">
            {[
              { label: "Draft",    value: statusCounts.draft,    color: "hsl(215 20% 55%)" },
              { label: "Pending",  value: statusCounts.pending,  color: "hsl(38 92% 60%)"  },
              { label: "Info Req.",value: statusCounts.info,     color: "hsl(280 70% 65%)" },
              { label: "Verified", value: statusCounts.verified, color: "hsl(142 71% 55%)" },
              { label: "Listed",   value: statusCounts.listed,   color: "hsl(243 75% 65%)" },
              { label: "Sold",     value: statusCounts.sold,     color: "hsl(20 80% 55%)"  },
              { label: "Rejected", value: statusCounts.rejected, color: "hsl(0 84% 60%)"   },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: "hsl(222 18% 10%)", border: "1px solid hsl(222 16% 18%)" }}>
                <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs opacity-40">{s.label}</p>
              </div>
            ))}
          </div>
        )}

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
                <PatentCard patent={patent} token={user.access_token} onRefresh={loadPatents} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
