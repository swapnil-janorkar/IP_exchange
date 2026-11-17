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
  Trash2,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createPatent, uploadDocument, submitPatent, type Patent } from "@/lib/api"

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PatentListingFormProps {
  token: string
  onSuccess?: (patent: Patent) => void
  onCancel?: () => void
}

type Step = "details" | "document" | "review" | "success"

interface UploadedFile {
  file: File
  uploaded: boolean
  error?: string
}

interface UploadedFile {
  file: File
  uploaded: boolean
  error?: string
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:                      { label: "Draft",           color: "hsl(215 20% 65%)", bg: "hsl(215 20% 65%/0.12)" },
    pending_verification:       { label: "Pending Review",  color: "hsl(38 92% 60%)",  bg: "hsl(38 92% 60%/0.12)"  },
    additional_info_requested:  { label: "Info Requested",  color: "hsl(280 70% 65%)", bg: "hsl(280 70% 65%/0.12)" },
    verified:                   { label: "Verified",        color: "hsl(142 71% 55%)", bg: "hsl(142 71% 55%/0.12)" },
    listed:                     { label: "Listed",          color: "hsl(243 75% 65%)", bg: "hsl(243 75% 65%/0.12)" },
    rejected:                   { label: "Rejected",        color: "hsl(0 84% 60%)",   bg: "hsl(0 84% 60%/0.12)"   },
    sold:                       { label: "Sold",            color: "hsl(20 80% 55%)",  bg: "hsl(20 80% 55%/0.12)"  },
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

// â”€â”€â”€ Step Indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "details",  label: "Patent Details", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "document", label: "Proof Documents", icon: <FilePlus2 className="h-4 w-4" /> },
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

const MAX_FILES = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export default function PatentListingForm({ token, onSuccess, onCancel }: PatentListingFormProps) {
  const [step, setStep] = useState<Step>("details")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [keywords, setKeywords] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Step 2 — multiple files
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
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

  // ─── File selection helpers

  const validateFile = (f: File): string | null => {
    if (f.type !== "application/pdf") return "Only PDF files are accepted."
    if (f.size > MAX_FILE_SIZE) return "File must be under 10 MB."
    return null
  }

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null)
    const arr = Array.from(incoming)
    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length
      if (remaining <= 0) {
        setError(`Maximum ${MAX_FILES} documents allowed.`)
        return prev
      }
      const toAdd = arr.slice(0, remaining).map((f) => {
        const err = validateFile(f)
        return { file: f, uploaded: false, error: err ?? undefined }
      })
      return [...prev, ...toAdd]
    })
  }, [])

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
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

  const handleUploadAll = async () => {
    if (!patent) return
    const validFiles = files.filter((f) => !f.error)
    if (validFiles.length === 0) {
      setError("Please add at least one valid PDF file.")
      return
    }

    setIsLoading(true); setError(null)
    let lastPatent = patent

    for (let i = 0; i < files.length; i++) {
      const item = files[i]
      if (item.error || item.uploaded) continue
      setUploadingIdx(i)
      try {
        const updated = await uploadDocument(lastPatent.id, item.file, token)
        lastPatent = updated
        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, uploaded: true } : f))
        setPatent(updated)
      } catch (err) {
        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, error: err instanceof Error ? err.message : "Upload failed" } : f))
      }
    }

    setUploadingIdx(null)
    setIsLoading(false)
    setPatent(lastPatent)
    setStep("review")
  }

  const handleSubmit = async () => {
    if (!patent) return
    if (!patent.proof_document_url) { setError("A proof document is required before submitting."); return }
    setIsLoading(true); setError(null)
    try {
      const submitted = await submitPatent(patent.id, token)
      setPatent(submitted); setStep("success"); onSuccess?.(submitted)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.")
    } finally { setIsLoading(false) }
  }

  const uploadedCount = files.filter((f) => f.uploaded).length
  const hasValidFiles = files.some((f) => !f.error)
  const allUploaded = files.length > 0 && files.every((f) => f.uploaded || !!f.error)

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

      {/* ── STEP 2: Documents (multi-upload) */}
      {step === "document" && (
        <Card className="glass-card border-0 animate-float-up">
          <CardContent className="p-7 flex flex-col gap-6">
            <div>
              <h2 className="text-base font-bold mb-1" style={{ color: "hsl(210 40% 98%)" }}>Upload Proof Documents</h2>
              <p className="text-sm opacity-50">
                Attach up to {MAX_FILES} PDFs proving patent ownership — e.g. grant certificates, provisional filings, or assignment documents. Max 10 MB each.
              </p>
            </div>

            {/* Dropzone */}
            <div
              id="document-dropzone"
              className="rounded-2xl flex flex-col items-center justify-center gap-4 py-8 px-6 text-center cursor-pointer transition-all duration-200"
              style={{
                border: `2px dashed ${dragOver ? "hsl(243 75% 65%)" : files.length >= MAX_FILES ? "hsl(222 16% 20%)" : "hsl(222 16% 24%)"}`,
                background: dragOver ? "hsl(243 75% 65%/0.06)" : "hsl(222 16% 9%)",
                opacity: files.length >= MAX_FILES ? 0.5 : 1,
                pointerEvents: files.length >= MAX_FILES ? "none" : "auto",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files) }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) { addFiles(e.target.files); e.target.value = "" } }}
              />
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: "hsl(243 75% 65%/0.1)", color: "hsl(243 75% 65%)" }}>
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: "hsl(210 40% 98%)" }}>
                  Drop PDFs here or <span style={{ color: "hsl(243 75% 65%)" }}>browse</span>
                </p>
                <p className="text-xs opacity-40 mt-1">PDF only · max 10 MB per file · up to {MAX_FILES} files</p>
              </div>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-wider opacity-40 font-semibold">
                  Selected Documents ({files.length}/{MAX_FILES})
                </p>
                {files.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all"
                    style={{
                      background: item.error ? "hsl(0 84% 60%/0.06)" : item.uploaded ? "hsl(142 71% 55%/0.06)" : "hsl(222 16% 10%)",
                      border: `1px solid ${item.error ? "hsl(0 84% 60%/0.25)" : item.uploaded ? "hsl(142 71% 55%/0.25)" : "hsl(222 16% 20%)"}`,
                    }}
                  >
                    {uploadingIdx === idx ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: "hsl(243 75% 65%)" }} />
                    ) : item.uploaded ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "hsl(142 71% 55%)" }} />
                    ) : item.error ? (
                      <AlertCircle className="h-4 w-4 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 opacity-50" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: item.error ? "hsl(0 84% 60%)" : "hsl(210 40% 90%)" }}>
                        {item.file.name}
                      </p>
                      <p className="text-xs opacity-40">
                        {item.error ? item.error : item.uploaded ? "Uploaded ✓" : `${(item.file.size / (1024 * 1024)).toFixed(2)} MB`}
                      </p>
                    </div>
                    {!item.uploaded && (
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="opacity-30 hover:opacity-70 transition-opacity shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("details")} disabled={isLoading}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep("review")} disabled={isLoading}>Skip for now</Button>
                <Button onClick={handleUploadAll} disabled={!hasValidFiles || isLoading || allUploaded} size="lg">
                  {isLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading {uploadingIdx !== null ? uploadingIdx + 1 : ""}…</>
                    : allUploaded
                    ? <>Continue <ArrowRight className="h-4 w-4 ml-2" /></>
                    : <>Upload & Continue <ArrowRight className="h-4 w-4 ml-2" /></>
                  }
                </Button>
                {allUploaded && (
                  <Button onClick={() => setStep("review")} size="lg">
                    Continue <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
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
              <div>
                <p className="text-xs uppercase tracking-wider opacity-40 mb-2">Proof Documents</p>
                {uploadedCount > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {files.filter((f) => f.uploaded).map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "hsl(142 71% 55%)" }} />
                        <span className="text-xs" style={{ color: "hsl(142 71% 55%)" }}>{f.file.name}</span>
                      </div>
                    ))}
                  </div>
                ) : patent.proof_document_url ? (
                  <span className="text-xs" style={{ color: "hsl(142 71% 55%)" }}>✓ Proof document attached</span>
                ) : (
                  <span className="text-xs opacity-40">No proof document — admin may request one</span>
                )}
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
            {uploadedCount > 0 && (
              <p className="text-xs opacity-40 mt-2">{uploadedCount} proof document{uploadedCount > 1 ? "s" : ""} attached</p>
            )}
          </div>
          <Button size="lg" onClick={() => onSuccess?.(patent)}>View My Patents</Button>
        </div>
      )}
    </div>
  )
}