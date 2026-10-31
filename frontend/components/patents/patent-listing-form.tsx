"use client"

import React, { useState, useRef, useCallback } from "react"
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  Tag,
  ClipboardList,
  Loader2,
  X,
  FilePlus2,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createPatent, uploadDocument, submitPatent, type Patent } from "@/lib/api"

// ─── Types ──────────────────────────────────────────────────────────────────

interface PatentListingFormProps {
  token: string
  onSuccess?: (patent: Patent) => void
  onCancel?: () => void
}

type Step = "details" | "document" | "review" | "success"

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:                { label: "Draft",          color: "hsl(215 20% 65%)", bg: "hsl(215 20% 65%/0.12)" },
    pending_verification: { label: "Pending Review", color: "hsl(38 92% 60%)",  bg: "hsl(38 92% 60%/0.12)"  },
    verified:             { label: "Verified",       color: "hsl(142 71% 55%)", bg: "hsl(142 71% 55%/0.12)" },
    listed:               { label: "Listed",         color: "hsl(243 75% 65%)", bg: "hsl(243 75% 65%/0.12)" },
    rejected:             { label: "Rejected",       color: "hsl(0 84% 60%)",   bg: "hsl(0 84% 60%/0.12)"   },
    sold:                 { label: "Sold",           color: "hsl(280 70% 60%)", bg: "hsl(280 70% 60%/0.12)" },
  }
  const s = map[status] ?? { label: status, color: "hsl(215 20% 65%)", bg: "hsl(215 20% 65%/0.1)" }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}33` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  )
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "details",  label: "Patent Details", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "document", label: "Proof Document", icon: <FilePlus2 className="h-4 w-4" /> },
  { key: "review",   label: "Review & Submit", icon: <CheckCircle2 className="h-4 w-4" /> },
]

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center w-full mb-8">
      {STEPS.map((step, i) => {
        const done = i < idx
        const active = i === idx
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  background: done ? "hsl(142 71% 55%)" : active ? "hsl(243 75% 65%)" : "hsl(222 16% 16%)",
                  border: done || active ? "none" : "1px solid hsl(222 16% 26%)",
                  boxShadow: active ? "0 0 20px hsl(243 75% 65%/0.4)" : "none",
                  color: done || active ? "#fff" : "hsl(215 20% 50%)",
                }}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
              </div>
              <span
                className="text-xs font-semibold whitespace-nowrap"
                style={{ color: active ? "hsl(210 40% 98%)" : "hsl(215 20% 45%)" }}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 h-0.5 mb-5 mx-2 transition-all duration-500"
                style={{ background: done ? "hsl(142 71% 55%)" : "hsl(222 16% 20%)" }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Styled inputs ───────────────────────────────────────────────────────────

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean; paddingLeft?: string }) {
  const { error, paddingLeft, style, ...rest } = props
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...rest}
      style={{
        background: "hsl(222 16% 12%)",
        border: `1px solid ${error ? "hsl(0 84% 60%/0.6)" : focused ? "hsl(243 75% 65%/0.6)" : "hsl(222 16% 20%)"}`,
        color: "hsl(210 40% 98%)",
        borderRadius: "0.75rem",
        padding: "0.65rem 0.875rem",
        paddingLeft: paddingLeft ?? "0.875rem",
        fontSize: "0.875rem",
        outline: "none",
        width: "100%",
        boxShadow: focused && !error ? "0 0 0 3px hsl(243 75% 65%/0.08)" : "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        ...style,
      }}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
    />
  )
}

function StyledTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  const { error, ...rest } = props
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      {...rest}
      style={{
        background: "hsl(222 16% 12%)",
        border: `1px solid ${error ? "hsl(0 84% 60%/0.6)" : focused ? "hsl(243 75% 65%/0.6)" : "hsl(222 16% 20%)"}`,
        color: "hsl(210 40% 98%)",
        borderRadius: "0.75rem",
        padding: "0.65rem 0.875rem",
        fontSize: "0.875rem",
        outline: "none",
        width: "100%",
        minHeight: "120px",
        resize: "vertical" as const,
        boxShadow: focused && !error ? "0 0 0 3px hsl(243 75% 65%/0.08)" : "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
    />
  )
}

// ─── Main Form ───────────────────────────────────────────────────────────────

export default function PatentListingForm({ token, onSuccess, onCancel }: PatentListingFormProps) {
  const [step, setStep] = useState<Step>("details")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [keywords, setKeywords] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Step 2
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [patent, setPatent] = useState<Patent | null>(null)

  // ─── Validation

  const validateDetails = () => {
    const errs: Record<string, string> = {}
    if (title.trim().length < 3) errs.title = "Title must be at least 3 characters."
    if (description.trim().length < 10) errs.description = "Description must be at least 10 characters."
    if (keywords.length > 500) errs.keywords = "Keywords must be under 500 characters."
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ─── Handlers

  const handleDetailsNext = async () => {
    if (!validateDetails()) return
    setIsLoading(true); setError(null)
    try {
      const p = await createPatent({ title: title.trim(), description: description.trim(), keywords: keywords.trim() }, token)
      setPatent(p); setStep("document")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create patent.")
    } finally { setIsLoading(false) }
  }

  const handleFileSelect = useCallback((selected: File | null) => {
    setError(null)
    if (!selected) return
    if (selected.type !== "application/pdf") { setError("Only PDF files are accepted."); return }
    if (selected.size > 10 * 1024 * 1024) { setError("File must be under 10 MB."); return }
    setFile(selected)
  }, [])

  const handleDocumentUpload = async () => {
    if (!patent || !file) return
    setIsLoading(true); setError(null)
    try {
      const updated = await uploadDocument(patent.id, file, token)
      setPatent(updated); setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally { setIsLoading(false) }
  }

  const handleSubmit = async () => {
    if (!patent) return
    if (!patent.proof_document_url) { setError("A proof document is required before submitting."); return }
    setIsLoading(true); setError(null)
    try {
      const submitted = await submitPatent(patent.id, patent.proof_document_url, token)
      setPatent(submitted); setStep("success"); onSuccess?.(submitted)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.")
    } finally { setIsLoading(false) }
  }

  // ─── Render

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 animate-scale-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 animate-float-up">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(243 75% 65%/0.15)", color: "hsl(243 75% 65%)" }}>
          <Lightbulb className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "hsl(210 40% 98%)" }}>List a Patent</h1>
          <p className="text-sm opacity-50">Submit your intellectual property for review</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="ml-auto opacity-40 hover:opacity-70 transition-opacity" aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {step !== "success" && <StepIndicator current={step} />}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5 animate-fade-in" style={{ background: "hsl(0 84% 60%/0.1)", border: "1px solid hsl(0 84% 60%/0.3)" }}>
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
          <p className="text-sm font-medium" style={{ color: "hsl(0 84% 60%)" }}>{error}</p>
        </div>
      )}

      {/* ── STEP 1: Details */}
      {step === "details" && (
        <Card className="glass-card border-0 animate-float-up">
          <CardContent className="p-7 flex flex-col gap-6">

            {/* Title */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: "hsl(210 40% 80%)" }}>
                  Patent Title <span style={{ color: "hsl(0 84% 60%)" }}>*</span>
                </label>
                <span className="text-xs" style={{ color: "hsl(215 20% 45%)" }}>{title.length}/200</span>
              </div>
              <StyledInput
                id="patent-title"
                placeholder="e.g. Quantum-encrypted data compression algorithm"
                value={title}
                maxLength={200}
                onChange={(e) => { setTitle(e.target.value); setFieldErrors((p) => ({ ...p, title: "" })) }}
                error={!!fieldErrors.title}
              />
              {fieldErrors.title && <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>{fieldErrors.title}</p>}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: "hsl(210 40% 80%)" }}>
                  Description <span style={{ color: "hsl(0 84% 60%)" }}>*</span>
                </label>
                <span className="text-xs" style={{ color: "hsl(215 20% 45%)" }}>{description.length} chars</span>
              </div>
              <StyledTextarea
                id="patent-description"
                placeholder="Describe the invention, its novelty, and the problem it solves…"
                value={description}
                rows={5}
                onChange={(e) => { setDescription(e.target.value); setFieldErrors((p) => ({ ...p, description: "" })) }}
                error={!!fieldErrors.description}
              />
              {fieldErrors.description && <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>{fieldErrors.description}</p>}
            </div>

            {/* Keywords */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold" style={{ color: "hsl(210 40% 80%)" }}>Keywords</label>
                <span className="text-xs" style={{ color: "hsl(215 20% 45%)" }}>Comma-separated, max 500</span>
              </div>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                <StyledInput
                  id="patent-keywords"
                  placeholder="AI, machine learning, data compression…"
                  value={keywords}
                  maxLength={500}
                  onChange={(e) => setKeywords(e.target.value)}
                  paddingLeft="2.25rem"
                  error={!!fieldErrors.keywords}
                />
              </div>
              {fieldErrors.keywords && <p className="text-xs" style={{ color: "hsl(0 84% 60%)" }}>{fieldErrors.keywords}</p>}
              {keywords.trim() && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {keywords.split(",").filter(Boolean).map((kw, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 75%)", border: "1px solid hsl(243 75% 65%/0.2)" }}>
                      {kw.trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={onCancel} disabled={isLoading}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button onClick={handleDetailsNext} disabled={isLoading} size="lg">
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <>Next <ArrowRight className="h-4 w-4 ml-2" /></>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Document */}
      {step === "document" && (
        <Card className="glass-card border-0 animate-float-up">
          <CardContent className="p-7 flex flex-col gap-6">
            <div>
              <h2 className="text-base font-bold mb-1" style={{ color: "hsl(210 40% 98%)" }}>Upload Proof Document</h2>
              <p className="text-sm opacity-50">Attach a PDF proving patent ownership — e.g. a grant certificate or provisional filing. Max 10 MB.</p>
            </div>

            <div
              id="document-dropzone"
              className="rounded-2xl flex flex-col items-center justify-center gap-4 py-10 px-6 text-center cursor-pointer transition-all duration-200"
              style={{
                border: `2px dashed ${dragOver ? "hsl(243 75% 65%)" : file ? "hsl(142 71% 55%)" : "hsl(222 16% 24%)"}`,
                background: dragOver ? "hsl(243 75% 65%/0.06)" : file ? "hsl(142 71% 55%/0.05)" : "hsl(222 16% 9%)",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0] ?? null) }}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)} />
              {file ? (
                <>
                  <div className="h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: "hsl(142 71% 55%/0.15)", color: "hsl(142 71% 55%)" }}>
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: "hsl(210 40% 98%)" }}>{file.name}</p>
                    <p className="text-xs opacity-50 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB · PDF</p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold transition-opacity hover:opacity-70"
                    style={{ color: "hsl(243 75% 65%)" }}
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  >
                    Remove file
                  </button>
                </>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 65%)" }}>
                    <FilePlus2 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "hsl(210 40% 98%)" }}>
                      Drop your PDF here or <span style={{ color: "hsl(243 75% 65%)" }}>browse</span>
                    </p>
                    <p className="text-xs opacity-40 mt-1">PDF only · max 10 MB</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("details")} disabled={isLoading}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep("review")} disabled={isLoading}>Skip for now</Button>
                <Button onClick={handleDocumentUpload} disabled={!file || isLoading} size="lg">
                  {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</> : <>Upload & Continue <ArrowRight className="h-4 w-4 ml-2" /></>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Review */}
      {step === "review" && patent && (
        <Card className="glass-card border-0 animate-float-up">
          <CardContent className="p-7 flex flex-col gap-6">
            <div>
              <h2 className="text-base font-bold mb-1" style={{ color: "hsl(210 40% 98%)" }}>Review Your Submission</h2>
              <p className="text-sm opacity-50">Once submitted, your patent will be locked until an admin reviews it.</p>
            </div>

            <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "hsl(222 16% 10%)", border: "1px solid hsl(222 16% 20%)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wider opacity-40 mb-1">Patent ID</p>
                  <p className="font-mono font-bold text-sm" style={{ color: "hsl(243 75% 75%)" }}>#{patent.id}</p>
                </div>
                <StatusBadge status={patent.status} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider opacity-40 mb-1">Title</p>
                <p className="font-semibold text-sm">{patent.title}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider opacity-40 mb-1">Description</p>
                <p className="text-sm opacity-70 leading-relaxed" style={{ WebkitLineClamp: 4, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical" }}>{patent.description}</p>
              </div>
              {patent.keywords && (
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-40 mb-2">Keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {patent.keywords.split(",").filter(Boolean).map((kw, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 75%)", border: "1px solid hsl(243 75% 65%/0.2)" }}>
                        {kw.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 opacity-40" />
                {patent.proof_document_url
                  ? <span className="text-xs" style={{ color: "hsl(142 71% 55%)" }}>✓ Proof document attached</span>
                  : <span className="text-xs opacity-40">No proof document — admin may request one</span>
                }
              </div>
            </div>

            {!patent.proof_document_url && (
              <div className="flex items-start gap-2.5 rounded-xl px-4 py-3" style={{ background: "hsl(38 92% 60%/0.08)", border: "1px solid hsl(38 92% 60%/0.25)" }}>
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "hsl(38 92% 60%)" }} />
                <p className="text-xs font-medium" style={{ color: "hsl(38 92% 60%)" }}>
                  No proof document uploaded. Submitting without one may delay verification. Go back to attach one.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("document")} disabled={isLoading}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !patent.proof_document_url}
                size="lg"
                style={patent.proof_document_url ? { boxShadow: "0 4px 20px hsl(243 75% 65%/0.3)" } : {}}
              >
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <>Submit for Review <CheckCircle2 className="h-4 w-4 ml-2" /></>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── SUCCESS */}
      {step === "success" && patent && (
        <div className="flex flex-col items-center gap-6 py-8 animate-scale-in text-center">
          <div className="h-20 w-20 rounded-full flex items-center justify-center animate-pulse-glow" style={{ background: "hsl(142 71% 55%/0.15)", border: "2px solid hsl(142 71% 55%/0.4)", color: "hsl(142 71% 55%)" }}>
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight mb-2 text-gradient">Patent Submitted!</h2>
            <p className="text-sm opacity-60 max-w-sm">
              Patent <strong className="opacity-100" style={{ color: "hsl(210 40% 98%)" }}>#{patent.id}</strong> is pending admin verification. You&apos;ll be notified once reviewed.
            </p>
          </div>
          <div className="rounded-2xl p-4 w-full max-w-sm text-left" style={{ background: "hsl(222 16% 10%)", border: "1px solid hsl(222 16% 20%)" }}>
            <p className="text-xs uppercase tracking-wider opacity-40 mb-1">Submitted Patent</p>
            <p className="font-semibold text-sm mb-2">{patent.title}</p>
            <StatusBadge status={patent.status} />
          </div>
          <Button size="lg" onClick={() => onSuccess?.(patent)}>View My Patents</Button>
        </div>
      )}
    </div>
  )
}
