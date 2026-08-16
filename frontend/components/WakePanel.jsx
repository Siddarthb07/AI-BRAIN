'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useJarvisStore } from '../app/store'
import { AMERICAN_VOICE_MATCHERS, clipForSpeech, createStreamingSpeaker, DEFAULT_SPEECH_CHUNK_CHARS, DEFAULT_SPEECH_MAX_CHARS, speakText as playSpeech, stopSpeechPlayback } from '../lib/speech'
import { resolveApiBase } from '../lib/api'
import { routeVoiceCommand } from '../lib/voiceCommands'

const WAKE_RE = /\bjarvis\b/i
const KEEP_RE =
  /\b(keep listening|stay listening|always listen(?:ing)?|continuous listen(?:ing)?)\b/i
const STOP_RE =
  /\b(stop listening|go to sleep|jarvis sleep|goodbye jarvis|cancel listening|stop always listen(?:ing)?)\b/i
const CAPTURE_RE =
  /\b(capture what i(?:'?m| am) seeing(?: now)?|what(?:'?s| is) (?:on|in) (?:my |the )?(?:camera|screen|desk|view)|what am i (?:looking at|seeing)(?: now)?|look at (?:this|my desk|the (?:room|camera|view))|take a (?:photo|picture|snapshot|capture)|analyze (?:this|the|my) (?:view|frame|camera|scene)|vision capture|open (?:the )?camera|use (?:the )?camera)\b/i

const INTERRUPT_RE = /\b(jarvis\s+)?(stop talking|be quiet|shut up|enough|cancel reply)\b/i
const SPEECH_MAX_CHARS = DEFAULT_SPEECH_MAX_CHARS
const SPEECH_CHUNK = DEFAULT_SPEECH_CHUNK_CHARS

function extractCapturePrompt(text = '') {
  const cleaned = stripWake(text).replace(CAPTURE_RE, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned && cleaned.length > 3 && !/^(now|please|for me)$/i.test(cleaned)) return cleaned
  return 'Describe clearly what is visible in this camera frame. Be concrete and brief.'
}

function stripWake(text = '') {
  return text.replace(WAKE_RE, ' ').replace(/\s+/g, ' ').trim()
}

function isBargeIn(text, { keepListening, lastSpoken }) {
  if (!text || looksLikeEcho(text, lastSpoken)) return false
  if (INTERRUPT_RE.test(text)) return true
  if (WAKE_RE.test(text)) return true
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (keepListening && words.length >= 3) return true
  if (words.length >= 5) return true
  return false
}

