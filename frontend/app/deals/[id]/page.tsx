"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { AlertCircle, ArrowLeft, Download, FileText, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import {
  downloadDealDocument,
  getDeal,
  getDealDocuments,
  signDealNda,
  uploadDealNda,
  type DealDetail,
  type DealDocument,
} from "@/lib/api"

export default function DealDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen violet-gradient-bg flex items-center justify-center">
          <div className="flex items-center gap-3 opacity-60">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading deal…
          </div>
        </main>
      }
    >
      <DealDetailContent />
    </Suspense>
  )
}

function DealDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { user, isAuthenticated } = useAuth()
  const [deal, setDeal] = useState<DealDetail | null>(null)
  const [documents, setDocuments] = useState<DealDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [acceptedNda, setAcceptedNda] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dealId = Number(id)
  const invalidDealId = !Number.isInteger(dealId) || dealId <= 0

  const loadDeal = useCallback(async () => {
    if (!user) return
    if (invalidDealId) return

    try {
      const [dealData, documentData] = await Promise.all([
        getDeal(dealId, user.access_token),
        getDealDocuments(dealId, user.access_token),
      ])
      setDeal(dealData)
      setDocuments(documentData)
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load this deal.")
    } finally {
      setIsLoading(false)
    }
  }, [dealId, invalidDealId, user])

  useEffect(() => {
    void Promise.resolve().then(loadDeal)
  }, [loadDeal])

  const handleUpload = async (file?: File) => {
    if (!file || !user || !deal) return
    setIsWorking(true)
    setError(null)
    try {
      await uploadDealNda(deal.id, file, user.access_token)
      await loadDeal()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not upload the NDA.")
    } finally {
      setIsWorking(false)
    }
  }

  const handleSign = async () => {
    if (!user || !deal) return
    setIsWorking(true)
    setError(null)
    try {
      await signDealNda(deal.id, user.access_token)
      setAcceptedNda(false)
      await loadDeal()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign the NDA.")
    } finally {
      setIsWorking(false)
    }
  }

  const handleDownload = async (document: DealDocument) => {
    if (!user || !deal) return
    setError(null)
    try {
      const blob = await downloadDealDocument(deal.id, document.id, user.access_token)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement("a")
      anchor.href = url
      anchor.download = document.file_name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not download the document.")
    }
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <Card className="glass-card border-0 max-w-md w-full">
          <CardContent className="p-10 text-center">
            <p className="text-sm opacity-60">Sign in to view this deal.</p>
            <Button asChild className="mt-4"><Link href="/">Go to sign in</Link></Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const isSeller = user.id === deal?.seller_id
  const hasSigned = deal?.nda_signed_by.includes(user.id) ?? false

  return (
    <main className="min-h-screen violet-gradient-bg">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link href="/deals" className="mb-6 inline-flex items-center gap-2 text-sm opacity-60 hover:opacity-100">
          <ArrowLeft className="h-4 w-4" />
          My deals
        </Link>

        {isLoading && !invalidDealId && (
          <div className="flex items-center justify-center gap-3 py-20 opacity-60">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading deal…
          </div>
        )}

        {(invalidDealId || error) && (
          <Card className="glass-card mb-5 border-0">
            <CardContent role="alert" className="flex items-center gap-3 p-5 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {invalidDealId ? "Invalid deal ID." : error}
            </CardContent>
          </Card>
        )}

        {!isLoading && deal && (
          <div className="flex flex-col gap-5">
            <Card className="glass-card border-0">
              <CardContent className="p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-40">Deal #{deal.id}</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{deal.patent_title}</h1>
                <div className="mt-3 flex flex-wrap gap-3 text-sm opacity-60">
                  <span className="capitalize">{deal.status.replaceAll("_", " ")}</span>
                  <span>·</span>
                  <span>{deal.nda_complete ? "NDA signed by both parties" : "NDA signatures pending"}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="flex-1">
                    <h2 className="font-bold">Mutual NDA</h2>
                    <p className="mt-1 text-sm opacity-55">
                      The patent owner uploads the NDA for this deal. Both parties must review and sign it before any patent or deal documents are shared. Signatures are recorded against your account and the uploaded document.
                    </p>
                  </div>
                </div>

                {!deal.nda_document && isSeller && (
                  <div className="mt-5 rounded-xl border border-dashed border-primary/40 p-5">
                    <p className="text-sm font-semibold">Upload the approved NDA</p>
                    <p className="mt-1 text-xs opacity-50">Use the NDA text or file approved for your organisation.</p>
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ""
                        void handleUpload(file)
                      }}
                    />
                    <Button className="mt-4" onClick={() => fileInput.current?.click()} disabled={isWorking}>
                      {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Upload NDA
                    </Button>
                  </div>
                )}

                {!deal.nda_document && !isSeller && (
                  <p className="mt-5 rounded-xl bg-secondary/50 p-4 text-sm opacity-70">
                    Waiting for the patent owner to upload the deal NDA.
                  </p>
                )}

                {deal.nda_document && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/50 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{deal.nda_document.file_name}</p>
                      <p className="mt-1 text-xs capitalize opacity-50">{deal.nda_document.doc_type}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleDownload(deal.nda_document!)} disabled={isWorking}>
                      <Download className="mr-2 h-4 w-4" />
                      Read NDA
                    </Button>
                  </div>
                )}

                {deal.nda_document && !hasSigned && (
                  <div className="mt-5">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={acceptedNda}
                        onChange={(event) => setAcceptedNda(event.target.checked)}
                        className="mt-1 accent-primary"
                      />
                      <span>I have reviewed the uploaded NDA and agree to sign it on behalf of my account.</span>
                    </label>
                    <Button className="mt-4" onClick={handleSign} disabled={!acceptedNda || isWorking}>
                      {isWorking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign NDA
                    </Button>
                  </div>
                )}

                {hasSigned && !deal.nda_complete && (
                  <p className="mt-5 rounded-xl bg-secondary/50 p-4 text-sm opacity-70">
                    You have signed. The other party must also sign before documents become available.
                  </p>
                )}
              </CardContent>
            </Card>

            {deal.nda_complete && (
              <Card className="glass-card border-0">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold">Shared documents</h2>
                      <p className="mt-1 text-sm opacity-55">All documents attached to this patent are available to both deal parties.</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                      NDA complete
                    </span>
                  </div>
                  <div className="mt-5 flex flex-col gap-2">
                    {documents.map((document) => (
                      <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{document.file_name}</p>
                          <p className="mt-1 text-xs capitalize opacity-50">{document.doc_type}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleDownload(document)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    ))}
                    {documents.length === 0 && (
                      <p className="py-4 text-sm opacity-50">No patent documents are attached yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
