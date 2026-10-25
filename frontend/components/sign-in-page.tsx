"use client"

import React, { useState, useCallback } from "react"
import SignInForm from "@/components/ui/sign-in-form"
import RoleSelection from "@/components/ui/role-selection"
import { useAuth } from "@/contexts/auth-context"

type FlowStep = "sign-in" | "role-selection" | "dashboard"

export default function SignInPage() {
  const { signIn, user, isLoading, error, clearError } = useAuth()
  const [step, setStep] = useState<FlowStep>("sign-in")

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      clearError()
      await signIn(email, password)
      // After successful sign-in, if user's role is already set (returning user),
      // go straight to dashboard; otherwise ask for role.
      if (!error) {
        setStep("role-selection")
      }
    },
    [signIn, clearError, error],
  )

  // Once user picks a role -> redirect to dashboard
  const handleRoleSelect = useCallback(
    (_role: "innovator" | "organisation") => {
      // In a real app: PATCH /auth/me { role } then push to /dashboard
      setStep("dashboard")
    },
    [],
  )

  // ---- Dashboard placeholder (replace with real dashboard page) ----
  if (step === "dashboard" && user) {
    return (
      <div className="min-h-screen violet-gradient-bg flex flex-col items-center justify-center p-6">
        <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center animate-scale-in flex flex-col gap-4">
          <span className="text-4xl font-black tracking-tighter text-gradient">IPX</span>
          <h1 className="text-xl font-bold text-foreground">
            Welcome, {user.full_name ?? user.email}!
          </h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in as a{" "}
            <span className="font-semibold text-primary capitalize">{user.role}</span>.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Dashboard is under construction — your role is confirmed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen violet-gradient-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-purple-500/8 blur-3xl"
      />

      <div className="relative z-10 w-full flex justify-center">
        {step === "sign-in" && (
          <SignInForm
            isLoading={isLoading}
            error={error}
            onSubmit={handleSignIn}
            onSignUp={() => {/* navigate to /register */}}
          />
        )}

        {step === "role-selection" && (
          <RoleSelection
            userEmail={user?.email}
            onSelectRole={handleRoleSelect}
          />
        )}
      </div>
    </main>
  )
}
