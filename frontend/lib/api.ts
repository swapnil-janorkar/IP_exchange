/**
 * IPX API client — thin fetch wrappers for every backend endpoint.
 * All functions accept an access_token so callers can pass it from
 * the auth context without coupling this module to React.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ─── Types ─────────────────────────────────────────────────────────────────

export type PatentStatus =
  | "draft"
  | "pending_verification"
  | "verified"
  | "listed"
  | "sold"
  | "rejected"
  | "additional_info_requested"

export interface Patent {
  id: number
  owner_id: number
  title: string
  description: string
  keywords: string
  status: PatentStatus
  ai_summary: string | null
  rejection_reason: string | null
  proof_document_url: string | null
  created_at: string
  updated_at: string
}

export interface ListedPatent {
  id: number
  title: string
  description: string
  keywords: string
  ai_summary: string | null
  created_at: string
}

export interface PatentDocument {
  id: number
  file_name: string
  storage_url: string
  mime_type: string
  size_bytes: number
  doc_type: string
  created_at: string
}

export interface DealSummary {
  id: number
  patent_id: number
  seller_id: number
  buyer_id: number
  status: "initiated" | "negotiating" | "pending_signature" | "signed" | "completed" | "cancelled"
  price_cents: number | null
  currency: string
  notes: string | null
  created_at: string
  updated_at: string
  patent_title: string
  nda_document_id: number | null
  nda_signed_by: number[]
  nda_complete: boolean
}

export interface DealDocument {
  id: number
  file_name: string
  doc_type: string
  mime_type: string
  size_bytes: number
  created_at: string
  download_url: string
}

export interface DealDetail extends DealSummary {
  nda_document: DealDocument | null
}

export interface PatentCreate {
  title: string
  description: string
  keywords?: string
}

export interface PatentUpdate {
  title?: string
  description?: string
  keywords?: string
  proof_document_url?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  }
  if (token) headers["Authorization"] = `Bearer ${token}`
  if (!(fetchOptions.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      data?.detail ?? `Request failed: ${res.status} ${res.statusText}`
    )
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Patents API ─────────────────────────────────────────────────────────────

/** Create a new patent draft */
export const createPatent = (body: PatentCreate, token: string) =>
  request<Patent>("/patents", {
    method: "POST",
    body: JSON.stringify(body),
    token,
  })

/** Get all of the current user's patents */
export const getMyPatents = (token: string, limit = 20, offset = 0) =>
  request<Patent[]>(`/patents/mine?limit=${limit}&offset=${offset}`, { token })

/**
 * Browse publicly listed patents with optional keyword search.
 */
export const getListedPatents = (
  token: string,
  q = "",
  limit = 20,
  offset = 0
) => {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  if (q.trim()) {
    params.set("q", q.trim())
  }

  return request<ListedPatent[]>(`/patents?${params.toString()}`, { token })
}

/** Get a single patent by ID */
export const getPatent = (id: number, token: string) =>
  request<Patent>(`/patents/${id}`, { token })

/** Update a patent (DRAFT or REJECTED only) */
export const updatePatent = (id: number, body: PatentUpdate, token: string) =>
  request<Patent>(`/patents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    token,
  })

/** Upload a PDF proof document (can be called multiple times for multi-doc support) */
export const uploadDocument = (id: number, file: File, token: string) => {
  const form = new FormData()
  form.append("file", file)
  return request<Patent>(`/patents/${id}/upload-document`, {
    method: "POST",
    body: form,
    token,
  })
}

/** Get all documents attached to a patent */
export const getPatentDocuments = (id: number, token: string) =>
  request<PatentDocument[]>(`/patents/${id}/documents`, { token })

/** Delete a specific document from a patent (DRAFT or REJECTED only) */
export const deletePatentDocument = (
  patentId: number,
  docId: number,
  token: string
) =>
  request<void>(`/patents/${patentId}/documents/${docId}`, {
    method: "DELETE",
    token,
  })

/** Submit patent for admin verification */
export const submitPatent = (
  id: number,
  token: string,
  proof_document_url?: string
) =>
  request<Patent>(`/patents/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ proof_document_url: proof_document_url ?? null }),
    token,
  })

/** Delete a patent (DRAFT or REJECTED only) */
export const deletePatent = (id: number, token: string) =>
  request<void>(`/patents/${id}`, { method: "DELETE", token })

