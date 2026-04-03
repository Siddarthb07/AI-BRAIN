'use client'
import { useState, useRef, useEffect } from 'react'
import { useJarvisStore } from '../app/store'
import { AMERICAN_VOICE_MATCHERS, speakText as playSpeech, stopSpeechPlayback } from '../lib/speech'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
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

  const sendChat = useJarvisStore(s => s.sendChat)
  const setVoiceState = useJarvisStore(s => s.setVoiceState)

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

  const startRecording = async () => {
    setError('')
    setTranscript('')
    setResponse('')

    // Try browser Web Speech API first (always available)
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SR()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognitionRef.current = recognition

      recognition.onstart = () => setState(STATES.recording)
      recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript
        setTranscript(text)
        setState(STATES.processing)
        await processText(text)
      }
      recognition.onerror = (e) => {
        setError(`Speech recognition error: ${e.error}`)
        setState(STATES.idle)
      }
      recognition.onend = () => {
        setState((current) => current === STATES.recording ? STATES.idle : current)
      }
      recognition.start()
      return
    }

    // Fallback: MediaRecorder → Whisper backend
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setState(STATES.processing)
        // Send to Whisper backend
        const form = new FormData()
        form.append('file', blob, 'audio.webm')
        try {
          const res = await fetch(`${API}/voice/input`, { method: 'POST', body: form })
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
          setError('Backend STT failed. Check that backend is running.')
          setState(STATES.idle)
        }
      }
      mediaRef.current = recorder
      recorder.start()
      setState(STATES.recording)
    } catch (e) {
      setError('Microphone access denied. Please allow microphone access.')
      setState(STATES.idle)
    }
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

  const processText = async (text) => {
    setState(STATES.processing)
    const jarvisResponse = await sendChat(text)
    setResponse(jarvisResponse)
    setState(STATES.speaking)
    setVoiceState('speaking')
    await speakResponse(jarvisResponse)
  }

  const speakResponse = async (text) => {
    if (!text) { setState(STATES.idle); return }
    const started = await playSpeech(text, {
      preferBrowser: !useBackend,
      preferBackend: useBackend,
      backendMaxChars: 500,
      browserMaxChars: 400,
      lang: 'en-US',
      rate: 0.98,
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
      const res = await fetch(`${API}/brief/voice`)
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

        {/* Wave visualizer */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', height: '50px', marginBottom: '20px' }}>
          {waveHeights.map((h, i) => (
            <div key={i} style={{
              width: '4px',
              height: `${h * 50}px`,
              background: cfg.color,
              borderRadius: '2px',
              transition: state === STATES.recording ? 'none' : 'height 0.4s ease',
              opacity: state === STATES.idle ? 0.3 : 0.9,
              boxShadow: state !== STATES.idle ? `0 0 6px ${cfg.color}` : 'none',
            }} />
          ))}
        </div>

        {/* Main action button */}
        <button
          className="btn"
          onClick={cfg.action || undefined}
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
            background: 'rgba(0,255,159,0.03)',
            border: '1px solid rgba(0,255,159,0.1)',
            borderRadius: '4px',
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
        TTS: Coqui/pyttsx3 backend → Browser SpeechSynthesis<br />
        All processing local-first
      </div>
    </div>
  )
}
