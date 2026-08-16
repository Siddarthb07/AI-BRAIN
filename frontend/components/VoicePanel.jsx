'use client'
import { useState, useRef, useEffect } from 'react'
import { useJarvisStore } from '../app/store'
import { AMERICAN_VOICE_MATCHERS, DEFAULT_SPEECH_CHUNK_CHARS, DEFAULT_SPEECH_MAX_CHARS, createStreamingSpeaker, speakText as playSpeech, stopSpeechPlayback } from '../lib/speech'
import { resolveApiBase } from '../lib/api'
import { routeVoiceCommand, VOICE_COMMAND_HELP } from '../lib/voiceCommands'
import ArcReactor from './jarvis/ArcReactor'

const api = () => resolveApiBase()
const STATES = { idle: 'idle', recording: 'recording', processing: 'processing', speaking: 'speaking' }

export default function VoicePanel() {
  const [state, setState] = useState(STATES.idle)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')
  const [useBackend, setUseBackend] = useState(false)
  const [waveHeights, setWaveHeights] = useState([0.3, 0.5, 0.7, 0.4, 0.6, 0.3, 0.8, 0.5, 0.4, 0.6])

  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const animRef = useRef(null)
  const recognitionRef = useRef(null)
  const stateRef = useRef(STATES.idle)

  const sendChat = useJarvisStore(s => s.sendChat)
  const setVoiceState = useJarvisStore(s => s.setVoiceState)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Animate wave bars when recording
  useEffect(() => {
    if (state === STATES.recording) {
      animRef.current = setInterval(() => {
        setWaveHeights(prev => prev.map(() => 0.2 + Math.random() * 0.8))
      }, 120)
    } else {
      clearInterval(animRef.current)
      setWaveHeights([0.3, 0.5, 0.3, 0.4, 0.6, 0.3, 0.4, 0.5, 0.3, 0.4])
    }
    return () => clearInterval(animRef.current)
  }, [state])

  const startWhisperCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setState(STATES.processing)
        const form = new FormData()
        form.append('file', blob, 'audio.webm')
        try {
          const res = await fetch(`${api()}/voice/input`, { method: 'POST', body: form })
          if (!res.ok) throw new Error(`STT HTTP ${res.status}`)
          const data = await res.json()
          const text = data.text || ''
          if (text) {
            setTranscript(text)
            await processText(text)
          } else {
            setError('No speech detected. Please try again.')
            setState(STATES.idle)
          }
        } catch (e) {
          setError(`Voice backend error (${API}). Is JARVIS API on :8002 running?`)
          setState(STATES.idle)
        }
      }
      mediaRef.current = recorder
      recorder.start()
      setState(STATES.recording)
      setVoiceState('recording')
    } catch (e) {
      setError('Microphone access denied. Please allow microphone access.')
      setState(STATES.idle)
    }
  }

  const startRecording = async () => {
    setError('')
    setTranscript('')
    setResponse('')

    // Browser Web Speech — often fails with "network" without Google STT; fall back to Whisper
    if (!useBackend && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SR()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognitionRef.current = recognition

      recognition.onstart = () => {
        setState(STATES.recording)
        setVoiceState('recording')
      }
      recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript
        setTranscript(text)
        setState(STATES.processing)
        await processText(text)
      }
      recognition.onerror = async (e) => {
        const code = e?.error || 'unknown'
        if (code === 'network' || code === 'service-not-allowed' || code === 'not-allowed') {
          setError('Browser STT unavailable — using Whisper backend…')
          setUseBackend(true)
          await startWhisperCapture()
          return
        }
        setError(`Speech recognition error: ${code}`)
        setState(STATES.idle)
        setVoiceState('idle')
      }
      recognition.onend = () => {
        setState((current) => (current === STATES.recording ? STATES.idle : current))
      }
      try {
        recognition.start()
        return
      } catch {
        await startWhisperCapture()
        return
      }
    }

    await startWhisperCapture()
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      mediaRef.current.stop()
    }
    setState(STATES.processing)
  }

  // Spacebar PTT when Voice panel is mounted
  useEffect(() => {
    const down = (e) => {
      if (e.code !== 'Space' || e.repeat) return
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      e.preventDefault()
      if (stateRef.current === STATES.idle) startRecording()
    }
    const up = (e) => {
      if (e.code !== 'Space') return
      if (stateRef.current === STATES.recording) stopRecording()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBackend])

  const processText = async (text) => {
    setState(STATES.processing)
    setVoiceState('processing')

    // UI commands first (same router as wake)
    try {
      const routed = await routeVoiceCommand(text, () => useJarvisStore.getState())
      if (routed.handled) {
        if (routed.speak) {
          setState(STATES.speaking)
          setVoiceState('speaking')
          setResponse(routed.speak)
          await playSpeech(routed.speak, {
            preferBrowser: true,
            preferBackend: false,
            browserOnly: true,
            lang: 'en-US',
            rate: 1.32,
            voiceMatchers: AMERICAN_VOICE_MATCHERS,
          })
        }
        if (routed.streamChat && routed.chat) {
          const speaker = createStreamingSpeaker({
            lang: 'en-US',
            rate: 1.32,
            pitch: 1,
            voiceMatchers: AMERICAN_VOICE_MATCHERS,
            onStart: () => {
              setState(STATES.speaking)
              setVoiceState('speaking')
            },
            onEnd: () => {
              setState(STATES.idle)
              setVoiceState('idle')
            },
          })
          const jarvisResponse = await sendChat(routed.chat, {
            onToken: (delta) => {
              void speaker.push(delta)
            },
          })
          setResponse(jarvisResponse)
          const started = await speaker.end()
          if (!started) await speakResponse(jarvisResponse)
          return
        }
        setState(STATES.idle)
        setVoiceState('idle')
        return
      }
    } catch {
      // fall through
    }

    if (/\b(help|what can (?:i|you) say|voice commands)\b/i.test(text)) {
      setResponse(VOICE_COMMAND_HELP)
      setState(STATES.speaking)
      setVoiceState('speaking')
      await playSpeech(VOICE_COMMAND_HELP, {
        preferBrowser: true,
        browserOnly: true,
        lang: 'en-US',
        rate: 1.32,
        voiceMatchers: AMERICAN_VOICE_MATCHERS,
      })
      setState(STATES.idle)
      setVoiceState('idle')
      return
    }

    // Live word-by-word speak while the LLM streams (browser TTS — lowest latency)
    const speaker = createStreamingSpeaker({
      lang: 'en-US',
      rate: 1.32,
      pitch: 1,
      voiceMatchers: AMERICAN_VOICE_MATCHERS,
      onStart: () => {
        setState(STATES.speaking)
        setVoiceState('speaking')
      },
      onEnd: () => {
        setState(STATES.idle)
        setVoiceState('idle')
      },
    })

    let jarvisResponse = ''
    try {
      jarvisResponse = await sendChat(text, {
        onToken: (delta) => {
          void speaker.push(delta)
        },
      })
      setResponse(jarvisResponse)
    } catch (e) {
      speaker.cancel()
      setError(String(e.message || e).slice(0, 80))
      setState(STATES.idle)
      setVoiceState('idle')
      return
    }

    const started = await speaker.end()
    if (!started) {
      // Fallback: full utterance if streaming produced nothing
      setState(STATES.speaking)
      setVoiceState('speaking')
      await speakResponse(jarvisResponse)
    }
  }

  const speakResponse = async (text) => {
    if (!text) { setState(STATES.idle); return }
    const started = await playSpeech(text, {
      preferBrowser: true,
      preferBackend: useBackend,
      backendMaxChars: DEFAULT_SPEECH_MAX_CHARS,
      browserMaxChars: DEFAULT_SPEECH_MAX_CHARS,
      browserChunkSize: DEFAULT_SPEECH_CHUNK_CHARS,
      lang: 'en-US',
      rate: 1.32,
      pitch: 1,
      volume: 1,
      voiceMatchers: AMERICAN_VOICE_MATCHERS,
      onEnd: () => { setState(STATES.idle); setVoiceState('idle') },
    })

    if (!started) {
      setState(STATES.idle)
      setVoiceState('idle')
    }
  }

  const readEverythingNow = async () => {
    try {
      const res = await fetch(`${api()}/brief/voice`)
      const data = await res.json()
      const text = data.text || 'JARVIS briefing system offline.'
      setResponse(text)
      setState(STATES.speaking)
      setVoiceState('speaking')
      await speakResponse(text)
    } catch {
      const fallback = 'JARVIS online. No briefing available. Focus on shipping your top priority task today.'
      setResponse(fallback)
      setState(STATES.speaking)
      setVoiceState('speaking')
      await speakResponse(fallback)
    }
  }

  const stopSpeaking = () => {
    stopSpeechPlayback()
    setState(STATES.idle)
    setVoiceState('idle')
  }

  const stateConfig = {
    idle:       { color: 'var(--cyan)',  label: 'READY', btnLabel: '⏺ HOLD TO SPEAK',   action: startRecording },
    recording:  { color: 'var(--red)',   label: 'LISTENING', btnLabel: '⏹ STOP',       action: stopRecording },
    processing: { color: 'var(--gold)',  label: 'PROCESSING', btnLabel: '● THINKING',  action: null },
    speaking:   { color: 'var(--green)', label: 'SPEAKING', btnLabel: '⏹ STOP',        action: stopSpeaking },
  }

  const cfg = stateConfig[state]

  return (
    <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', height: '100%', gap: '18px' }}>
      {/* Status indicator */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: '8px' }}>
          VOICE INTERFACE
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          color: cfg.color,
          letterSpacing: '0.15em',
          textShadow: `0 0 10px ${cfg.color}`,
          marginBottom: '20px',
        }}>
          ◈ {cfg.label}
        </div>

        {/* Wave visualizer — framed by a rotating holo ring while active */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', height: '96px', marginBottom: '20px' }}>
          {state !== STATES.idle ? (
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', opacity: 0.7 }}>
              <ArcReactor size={96} core={false} />
            </div>
          ) : null}
          {waveHeights.map((h, i) => (
            <div key={i} style={{
              width: '4px',
              height: `${h * 50}px`,
              background: cfg.color,
              borderRadius: '2px',
              transition: state === STATES.recording ? 'none' : 'height 0.4s ease',
              opacity: state === STATES.idle ? 0.3 : 0.9,
              boxShadow: state !== STATES.idle ? `0 0 10px ${cfg.color}` : 'none',
            }} />
          ))}
        </div>

        {/* Main action button — hold-to-speak (mouse + Space) */}
        <button
          className="btn"
          onMouseDown={(e) => {
            e.preventDefault()
            if (state === STATES.idle) startRecording()
          }}
          onMouseUp={() => {
            if (state === STATES.recording) stopRecording()
          }}
          onMouseLeave={() => {
            if (state === STATES.recording) stopRecording()
          }}
          onTouchStart={(e) => {
            e.preventDefault()
            if (state === STATES.idle) startRecording()
          }}
          onTouchEnd={() => {
            if (state === STATES.recording) stopRecording()
          }}
          onClick={() => {
            if (state === STATES.speaking) stopSpeaking()
          }}
          disabled={state === STATES.processing}
          style={{
            fontSize: '13px',
            padding: '12px 28px',
            borderColor: cfg.color,
            color: cfg.color,
            background: `${cfg.color}10`,
            boxShadow: state !== STATES.idle ? `0 0 15px ${cfg.color}40` : 'none',
            minWidth: '180px',
            letterSpacing: '0.1em',
          }}
        >
          {cfg.btnLabel}
        </button>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 10 }}>
          Hold button or Space · release to send · reply speaks word-by-word as it streams
        </div>
      </div>

      {/* Transcript */}
      {transcript && (
        <div>
          <div className="section-header">▸ TRANSCRIPT</div>
          <div style={{
            background: 'rgba(0,200,255,0.04)',
            border: '1px solid rgba(0,200,255,0.1)',
            borderRadius: '4px',
            padding: '10px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--cyan)',
            lineHeight: 1.6,
          }}>
            "{transcript}"
          </div>
        </div>
      )}

      {/* Response */}
      {response && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header">▸ JARVIS RESPONSE</div>
          <div className="scroll-area" style={{
            flex: 1,
            background: 'rgba(0,217,255,0.03)',
            border: '1px solid rgba(0,217,255,0.14)',
            borderRadius: '2px',
            padding: '10px 12px',
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            color: 'var(--text-primary)',
            lineHeight: 1.7,
          }}>
            {response}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(255,56,96,0.05)',
          border: '1px solid rgba(255,56,96,0.2)',
          borderRadius: '4px',
          padding: '8px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--red)',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="btn btn-gold" onClick={readEverythingNow} style={{ flex: 1 }}>
          ▶ READ BRIEF NOW
        </button>
        <button
          className="btn"
          onClick={() => setUseBackend(!useBackend)}
          style={{ fontSize: '10px', opacity: 0.7 }}
        >
          TTS: {useBackend ? 'BACKEND' : 'NATURAL'}
        </button>
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        color: 'var(--text-dim)',
        lineHeight: 1.7,
        borderTop: '1px solid rgba(0,200,255,0.06)',
        paddingTop: '10px',
      }}>
        STT: Browser Web Speech API → Whisper fallback<br />
          TTS: Coqui/pyttsx3 backend (slow) · live replies use browser word-stream<br />
        All processing local-first
      </div>
    </div>
  )
}