// ─── Verification API (Admin only) ──────────────────────────────────────────

/** Get the verification queue — patents awaiting admin review */
export const getVerificationQueue = (
  token: string,
  limit = 20,
  offset = 0
) =>
  request<Patent[]>(
    `/verification/queue?limit=${limit}&offset=${offset}`,
    { token }
  )

/** Approve a patent (PENDING_VERIFICATION or ADDITIONAL_INFO_REQUESTED → VERIFIED) */
export const approvePatent = (id: number, token: string) =>
  request<Patent>(`/verification/${id}/approve`, { method: "POST", token })

/** Reject a patent (PENDING_VERIFICATION or ADDITIONAL_INFO_REQUESTED → REJECTED) */
export const rejectPatent = (id: number, reason: string, token: string) =>
  request<Patent>(`/verification/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    token,
  })

/** Move a VERIFIED patent to LISTED */
export const listPatent = (id: number, token: string) =>
  request<Patent>(`/verification/${id}/list`, { method: "POST", token })

/** Request additional information from the applicant (PENDING_VERIFICATION → ADDITIONAL_INFO_REQUESTED) */
export const requestPatentInfo = (id: number, message: string, token: string) =>
  request<Patent>(`/verification/${id}/request-info`, {
    method: "POST",
    body: JSON.stringify({ message }),
    token,
  })

/** Mark a LISTED patent as SOLD */
export const markPatentSold = (id: number, token: string) =>
  request<Patent>(`/verification/${id}/mark-sold`, { method: "POST", token })

// ─── Semantic Search ──────────────────────────────────────────────────────────

export interface SemanticResult {
  patent: ListedPatent
  score: number
  search_type: "semantic" | "keyword_fallback"
}

/**
 * Semantic search: embeds query with OpenAI, scores by cosine similarity.
 * Falls back to keyword search when no API key is configured.
 */
export const semanticSearch = (
  query: string,
  token: string,
  top_k = 10,
): Promise<SemanticResult[]> =>
  request<SemanticResult[]>("/search/semantic", {
    method: "POST",
    body: JSON.stringify({ query, top_k }),
    token,
  })

/** Fetch a single LISTED patent by ID for the public detail view */
export const getPublicPatent = (id: number, token: string) =>
  request<ListedPatent>(`/search/patents/${id}`, { token })

// ─── Deals and NDA-gated documents ──────────────────────────────────────────

/** Create a deal by expressing interest in a listed patent. */
export const expressInterest = (patent_id: number, token: string) =>
  request<DealSummary>("/deals", {
    method: "POST",
    body: JSON.stringify({ patent_id }),
    token,
  })

/** List the deals involving the current user. */
export const getMyDeals = (token: string) =>
  request<DealSummary[]>("/deals/mine", { token })

/** Get a deal and its NDA signing state. */
export const getDeal = (id: number, token: string) =>
  request<DealDetail>(`/deals/${id}`, { token })

/** Upload the seller's configurable NDA document for a deal. */
export const uploadDealNda = (dealId: number, file: File, token: string) => {
  const form = new FormData()
  form.append("file", file)
  form.append("doc_type", "nda")
  form.append("deal_id", String(dealId))
  return request<{
    id: number
    file_name: string
    doc_type: string
    mime_type: string
    size_bytes: number
    created_at: string
  }>("/documents/upload", {
    method: "POST",
    body: form,
    token,
  })
}

/** Record the authenticated party's assent to the uploaded NDA. */
export const signDealNda = (id: number, token: string) =>
  request<DealDetail>(`/deals/${id}/nda/sign`, { method: "POST", token })

/** List the NDA or, after both signatures, all documents shared in the deal. */
export const getDealDocuments = (id: number, token: string) =>
  request<DealDocument[]>(`/deals/${id}/documents`, { token })

/** Download an NDA or a document shared through a signed deal. */
export const downloadDealDocument = async (
  dealId: number,
  documentId: number,
  token: string,
): Promise<Blob> => {
  const res = await fetch(
    `${API_BASE}/deals/${dealId}/documents/${documentId}/download`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.detail ?? `Download failed: ${res.status} ${res.statusText}`)
  }

  return res.blob()
}

