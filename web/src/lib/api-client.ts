/**
 * Typed fetch wrapper for FastAPI backend.
 * In the browser, calls go through Next.js rewrite proxy (/api/fastapi/*).
 * In Server Components, calls go directly to NEXT_PUBLIC_FASTAPI_URL.
 */

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

export async function fetchFromFastAPI<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const isServer = typeof window === 'undefined'
  const baseUrl = isServer ? FASTAPI_URL : ''
  const prefix = isServer ? '' : '/api/fastapi'

  const url = `${baseUrl}${prefix}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`FastAPI request failed: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

export async function fetchDataFile<T>(filename: string): Promise<T> {
  return fetchFromFastAPI<T>(`/data/${filename}`)
}