function normalize(text = '') {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function looksLikeEcho(heard, lastSpoken) {
  if (!heard || !lastSpoken) return false
  const a = normalize(heard)
  const b = normalize(lastSpoken).slice(0, 140)
  if (a.length < 4) return false
  if (b.includes(a) || a.includes(b.slice(0, Math.min(48, b.length)))) return true
  const aw = a.split(' ').slice(0, 5)
  const bw = new Set(b.split(' ').slice(0, 14))
  const hits = aw.filter((w) => w.length > 2 && bw.has(w)).length
  return hits >= 3
}

function isNoiseOrIdle(text, { keepListening, hasWake }) {
  const t = text.trim()
  if (!t) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (keepListening && !hasWake && words.length < 2) return true
  if (/^(um+|uh+|ah+|hmm+|mhm+|yeah|ok|okay|right|thanks|thank you)$/i.test(t)) return true
  return false
}

/**
 * Persistent mic listener. Recognition instance is stable (wakeEnabled only)
 * so keep-listening / always-listening does not abort-loop on every reply.
 */
export function WakeRuntime() {
  const wakeEnabled = useJarvisStore((s) => s.wakeEnabled)
  const keepListening = useJarvisStore((s) => s.keepListening)
  const setKeepListening = useJarvisStore((s) => s.setKeepListening)
  const setWakeStatus = useJarvisStore((s) => s.setWakeStatus)
  const setVoiceState = useJarvisStore((s) => s.setVoiceState)
  const sendChat = useJarvisStore((s) => s.sendChat)
  const setStatusMsg = useJarvisStore((s) => s.setStatusMsg)
  const runVoiceVisionCapture = useJarvisStore((s) => s.runVoiceVisionCapture)

  const ARM_TTL_MS = 12000

  const recognitionRef = useRef(null)
  const keepRef = useRef(keepListening)
  const processingRef = useRef(false)
  const speakingRef = useRef(false)
  const armedRef = useRef(false)
  const armUntilRef = useRef(0)
  const muteUntilRef = useRef(0)
  const lastSpokenRef = useRef('')
  const lastHeardRef = useRef({ text: '', at: 0 })
  const wakeEnabledRef = useRef(wakeEnabled)
  const restartTimer = useRef(null)
  const handleUtteranceRef = useRef(null)

  useEffect(() => {
    keepRef.current = keepListening
    if (keepListening) {
      armedRef.current = true
      armUntilRef.current = 0
      setWakeStatus('listening_command')
      setStatusMsg('ALWAYS LISTENING — ASK ANYTHING')
    } else if (armedRef.current) {
      armedRef.current = false
      armUntilRef.current = 0
      setWakeStatus(wakeEnabled ? 'listening_wake' : 'off')
      if (wakeEnabled) setStatusMsg('WAKE — SAY JARVIS')
    }
  }, [keepListening, wakeEnabled, setWakeStatus, setStatusMsg])

  useEffect(() => {
    wakeEnabledRef.current = wakeEnabled
    if (!wakeEnabled) {
      armedRef.current = false
      armUntilRef.current = 0
      setKeepListening(false)
      keepRef.current = false
    }
  }, [wakeEnabled, setKeepListening])

  useEffect(() => {
    if (!wakeEnabled) return undefined
    const id = setInterval(() => {
      if (keepRef.current || !armedRef.current || !armUntilRef.current) return
      if (Date.now() > armUntilRef.current) {
        armedRef.current = false
        armUntilRef.current = 0
        setWakeStatus('listening_wake')
        setStatusMsg('WAKE — SAY JARVIS')
      }
    }, 400)
    return () => clearInterval(id)
  }, [wakeEnabled, setWakeStatus, setStatusMsg])

  const isArmed = () => {
    if (keepRef.current) return true
    if (!armedRef.current) return false
    if (armUntilRef.current && Date.now() > armUntilRef.current) {
      armedRef.current = false
      armUntilRef.current = 0
      return false
    }
    return true
  }

  const armSilent = (ttlMs = ARM_TTL_MS) => {
    armedRef.current = true
    armUntilRef.current = ttlMs > 0 ? Date.now() + ttlMs : 0
  }

  const armMute = (ms = 600) => {
    muteUntilRef.current = Date.now() + ms
  }

  const speak = useCallback(
    async (text, { announce = true } = {}) => {
      if (!text) return
      const spoken = clipForSpeech(text, SPEECH_MAX_CHARS)
      if (announce) {
        speakingRef.current = true
        setWakeStatus('speaking')
        setVoiceState('speaking')
        setStatusMsg(`SPEAKING · ${spoken.slice(0, 56)}${spoken.length > 56 ? '…' : ''}`)
        // Short anti-echo only — long mute blocked barge-in
        armMute(350)
      }
      lastSpokenRef.current = spoken
      try {
        const ok = await playSpeech(spoken, {
          preferBrowser: true,
          preferBackend: false,
          browserOnly: true,
          browserMaxChars: SPEECH_MAX_CHARS,
          browserChunkSize: SPEECH_CHUNK,
          lang: 'en-US',
          rate: 1.32,
          voiceMatchers: AMERICAN_VOICE_MATCHERS,
        })
        if (!ok) setStatusMsg('SPEECH FAILED — check browser voice')
      } finally {
        speakingRef.current = false
        armMute(keepRef.current ? 650 : 400)
        setVoiceState('idle')
        setWakeStatus(keepRef.current || isArmed() ? 'listening_command' : 'listening_wake')
      }
    },
    [setStatusMsg, setVoiceState, setWakeStatus],
  )

  const handleUtterance = useCallback(
    async (raw) => {
      const text = String(raw || '').trim()
      if (!text) return

      const now = Date.now()
      const norm = normalize(text)
      if (norm && norm === lastHeardRef.current.text && now - lastHeardRef.current.at < 1200) return
      lastHeardRef.current = { text: norm, at: now }

      // Barge-in: cut TTS and continue to handle as a new command
      if (speakingRef.current) {
        if (
          !isBargeIn(text, {
            keepListening: keepRef.current,
            lastSpoken: lastSpokenRef.current,
          })
        ) {
          return
        }
        stopSpeechPlayback()
        speakingRef.current = false
        muteUntilRef.current = 0
        setVoiceState('idle')
        // fall through — process this utterance
      } else if (Date.now() < muteUntilRef.current) {
        // Grace window after TTS — still allow clear barge-style commands
        if (
          !isBargeIn(text, {
            keepListening: keepRef.current,
            lastSpoken: lastSpokenRef.current,
          })
        ) {
          return
        }
        muteUntilRef.current = 0
      }

      if (processingRef.current) return
      if (looksLikeEcho(text, lastSpokenRef.current)) return

      const hasWake = WAKE_RE.test(text)

      if (isNoiseOrIdle(text, { keepListening: keepRef.current, hasWake })) {
        if (keepRef.current || isArmed()) setWakeStatus('listening_command')
        else setWakeStatus('listening_wake')
        return
      }

      if (STOP_RE.test(text)) {
        setKeepListening(false)
        keepRef.current = false
        armedRef.current = false
        armUntilRef.current = 0
        setWakeStatus('listening_wake')
        setStatusMsg('WAKE — SLEEPING UNTIL JARVIS')
        await speak('Okay. Say Jarvis when you need me.')
        return
      }

      if (KEEP_RE.test(text)) {
        setKeepListening(true)
        keepRef.current = true
        armSilent(0)
        setWakeStatus('listening_command')
        setStatusMsg('ALWAYS LISTENING — ASK ANYTHING')
        const after = stripWake(text).replace(KEEP_RE, ' ').replace(/\s+/g, ' ').trim()
        await speak('Always listening.')
        if (!after || isNoiseOrIdle(after, { keepListening: true, hasWake: false })) return

        processingRef.current = true
        setWakeStatus('processing')
        setVoiceState('processing')
        try {
          const speaker = createStreamingSpeaker({
            lang: 'en-US',
            rate: 1.32,
            voiceMatchers: AMERICAN_VOICE_MATCHERS,
            onStart: () => {
              speakingRef.current = true
              setWakeStatus('speaking')
              setVoiceState('speaking')
              armMute(350)
            },
            onEnd: () => {
              speakingRef.current = false
              setVoiceState('idle')
            },
          })
          await sendChat(after, {
            onToken: (delta) => {
              void speaker.push(delta)
            },
          })
          const ok = await speaker.end()
          if (!ok) await speak('Done.')
        } catch {
          await speak('I hit a problem answering that.')
        } finally {
          processingRef.current = false
          setWakeStatus('listening_command')
          setVoiceState('idle')
        }
        return
      }

      // Vision capture — open camera + analyze (before generic chat)
      const captureSource = hasWake ? stripWake(text) : text
      if (CAPTURE_RE.test(captureSource) || CAPTURE_RE.test(text)) {
        processingRef.current = true
        setWakeStatus('processing')
        setVoiceState('processing')
        setStatusMsg('VISION — OPENING CAMERA…')
        try {
          await speak('One moment — opening the camera.')
          const result = await runVoiceVisionCapture(extractCapturePrompt(text))
          if (result?.ok && result.analysis) {
            await speak(result.analysis)
          } else {
            await speak(
              result?.error
                ? `I could not capture that. ${result.error}. Try enabling Gestures or Vision once to grant camera access, then ask again.`
                : 'I could not capture the camera frame. Grant camera access and try again.',
            )
          }
        } catch {
          await speak('Camera capture failed. Grant camera permission and try again.')
        } finally {
          processingRef.current = false
          if (keepRef.current) {
            armedRef.current = true
            armUntilRef.current = 0
            setWakeStatus('listening_command')
            setStatusMsg('ALWAYS LISTENING — ASK ANYTHING')
          } else {
            setWakeStatus(isArmed() ? 'listening_command' : 'listening_wake')
          }
          setVoiceState('idle')
        }
        return
      }

      const remainder = stripWake(text)

      if (hasWake && !remainder) {
        armSilent(ARM_TTL_MS)
        setWakeStatus('listening_command')
        setStatusMsg('WAKE — LISTENING (12s)')
        return
      }

      const shouldAnswer = keepRef.current || isArmed() || (hasWake && remainder.length > 0)
      const question = hasWake ? remainder : text
      if (!shouldAnswer || !question) return
      if (isNoiseOrIdle(question, { keepListening: keepRef.current, hasWake: false })) return

      // UI / system voice commands before free-form chat
      processingRef.current = true
      setWakeStatus('processing')
      setVoiceState('processing')

      const finishListen = () => {
        processingRef.current = false
        if (keepRef.current) {
          armedRef.current = true
          armUntilRef.current = 0
          setWakeStatus('listening_command')
          setStatusMsg('ALWAYS LISTENING — ASK ANYTHING')
        } else {
          setWakeStatus(isArmed() ? 'listening_command' : 'listening_wake')
        }
        setVoiceState('idle')
      }

      try {
        const routed = await routeVoiceCommand(question, () => useJarvisStore.getState())
        if (routed.handled) {
          if (routed.speak) await speak(routed.speak)
          if (routed.streamChat && routed.chat) {
            setStatusMsg(`THINKING → ${routed.chat.slice(0, 36)}…`)
            const speaker = createStreamingSpeaker({
              lang: 'en-US',
              rate: 1.32,
              voiceMatchers: AMERICAN_VOICE_MATCHERS,
              onStart: () => {
                speakingRef.current = true
                setWakeStatus('speaking')
                setVoiceState('speaking')
                armMute(350)
              },
              onEnd: () => {
                speakingRef.current = false
                setVoiceState('idle')
              },
            })
            await sendChat(routed.chat, {
              onToken: (delta) => {
                void speaker.push(delta)
              },
            })
            const ok = await speaker.end()
            if (!ok) await speak('Done.')
          }
          finishListen()
          return
        }
      } catch {
        // fall through to chat
      }

      if (!keepRef.current) {
        armedRef.current = false
        armUntilRef.current = 0
      }
      setStatusMsg(`THINKING → ${question.slice(0, 36)}…`)
      try {
        const speaker = createStreamingSpeaker({
          lang: 'en-US',
          rate: 1.32,
          voiceMatchers: AMERICAN_VOICE_MATCHERS,
          onStart: () => {
            speakingRef.current = true
            setWakeStatus('speaking')
            setVoiceState('speaking')
            setStatusMsg('SPEAKING · live')
            armMute(350)
          },
          onEnd: () => {
            speakingRef.current = false
            setVoiceState('idle')
          },
        })
        await sendChat(question, {
          onToken: (delta) => {
            void speaker.push(delta)
          },
        })
        const ok = await speaker.end()
        if (!ok) await speak('Done.')
      } catch {
        await speak('I hit a problem answering that.')
      } finally {
        finishListen()
      }
    },
    [sendChat, runVoiceVisionCapture, setKeepListening, setStatusMsg, setVoiceState, setWakeStatus, speak],
  )

  handleUtteranceRef.current = handleUtterance

  // Recognition lifecycle — ONLY depends on wakeEnabled (prevents abort storm)
  useEffect(() => {
    if (!wakeEnabled) {
      clearTimeout(restartTimer.current)
      try {
        const rec = recognitionRef.current
        if (rec) {
          rec.onend = null
          rec.onresult = null
          rec.onerror = null
          rec.stop()
        }
      } catch {}
      recognitionRef.current = null
      setWakeStatus('off')
      return undefined
    }

    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) {
      setWakeStatus('unsupported')
      setStatusMsg('WAKE UNSUPPORTED — use Chrome/Edge')
      return undefined
    }

    let cancelled = false
    let recognition = null

    const safeStart = () => {
      if (cancelled || !wakeEnabledRef.current || !recognition) return
      try {
        recognition.start()
      } catch (err) {
        // InvalidStateError = already started — ignore
        const msg = String(err?.message || err || '')
        if (!/already started|InvalidState/i.test(msg)) {
          clearTimeout(restartTimer.current)
          restartTimer.current = setTimeout(safeStart, 350)
        }
      }
    }

    const attach = (rec) => {
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.maxAlternatives = 1

      rec.onstart = () => {
        if (cancelled) return
        setWakeStatus(keepRef.current || armedRef.current ? 'listening_command' : 'listening_wake')
        if (!speakingRef.current && !processingRef.current) setVoiceState('recording')
      }

      rec.onresult = (event) => {
        if (cancelled) return
        let finalText = ''
        let interimText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript || ''
          if (event.results[i].isFinal) finalText += piece
          else interimText += piece
        }
        // Soft barge-in on interim: stop TTS early, wait for final to answer
        if (
          speakingRef.current &&
          isBargeIn(interimText, {
            keepListening: keepRef.current,
            lastSpoken: lastSpokenRef.current,
          })
        ) {
          stopSpeechPlayback()
          speakingRef.current = false
          muteUntilRef.current = 0
          setVoiceState('idle')
        }
        if (finalText.trim()) handleUtteranceRef.current?.(finalText.trim())
      }

      rec.onerror = (e) => {
        const code = e?.error || ''
        if (code === 'not-allowed') {
          setWakeStatus('denied')
          setStatusMsg('MIC DENIED FOR WAKE')
          cancelled = true
          return
        }
        // no-speech / aborted / network → onend restarts
      }

      rec.onend = () => {
        if (cancelled || !wakeEnabledRef.current) return
        clearTimeout(restartTimer.current)
        // Reuse same instance — do NOT rebuild (that caused keep-listening bugs)
        restartTimer.current = setTimeout(safeStart, 180)
      }
    }

    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
        if (cancelled) return

        recognition = new SR()
        attach(recognition)
        recognitionRef.current = recognition
        setStatusMsg(keepRef.current ? 'ALWAYS LISTENING — ASK ANYTHING' : 'WAKE ARMED — SAY JARVIS')
        safeStart()
      } catch {
        setWakeStatus('denied')
        setStatusMsg('MIC DENIED FOR WAKE')
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(restartTimer.current)
      try {
        if (recognition) {
          recognition.onend = null
          recognition.onresult = null
          recognition.onerror = null
          recognition.stop()
        }
      } catch {}
      recognitionRef.current = null
      stopSpeechPlayback()
      setVoiceState('idle')
    }
  }, [wakeEnabled, setStatusMsg, setVoiceState, setWakeStatus])

  return null
}

