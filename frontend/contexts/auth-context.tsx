"use client"

import React, { createContext, useContext, useState, useCallback } from "react"

export type UserRole = "innovator" | "organisation" | "admin" | null

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
  signIn: (email: string, password: string) => Promise<AuthUser>  // throws on failure, returns user with DB role
  signUp: (data: { email: string; password: string; full_name: string; role: "innovator" | "organisation" }) => Promise<void> // throws on failure
  signOut: () => void
  setRole: (role: "innovator" | "organisation" | "admin") => void
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

  const signIn = useCallback(async (email: string, password: string): Promise<AuthUser> => {
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

      // Fetch current user profile (includes role stored in DB from sign-up)
      const profileRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })

      if (!profileRes.ok) throw new Error("Failed to load user profile.")

      const profile = await profileRes.json()

      const authUser: AuthUser = {
        ...profile,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      }
      setUser(authUser)
      return authUser  // return so callers can read the role immediately
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setRole = useCallback(
    (role: "innovator" | "organisation" | "admin") => {
      if (user) setUser({ ...user, role })
    },
    [user],
  )

  const signOut = useCallback(() => {
    setUser(null)
    setError(null)
  }, [])

  const signUp = useCallback(async (data: {
    email: string
    password: string
    full_name: string
    role: "innovator" | "organisation"
  }) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const detail = body?.detail
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg).join(", ")
              : "Registration failed."
        throw new Error(message)
      }
      // Registration succeeded — now log them in automatically
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password }),
      })
      if (!loginRes.ok) throw new Error("Account created! Please sign in.")
      const tokens = await loginRes.json()
      const profileRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (!profileRes.ok) throw new Error("Account created! Please sign in.")
      const profile = await profileRes.json()
      setUser({
        ...profile,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      throw new Error(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        signIn,
        signUp,
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
