"use client"

import React from "react"
import { useAuth } from "@/contexts/auth-context"
import AdminVerificationQueue from "@/components/patents/admin-verification-queue"

export default function AdminPage() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg font-bold opacity-60">Please sign in to access this page.</p>
        </div>
      </div>
    )
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <div
          className="rounded-2xl p-8 text-center max-w-sm"
          style={{ background: "hsl(222 18% 10%)", border: "1px solid hsl(0 84% 60%/0.3)" }}
        >
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "hsl(0 84% 60%/0.1)", color: "hsl(0 84% 60%)" }}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-base font-bold mb-2" style={{ color: "hsl(210 40% 98%)" }}>Access Restricted</p>
          <p className="text-sm opacity-50">This page is only accessible to administrators.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen violet-gradient-bg">
      <AdminVerificationQueue token={user.access_token} />
    </div>
  )
}