export default function WakePanel() {
  const wakeEnabled = useJarvisStore((s) => s.wakeEnabled)
  const setWakeEnabled = useJarvisStore((s) => s.setWakeEnabled)
  const keepListening = useJarvisStore((s) => s.keepListening)
  const setKeepListening = useJarvisStore((s) => s.setKeepListening)
  const wakeStatus = useJarvisStore((s) => s.wakeStatus)
  const gestureControlEnabled = useJarvisStore((s) => s.gestureControlEnabled)
  const gesturePreviewVisible = useJarvisStore((s) => s.gesturePreviewVisible)
  const setGesturePreviewVisible = useJarvisStore((s) => s.setGesturePreviewVisible)
  const toggleGestures = useJarvisStore((s) => s.toggleGestures)
  const gestureLatest = useJarvisStore((s) => s.gestureLatest)
  const gestureSession = useJarvisStore((s) => s.gestureSession)
  const startGestureSession = useJarvisStore((s) => s.startGestureSession)
  const stopGestureSession = useJarvisStore((s) => s.stopGestureSession)

  const statusColor =
    wakeStatus === 'listening_command' || wakeStatus === 'listening_wake'
      ? 'var(--cyan)'
      : wakeStatus === 'speaking'
        ? 'var(--green)'
        : wakeStatus === 'processing'
          ? 'var(--gold)'
          : wakeStatus === 'denied' || wakeStatus === 'unsupported'
            ? 'var(--red)'
            : 'var(--text-dim)'

  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0 }}>
      <div className="section-header">WAKE WORD + HAND CONTROL</div>

      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          color: statusColor,
          letterSpacing: '0.12em',
        }}
      >
        {String(wakeStatus || 'off').replace(/_/g, ' ').toUpperCase()}
      </div>

      <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Say <strong style={{ color: 'var(--cyan)' }}>Jarvis</strong> to arm for ~12s. Say{' '}
        <strong style={{ color: 'var(--amber)' }}>Jarvis always listening</strong> for continuous Q&amp;A. Say{' '}
        <strong style={{ color: 'var(--cyan)' }}>capture what I&apos;m seeing</strong> to open the camera and describe
        the frame. Talk over him to interrupt.
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-gold"
          style={{ fontSize: 13, padding: '10px 14px' }}
          onClick={() => setWakeEnabled(!wakeEnabled)}
        >
          {wakeEnabled ? 'DISABLE WAKE' : 'ENABLE WAKE (REQUESTS MIC)'}
        </button>
        <button
          type="button"
          className="btn"
          style={{
            fontSize: 13,
            padding: '10px 14px',
            borderColor: keepListening ? 'var(--amber)' : undefined,
            color: keepListening ? 'var(--amber)' : undefined,
          }}
          onClick={() => setKeepListening(!keepListening)}
          disabled={!wakeEnabled}
        >
          {keepListening ? 'ALWAYS LISTENING ON' : 'ALWAYS LISTENING OFF'}
        </button>
      </div>

      <div style={{ height: 1, background: 'rgba(0,200,255,0.1)' }} />

      <div className="section-header">HAND GESTURES → GRAPH</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        1 fist + move = rotate · 1 palm hold = reset · 2 palms apart = zoom · 2 fists = spin · point = select
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-gold"
          style={{ fontSize: 13, padding: '10px 14px' }}
          onClick={() => {
            void toggleGestures()
          }}
        >
          {gestureControlEnabled ? 'DISABLE GESTURES' : 'ENABLE GESTURES (REQUESTS CAMERA)'}
        </button>
        <button
          type="button"
          className="btn"
          style={{
            fontSize: 13,
            padding: '10px 14px',
            borderColor: gesturePreviewVisible ? 'var(--cyan)' : undefined,
            color: gesturePreviewVisible ? 'var(--cyan)' : undefined,
          }}
          onClick={() => setGesturePreviewVisible(!gesturePreviewVisible)}
          disabled={!gestureControlEnabled}
        >
          {gesturePreviewVisible ? 'HIDE HAND CAM' : 'SHOW HAND CAM'}
        </button>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 13, padding: '10px 14px' }}
          onClick={async () => {
            if (gestureSession?.running && gestureSession?.source !== 'browser') await stopGestureSession()
            else await startGestureSession()
          }}
        >
          {gestureSession?.running && gestureSession?.source !== 'browser' ? 'STOP OPENCV SCRIPT' : 'START OPENCV SCRIPT'}
        </button>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
        Gestures: {gestureControlEnabled ? 'ON' : 'OFF'} · {gestureLatest?.gesture || 'none'} · {gestureLatest?.message || '—'}
        <br />
        Session: {gestureSession?.running ? gestureSession?.source || 'running' : 'idle'}
        <br />
        API: {resolveApiBase()}/gestures
      </div>
    </div>
  )
}
