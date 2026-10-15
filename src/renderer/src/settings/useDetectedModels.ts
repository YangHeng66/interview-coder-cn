import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiProtocol } from '../../../preload/contracts'

const DETECT_DELAY_MS = 800

// Memory only, so returning to the settings page does not refetch; keys never hit storage
const detectedCache = new Map<string, string[]>()

export type ModelDetection = {
  /** False until both the Base URL and the API Key are filled in */
  ready: boolean
  loading: boolean
  models: string[] | null
  error: string | null
  refresh: () => void
}

/** Fetch the provider's model list once the connection is filled in (debounced) */
export function useDetectedModels(
  apiProtocol: ApiProtocol,
  apiBaseURL: string,
  apiKey: string
): ModelDetection {
  const baseURL = apiBaseURL.trim()
  const key = apiKey.trim()
  const ready = Boolean(baseURL && key)
  const cacheKey = `${apiProtocol}\n${baseURL}\n${key}`
  const [result, setResult] = useState<{ cacheKey: string; error: string | null }>({
    cacheKey: '',
    error: null
  })
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const detect = useCallback(async () => {
    const request = ++latestRequest.current
    setLoadingKey(cacheKey)
    const response = await window.api.listModels({ apiProtocol, apiBaseURL: baseURL, apiKey: key })
    // A newer connection may have been typed in while this one was in flight
    if (request !== latestRequest.current) return
    setLoadingKey(null)
    if (response.ok) detectedCache.set(cacheKey, response.models)
    setResult({ cacheKey, error: response.ok ? null : response.error })
  }, [apiProtocol, baseURL, key, cacheKey])

  useEffect(() => {
    if (!ready || detectedCache.has(cacheKey)) return
    const timer = window.setTimeout(() => void detect(), DETECT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [ready, cacheKey, detect])

  return {
    ready,
    loading: ready && loadingKey === cacheKey,
    models: (ready && detectedCache.get(cacheKey)) || null,
    error: ready && result.cacheKey === cacheKey ? result.error : null,
    refresh: () => {
      if (!ready) return
      detectedCache.delete(cacheKey)
      void detect()
    }
  }
}
