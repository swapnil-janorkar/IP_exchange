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

/** Upload a PDF proof document */
export const uploadDocument = (id: number, file: File, token: string) => {
  const form = new FormData()
  form.append("file", file)
  return request<Patent>(`/patents/${id}/upload-document`, {
    method: "POST",
    body: form,
    token,
  })
}

/** Submit patent for admin verification */
export const submitPatent = (
  id: number,
  proof_document_url: string,
  token: string
) =>
  request<Patent>(`/patents/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ proof_document_url }),
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

/** Approve a patent (PENDING_VERIFICATION → VERIFIED) */
export const approvePatent = (id: number, token: string) =>
  request<Patent>(`/verification/${id}/approve`, { method: "POST", token })

/** Reject a patent (PENDING_VERIFICATION → REJECTED) */
export const rejectPatent = (id: number, reason: string, token: string) =>
  request<Patent>(`/verification/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    token,
  })

/** Move a VERIFIED patent to LISTED */
export const listPatent = (id: number, token: string) =>
  request<Patent>(`/verification/${id}/list`, { method: "POST", token })
