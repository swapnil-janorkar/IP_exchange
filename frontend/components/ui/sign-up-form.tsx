"use client"

import React, { useState } from "react"
import { Mail, Lock, Eye, EyeOff, User, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"

export type SignUpRole = "innovator" | "organisation"

interface SignUpFormProps {
  onSuccess?: (email: string) => void
  onSignIn?: () => void
  isLoading?: boolean
  error?: string | null
  onSubmit?: (data: {
    email: string
    password: string
    full_name: string
    role: SignUpRole
  }) => void
}

const ROLES: { value: SignUpRole; label: string; description: string }[] = [
  {
    value: "innovator",
    label: "Innovator",
    description: "List and manage your IP & patents",
  },
  {
    value: "organisation",
    label: "Organisation",
    description: "Browse and license innovations",
  },
]

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Lowercase letter", ok: /[a-z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
    { label: "Special character", ok: /[!@#$%^&*()_+\-=\[\]{}|;':",.\/<>?]/.test(password) },
  ]
  const score = checks.filter((c) => c.ok).length

  const barColor =
    score <= 1 ? "hsl(0 84% 60%)" : score <= 3 ? "hsl(38 92% 50%)" : "hsl(142 71% 45%)"

  if (!password) return null

  return (
    <div className="flex flex-col gap-2 mt-1">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i <= score ? barColor : "hsl(222 16% 22%)",
            }}
          />
        ))}
      </div>
      {/* Check list */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((c) => (
          <span
            key={c.label}
            className="flex items-center gap-1 text-xs transition-colors duration-200"
            style={{ color: c.ok ? "hsl(142 71% 55%)" : "hsl(210 40% 60%)", opacity: c.ok ? 1 : 0.5 }}
          >
            <CheckCircle2 className="h-3 w-3" />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function SignUpForm({
  onSuccess,
  onSignIn,
  isLoading = false,
  error,
  onSubmit,
}: SignUpFormProps) {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<SignUpRole>("innovator")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.({ email, password, full_name: fullName, role })
  }

  // Reusable input wrapper styles
  const inputWrap =
    "flex items-center gap-2.5 rounded-xl px-3.5 h-12 transition-all duration-200"
  const inputWrapStyle = {
    background: "hsl(222 16% 16% / 0.5)",
    border: "1px solid hsl(222 16% 22%)",
  }

  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = "hsl(243 75% 65% / 0.6)"
    e.currentTarget.style.background = "hsl(222 16% 16% / 0.7)"
  }
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = "hsl(222 16% 22%)"
    e.currentTarget.style.background = "hsl(222 16% 16% / 0.5)"
  }

  return (
    <Card className="w-full max-w-md glass-card border-0 animate-scale-in">
      <CardContent className="p-8 flex flex-col gap-6">

        {/* Logo */}
        <div className="flex flex-col gap-1 animate-float-up" style={{ animationDelay: "0ms" }}>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tighter text-gradient">IPX</span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-50 pt-1">
              IP Exchange
            </span>
          </div>
          <p className="text-sm opacity-50 font-medium mt-1">
            Create your account
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="flex items-start gap-2.5 rounded-xl px-4 py-3 animate-fade-in"
            style={{
              background: "hsl(0 84% 60% / 0.1)",
              border: "1px solid hsl(0 84% 60% / 0.3)",
            }}
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "hsl(0 84% 60%)" }} />
            <p className="text-sm font-medium" style={{ color: "hsl(0 84% 60%)" }}>
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Role Selector */}
          <div className="flex flex-col gap-2 animate-float-up opacity-0" style={{ animationDelay: "60ms", animationFillMode: "both" }}>
            <Label>I am an…</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className="flex flex-col gap-0.5 rounded-xl px-4 py-3 text-left transition-all duration-200"
                  style={{
                    border: role === r.value
                      ? "1px solid hsl(243 75% 65% / 0.6)"
                      : "1px solid hsl(222 16% 22%)",
                    background: role === r.value
                      ? "hsl(243 75% 65% / 0.1)"
                      : "hsl(222 16% 16% / 0.5)",
                  }}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color: role === r.value ? "hsl(243 75% 75%)" : "hsl(210 40% 90%)" }}
                  >
                    {r.label}
                  </span>
                  <span className="text-xs opacity-50">{r.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Full Name */}
          <div className="flex flex-col gap-2 animate-float-up opacity-0" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
            <Label htmlFor="full_name">Full name</Label>
            <div className={inputWrap} style={inputWrapStyle} onFocus={handleFocus} onBlur={handleBlur}>
              <User className="h-4 w-4 shrink-0 opacity-40" />
              <Input
                id="full_name"
                type="text"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
                className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-full p-0 text-sm"
              />
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-2 animate-float-up opacity-0" style={{ animationDelay: "180ms", animationFillMode: "both" }}>
            <Label htmlFor="reg_email">Email address</Label>
            <div className={inputWrap} style={inputWrapStyle} onFocus={handleFocus} onBlur={handleBlur}>
              <Mail className="h-4 w-4 shrink-0 opacity-40" />
              <Input
                id="reg_email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-full p-0 text-sm"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-2 animate-float-up opacity-0" style={{ animationDelay: "240ms", animationFillMode: "both" }}>
            <Label htmlFor="reg_password">Password</Label>
            <div className={inputWrap} style={inputWrapStyle} onFocus={handleFocus} onBlur={handleBlur}>
              <Lock className="h-4 w-4 shrink-0 opacity-40" />
              <Input
                id="reg_password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-full p-0 text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="opacity-40 hover:opacity-70 transition-opacity ml-auto"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl font-bold text-sm animate-float-up animate-pulse-glow transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "hsl(243 75% 65%)",
              color: "#fff",
              boxShadow: "0 4px 20px hsl(243 75% 65% / 0.3)",
              animationDelay: "300ms",
              animationFillMode: "both",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "hsl(243 75% 58%)"
              e.currentTarget.style.boxShadow = "0 4px 28px hsl(243 75% 65% / 0.5)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "hsl(243 75% 65%)"
              e.currentTarget.style.boxShadow = "0 4px 20px hsl(243 75% 65% / 0.3)"
            }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Creating account…
              </span>
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Sign In link */}
        <p className="text-center text-sm opacity-50 animate-float-up" style={{ animationDelay: "360ms", animationFillMode: "both" }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSignIn}
            className="font-semibold opacity-100 transition-opacity hover:opacity-70"
            style={{ color: "hsl(243 75% 65%)" }}
          >
            Sign In
          </button>
        </p>
      </CardContent>
    </Card>
  )
}

