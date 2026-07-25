import { useCallback, useEffect, useRef } from 'react'

/**
 * Abre una sesión de lectura al montar / al volver a la pestaña, y la cierra
 * al desmontar, ocultar la pestaña o cambiar de libro. Cuenta ubicaciones leídas
 * (páginas o saltos EPUB) vía `recordLocation`.
 */
export function useReadingSession(bookId: string | undefined): {
  recordLocation: (locationKey: string) => void
} {
  const sessionIdRef = useRef<string | null>(null)
  const locationsRef = useRef(0)
  const lastLocationKeyRef = useRef<string | null>(null)
  const bookIdRef = useRef(bookId)
  bookIdRef.current = bookId

  const endCurrent = useCallback(async (): Promise<void> => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return
    sessionIdRef.current = null
    const locations = locationsRef.current
    locationsRef.current = 0
    lastLocationKeyRef.current = null
    try {
      await window.api.endReadingSession(sessionId, locations)
    } catch {
      // ignorar si la DB ya cerró la sesión
    }
  }, [])

  const startCurrent = useCallback(async (): Promise<void> => {
    const id = bookIdRef.current
    if (!id || sessionIdRef.current) return
    try {
      const session = await window.api.startReadingSession(id)
      sessionIdRef.current = session.id
      locationsRef.current = 0
      lastLocationKeyRef.current = null
    } catch {
      // libro inexistente u otro error de IPC
    }
  }, [])

  useEffect(() => {
    if (!bookId) return

    void endCurrent().then(() => startCurrent())

    function onVisibility(): void {
      if (document.visibilityState === 'hidden') {
        void endCurrent()
      } else {
        void startCurrent()
      }
    }

    function onPageHide(): void {
      void endCurrent()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      void endCurrent()
    }
  }, [bookId, endCurrent, startCurrent])

  const recordLocation = useCallback((locationKey: string) => {
    if (!locationKey) return
    if (lastLocationKeyRef.current === locationKey) return
    if (sessionIdRef.current && lastLocationKeyRef.current !== null) {
      locationsRef.current += 1
    }
    lastLocationKeyRef.current = locationKey
  }, [])

  return { recordLocation }
}
