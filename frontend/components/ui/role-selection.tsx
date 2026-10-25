"use client"

import React from "react"
import { Lightbulb, Building2, ArrowRight, CheckCircle2 } from "lucide-react"

interface RoleOption {
  id: "innovator" | "organisation"
  icon: React.ReactNode
  title: string
  subtitle: string
  description: string
  features: string[]
  gradientFrom: string
  gradientTo: string
  iconColor: string
  iconBg: string
}

const roles: RoleOption[] = [
  {
    id: "innovator",
    icon: <Lightbulb className="h-7 w-7" />,
    title: "Innovator",
    subtitle: "Individual creator & inventor",
    description:
      "List, manage, and monetize your intellectual property. Connect with organisations ready to license or acquire your innovations.",
    features: [
      "Upload & manage patents",
      "Set licensing terms",
      "Receive offers & deal proposals",
      "AI-powered IP valuation",
    ],
    gradientFrom: "hsl(270 70% 55%)",
    gradientTo: "hsl(243 75% 65%)",
    iconColor: "hsl(270 70% 70%)",
    iconBg: "hsl(270 70% 55% / 0.12)",
  },
  {
    id: "organisation",
    icon: <Building2 className="h-7 w-7" />,
    title: "Organisation",
    subtitle: "Company or institution",
    description:
      "Discover, evaluate, and acquire intellectual property. Build your IP portfolio and drive innovation through strategic partnerships.",
    features: [
      "Search & filter IP catalogue",
      "Due diligence & verification",
      "Send offers & close deals",
      "Portfolio analytics",
    ],
    gradientFrom: "hsl(200 80% 50%)",
    gradientTo: "hsl(210 70% 55%)",
    iconColor: "hsl(200 80% 65%)",
    iconBg: "hsl(200 80% 50% / 0.12)",
  },
]

interface RoleSelectionProps {
  userEmail?: string
  onSelectRole: (role: "innovator" | "organisation") => void
  isLoading?: boolean
}

export default function RoleSelection({
  userEmail,
  onSelectRole,
  isLoading = false,
}: RoleSelectionProps) {
  const [selected, setSelected] = React.useState<"innovator" | "organisation" | null>(null)

  const handleConfirm = () => {
    if (selected) onSelectRole(selected)
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-8 animate-scale-in px-4">
      {/* Header */}
      <div className="text-center animate-float-up">
        <div className="inline-flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-black tracking-tighter text-gradient">IPX</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-2" style={{ color: "hsl(210 40% 98%)" }}>
          How will you use IPX?
        </h1>
        <p className="text-sm opacity-50">
          {userEmail ? (
            <>
              Welcome,{" "}
              <span className="opacity-100 font-semibold" style={{ color: "hsl(210 40% 98%)" }}>
                {userEmail}
              </span>
              . Choose your role to personalise your experience.
            </>
          ) : (
            "Choose your role to personalise your experience."
          )}
        </p>
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger">
        {roles.map((role) => {
          const isSelected = selected === role.id
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelected(role.id)}
              className="relative text-left rounded-2xl transition-all duration-300 p-6 flex flex-col gap-4 group outline-none animate-float-up opacity-0"
              style={{
                background: isSelected
                  ? `hsl(243 75% 65% / 0.08)`
                  : "hsl(222 18% 10% / 0.85)",
                border: isSelected
                  ? "1px solid hsl(243 75% 65% / 0.5)"
                  : "1px solid hsl(222 16% 22% / 0.6)",
                boxShadow: isSelected
                  ? "0 0 0 1px hsl(243 75% 65% / 0.3), 0 0 20px hsl(243 75% 65% / 0.08)"
                  : "none",
                backdropFilter: "blur(20px)",
              }}
              aria-pressed={isSelected}
            >
              {/* Selection indicator */}
              {isSelected && (
                <span className="absolute top-4 right-4 animate-scale-in">
                  <CheckCircle2
                    className="h-5 w-5"
                    style={{ color: "hsl(243 75% 65%)", fill: "hsl(243 75% 65% / 0.2)" }}
                  />
                </span>
              )}

              {/* Icon */}
              <div
                className="inline-flex items-center justify-center h-14 w-14 rounded-2xl transition-transform duration-300"
                style={{
                  background: role.iconBg,
                  color: role.iconColor,
                  border: `1px solid ${role.iconColor}33`,
                  transform: isSelected ? "scale(1.05)" : "scale(1)",
                }}
              >
                {role.icon}
              </div>

              {/* Title */}
              <div>
                <h2 className="text-base font-bold tracking-tight mb-0.5" style={{ color: "hsl(210 40% 98%)" }}>
                  {role.title}
                </h2>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-40">
                  {role.subtitle}
                </p>
              </div>

              {/* Description */}
              <p className="text-sm opacity-50 leading-relaxed">{role.description}</p>

              {/* Features */}
              <ul className="flex flex-col gap-2 mt-auto">
                {role.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs opacity-60">
                    <div
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${role.gradientFrom}, ${role.gradientTo})`,
                      }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Bottom gradient bar */}
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl transition-opacity duration-300"
                style={{
                  background: `linear-gradient(90deg, ${role.gradientFrom}, ${role.gradientTo})`,
                  opacity: isSelected ? 1 : 0,
                }}
              />
            </button>
          )
        })}
      </div>

      {/* Confirm Button */}
      <div className="flex justify-center animate-float-up" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || isLoading}
          className="flex items-center gap-2 px-10 h-12 rounded-xl font-bold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "hsl(243 75% 65%)",
            color: "#fff",
            boxShadow: selected ? "0 4px 20px hsl(243 75% 65% / 0.3)" : "none",
          }}
          onMouseEnter={(e) => {
            if (selected) {
              e.currentTarget.style.background = "hsl(243 75% 58%)"
              e.currentTarget.style.boxShadow = "0 4px 28px hsl(243 75% 65% / 0.5)"
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "hsl(243 75% 65%)"
            e.currentTarget.style.boxShadow = selected ? "0 4px 20px hsl(243 75% 65% / 0.3)" : "none"
          }}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Setting up…
            </span>
          ) : (
            <>
              Continue as {selected ? roles.find((r) => r.id === selected)?.title : "…"}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {/* Fine print */}
      <p className="text-center text-xs opacity-30 animate-fade-in" style={{ animationDelay: "500ms", animationFillMode: "both" }}>
        You can update your role later in account settings.
      </p>
    </div>
  )
}
