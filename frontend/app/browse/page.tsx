"use client"

import { useRef, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import Link from "next/link"
import { AlertCircle, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import { getListedPatents, type ListedPatent } from "@/lib/api"

const PAGE_SIZE = 20

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load patents."
}

function SearchMessage({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Card className="glass-card border-0">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="max-w-md text-sm opacity-60">{description}</p>
        {action}
      </CardContent>
    </Card>
  )
}

export default function BrowsePage() {
  const { user, isAuthenticated } = useAuth()
  const [query, setQuery] = useState("")
  const [activeQuery, setActiveQuery] = useState("")
  const [patents, setPatents] = useState<ListedPatent[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextOffset = useRef(0)
  const searchId = useRef(0)

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const term = query.trim()

    if (term.length < 2) {
      setError("Enter at least 2 characters to search.")
      return
    }

    if (!user) return

    const currentSearchId = ++searchId.current
    setActiveQuery(term)
    setHasSearched(true)
    setPatents([])
    setHasMore(false)
    setError(null)
    setIsLoading(true)
    setIsLoadingMore(false)
    nextOffset.current = 0

    try {
      const results = await getListedPatents(user.access_token, term, PAGE_SIZE)
      if (currentSearchId !== searchId.current) return

      setPatents(results)
      setHasMore(results.length === PAGE_SIZE)
      nextOffset.current = results.length
    } catch (searchError) {
      if (currentSearchId === searchId.current) {
        setError(getErrorMessage(searchError))
      }
    } finally {
      if (currentSearchId === searchId.current) {
        setIsLoading(false)
      }
    }
  }

  const loadMore = async () => {
    if (!user || !hasMore || isLoadingMore) return

    const currentSearchId = searchId.current
    setIsLoadingMore(true)
    setError(null)

    try {
      const results = await getListedPatents(
        user.access_token,
        activeQuery,
        PAGE_SIZE,
        nextOffset.current,
      )
      if (currentSearchId !== searchId.current) return

      setPatents((current) => [...current, ...results])
      nextOffset.current += results.length
      setHasMore(results.length === PAGE_SIZE)
    } catch (loadError) {
      if (currentSearchId === searchId.current) {
        setError(getErrorMessage(loadError))
      }
    } finally {
      if (currentSearchId === searchId.current) {
        setIsLoadingMore(false)
      }
    }
  }

  const clearSearch = () => {
    searchId.current += 1
    setQuery("")
    setActiveQuery("")
    setPatents([])
    setHasSearched(false)
    setHasMore(false)
    setError(null)
    setIsLoading(false)
    setIsLoadingMore(false)
    nextOffset.current = 0
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <SearchMessage
          title="Sign in to discover patents"
          description="Organisation accounts can search the publicly listed IP catalogue."
          action={
            <Button asChild className="mt-2">
              <Link href="/">Go to sign in</Link>
            </Button>
          }
        />
      </main>
    )
  }

  if (user.role !== "organisation") {
    return (
      <main className="min-h-screen violet-gradient-bg flex items-center justify-center p-4">
        <SearchMessage
          title="Organisation access only"
          description="Sign in with an organisation account to search listed patents."
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen violet-gradient-bg">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <header className="mb-10 text-center">
          <div className="mb-3 inline-flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tighter text-gradient">IPX</span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] opacity-40">
              Discover IP
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Find the right innovation
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-60 sm:text-base">
            Search listed patents by technology, application, or keyword.
          </p>
        </header>

        <form
          onSubmit={search}
          className="mx-auto mb-10 flex max-w-3xl flex-col gap-3 sm:flex-row"
          role="search"
        >
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 opacity-40"
            />
            <Input
              aria-label="Search patents by keyword"
              autoComplete="off"
              maxLength={100}
              minLength={2}
              onChange={(event) => {
                setQuery(event.target.value)
                if (error) setError(null)
              }}
              placeholder="Try battery recycling or medical imaging"
              type="search"
              value={query}
              className="h-14 rounded-2xl pl-12 pr-12 text-base"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg opacity-50 transition hover:bg-secondary hover:opacity-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" size="lg" disabled={isLoading} className="h-14 rounded-2xl">
            {isLoading ? (
              <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search aria-hidden="true" className="mr-2 h-4 w-4" />
            )}
            Search patents
          </Button>
        </form>

        <p className="mx-auto -mt-6 mb-8 max-w-3xl text-xs opacity-40">
          Start with a broad idea. Search terms match patent titles, descriptions, keywords, and
          available summaries.
        </p>

        {error && (
          <div
            role="alert"
            className="mx-auto mb-6 flex max-w-3xl items-start gap-2.5 rounded-xl px-4 py-3"
            style={{
              background: "hsl(0 84% 60% / 0.1)",
              border: "1px solid hsl(0 84% 60% / 0.3)",
              color: "hsl(0 84% 65%)",
            }}
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-16" role="status">
            <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm opacity-50">Searching listed patents…</p>
          </div>
        )}

        {!isLoading && !hasSearched && (
          <SearchMessage
            title="What are you looking for?"
            description="Enter a technology, material, or application above to explore matching listed patents."
          />
        )}

        {!isLoading && hasSearched && !error && patents.length === 0 && (
          <SearchMessage
            title="No matching patents yet"
            description={`Try a broader keyword or a different phrase than “${activeQuery}”.`}
            action={
              <Button type="button" variant="outline" className="mt-2" onClick={clearSearch}>
                Clear search
              </Button>
            }
          />
        )}

        {!isLoading && patents.length > 0 && (
          <section aria-label={`Search results for ${activeQuery}`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">
                Results for <span className="text-primary">&ldquo;{activeQuery}&rdquo;</span>
              </h2>
              <p className="text-xs opacity-50">
                {patents.length} {patents.length === 1 ? "result" : "results"} loaded
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {patents.map((patent) => {
                const keywords = patent.keywords
                  .split(",")
                  .map((keyword) => keyword.trim())
                  .filter(Boolean)

                return (
                  <Card key={patent.id} className="glass-card border-0">
                    <CardContent className="p-5 sm:p-6">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="text-base font-bold sm:text-lg">{patent.title}</h3>
                          <time
                            className="shrink-0 text-xs opacity-40"
                            dateTime={patent.created_at}
                          >
                            Listed {formatDate(patent.created_at)}
                          </time>
                        </div>

                        <p className="text-sm leading-relaxed opacity-65">
                          {patent.ai_summary || "A summary is not available for this patent yet."}
                        </p>

                        {keywords.length > 0 && (
                          <ul className="flex flex-wrap gap-2" aria-label="Patent keywords">
                            {keywords.slice(0, 6).map((keyword) => (
                              <li
                                key={keyword}
                                className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary"
                              >
                                {keyword}
                              </li>
                            ))}
                            {keywords.length > 6 && (
                              <li className="self-center text-xs opacity-40">
                                +{keywords.length - 6} more
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore && (
                    <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isLoadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
