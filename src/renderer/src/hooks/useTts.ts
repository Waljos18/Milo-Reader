import { useCallback, useEffect, useRef, useState } from 'react'

export type TtsStatus = 'idle' | 'speaking' | 'paused'

const RATE_STEPS = [0.75, 1, 1.25, 1.5] as const

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith('es-pe')) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('es')) ??
    voices.find((v) => v.default) ??
    voices[0]
  )
}

export function useTts(): {
  status: TtsStatus
  rate: number
  cycleRate: () => void
  speak: (text: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  supported: boolean
} {
  const [status, setStatus] = useState<TtsStatus>('idle')
  const [rate, setRate] = useState(1)
  const rateRef = useRef(rate)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    rateRef.current = rate
  }, [rate])

  useEffect(() => {
    if (!supported) return
    // En Chromium las voces a veces llegan de forma asíncrona.
    window.speechSynthesis.getVoices()
    function onVoices(): void {
      window.speechSynthesis.getVoices()
    }
    window.speechSynthesis.addEventListener('voiceschanged', onVoices)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
      window.speechSynthesis.cancel()
    }
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    utteranceRef.current = null
    setStatus('idle')
  }, [supported])

  const speak = useCallback(
    (text: string) => {
      if (!supported) return
      const cleaned = text.replace(/\s+/g, ' ').trim()
      if (!cleaned) return

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(cleaned)
      utterance.rate = rateRef.current
      const voice = pickVoice(window.speechSynthesis.getVoices())
      if (voice) utterance.voice = voice

      utterance.onstart = () => setStatus('speaking')
      utterance.onend = () => {
        utteranceRef.current = null
        setStatus('idle')
      }
      utterance.onerror = () => {
        utteranceRef.current = null
        setStatus('idle')
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
      setStatus('speaking')
    },
    [supported]
  )

  const pause = useCallback(() => {
    if (!supported || status !== 'speaking') return
    window.speechSynthesis.pause()
    setStatus('paused')
  }, [supported, status])

  const resume = useCallback(() => {
    if (!supported || status !== 'paused') return
    window.speechSynthesis.resume()
    setStatus('speaking')
  }, [supported, status])

  const cycleRate = useCallback(() => {
    setRate((current) => {
      const idx = RATE_STEPS.indexOf(current as (typeof RATE_STEPS)[number])
      const next = RATE_STEPS[(idx + 1) % RATE_STEPS.length]
      return next
    })
  }, [])

  return { status, rate, cycleRate, speak, pause, resume, stop, supported }
}
