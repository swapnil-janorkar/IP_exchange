"use client"

import React, { useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import SignInForm from "@/components/ui/sign-in-form"
import SignUpForm from "@/components/ui/sign-up-form"
import RoleSelection from "@/components/ui/role-selection"
import { useAuth } from "@/contexts/auth-context"

/** Route each role to its home page */
function roleHomePath(role: string | null): string {
  if (role === "admin") return "/admin"
  if (role === "innovator") return "/patents"
  return "/browse" // organisation — placeholder until browse page exists
}

type FlowStep = "sign-in" | "sign-up" | "role-selection"

export default function SignInPage() {
  const router = useRouter()
  const { signIn, signUp, setRole, user, isAuthenticated, isLoading, error, clearError } = useAuth()
  const [step, setStep] = React.useState<FlowStep>("sign-in")

  // If already authenticated (e.g. user refreshed the page), redirect immediately
  useEffect(() => {
    if (isAuthenticated && user?.role) {
      router.replace(roleHomePath(user.role))
    }
  }, [isAuthenticated, user, router])

  /** Called when the email+password form is submitted. */
  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      clearError()
      try {
        const loggedInUser = await signIn(email, password)
        // If the user already has a role stored in DB (from sign-up), go straight there
        if (loggedInUser.role) {
          router.replace(roleHomePath(loggedInUser.role))
        } else {
          // No role yet — show the role picker
          setStep("role-selection")
        }
      } catch {
        // Error already set in auth context — stay on sign-in step
      }
    },
    [signIn, clearError, router],
  )

  /** Called when the sign-up form is submitted. */
  const handleSignUp = useCallback(
    async (data: { email: string; password: string; full_name: string; role: "innovator" | "organisation" }) => {
      clearError()
      try {
        await signUp(data)
        // signUp auto-logs them in; user.role is already set — redirect directly
        router.replace(roleHomePath(data.role))
      } catch {
        // Error already set in auth context — stay on sign-up step
      }
    },
    [signUp, clearError, router],
  )

  /**
   * Called when the user picks a role on the role-selection screen.
   * Updates context, then navigates to the correct home page.
   */
  const handleRoleSelect = useCallback(
    (selectedRole: "innovator" | "organisation" | "admin") => {
      setRole(selectedRole)
      router.replace(roleHomePath(selectedRole))
    },
    [setRole, router],
  )

  // While the user already exists but role check/redirect is in flight, show nothing
  if (isAuthenticated && user?.role) return null

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
        {/* Sign-in form */}
        {step === "sign-in" && !isAuthenticated && (
          <SignInForm
            isLoading={isLoading}
            error={error}
            onSubmit={handleSignIn}
            onSignUp={() => { clearError(); setStep("sign-up") }}
          />
        )}

        {/* Sign-up form */}
        {step === "sign-up" && !isAuthenticated && (
          <SignUpForm
            isLoading={isLoading}
            error={error}
            onSubmit={handleSignUp}
            onSignIn={() => { clearError(); setStep("sign-in") }}
          />
        )}

        {/* Role picker once we have a user but no role set */}
        {step === "role-selection" && user && !user.role && (
          <RoleSelection
            userEmail={user.email}
            onSelectRole={handleRoleSelect}
          />
        )}

        {/* If sign-in succeeded but role was already set, redirect is in flight */}
        {step === "role-selection" && user?.role && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <svg className="h-8 w-8 animate-spin" style={{ color: "hsl(243 75% 65%)" }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm opacity-50">Redirecting…</p>
          </div>
        )}
      </div>
    </main>
  )
}
