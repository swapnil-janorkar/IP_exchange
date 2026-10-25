"use client"

import React, { createContext, useContext, useState, useCallback } from "react"

export type UserRole = "innovator" | "organisation" | null

export interface AuthUser {
  id: number
  email: string
  role: UserRole
  full_name: string | null
  is_active: boolean
  is_verified: boolean
  access_token: string
  refresh_token: string
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
  setRole: (role: "innovator" | "organisation") => void
  isLoading: boolean
  error: string | null
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail ?? "Invalid email or password.")
      }

      const tokens = await res.json()

      // Fetch current user profile
      const profileRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })

      if (!profileRes.ok) throw new Error("Failed to load user profile.")

      const profile = await profileRes.json()

      setUser({
        ...profile,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setRole = useCallback(
    (role: "innovator" | "organisation") => {
      if (user) setUser({ ...user, role })
    },
    [user],
  )

  const signOut = useCallback(() => {
    setUser(null)
    setError(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        signIn,
        signOut,
        setRole,
        isLoading,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
