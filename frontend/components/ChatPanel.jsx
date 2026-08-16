'use client'
import { useState, useRef, useEffect } from 'react'
import { useJarvisStore } from '../app/store'
import { AMERICAN_VOICE_MATCHERS, createStreamingSpeaker } from '../lib/speech'
import { formatIstTime } from '../lib/time'
import { resolveApiBase } from '../lib/api'

const QUICK_PROMPTS = [
  'What should I focus on today?',
  'Research Fourier neural operators and generate a report',
  'Search the web for latest open-source text-to-SQL benchmarks',
  'Summarize my GitHub projects',
  'Build me a website for a coastal linen shop',
]

const CODING_ACTION_HINTS = [
  'add',
  'build',
  'change',
  'create',
  'debug',
  'edit',
  'fix',
  'generate',
  'implement',
  'patch',
  'refactor',
  'remove',
  'rename',
  'rewrite',
  'update',
  'write',
]

const CODING_SUBJECT_HINTS = [
  'api',
  'bug',
  'class',
  'code',
  'component',
  'config',
  'css',
  'docker',
  'docker compose',
  'endpoint',
  'error',
  'fastapi',
  'file',
  'function',
  'html',
  'javascript',
  'json',
  'module',
  'next.js',
  'nextjs',
  'python',
  'react',
  'refactor',
  'regex',
  'script',
  'sql',
  'stack trace',
  'test',
  'typescript',
  'yaml',
]

const STRONG_CODING_REQUEST_PATTERNS = [
  /\bcode review\b/i,
  /\bstack trace\b/i,
  /\b(debug|refactor)\b/i,
  /\b(write|edit|update|change)\b.+\b(code|file|component|function|module|config|test)\b/i,
  /\b(add|build|create|implement|patch|remove)\b.+\b(api|component|endpoint|function|module|script|test)\b/i,
  /\b[\w./-]+\.(js|jsx|ts|tsx|py|json|ya?ml|css|html|sh|sql|md)\b/i,
]

const STRONG_CODE_RESPONSE_PATTERNS = [
  /```/,
  /(^|\n)\s*(import|export|from|const|let|var|def|class|function|interface|type)\b/m,
  /(^|\n)\s*(npm|pnpm|yarn|pip|python|node|git|docker|docker compose)\b/m,
]

const FILE_REFERENCE_PATTERN = /\b[\w./-]+\.(js|jsx|ts|tsx|py|json|ya?ml|css|html|sh|sql|md)\b/gi
const CODE_DOWNLOAD_MIN_LENGTH = 1800
const CODE_DOWNLOAD_MIN_LINES = 55

function promptLooksCoding(prompt = '') {
  const normalizedPrompt = prompt.toLowerCase()
  const hasCodingAction = CODING_ACTION_HINTS.some((hint) => normalizedPrompt.includes(hint))
  const hasCodingSubject = CODING_SUBJECT_HINTS.some((hint) => normalizedPrompt.includes(hint))

  return (
    STRONG_CODING_REQUEST_PATTERNS.some((pattern) => pattern.test(prompt)) ||
    (hasCodingAction && hasCodingSubject)
  )
}

function responseLooksCoding(response = '') {
  if ((response.match(/`[^`]+`/g) || []).length >= 3) return true
  if (STRONG_CODE_RESPONSE_PATTERNS.some((pattern) => pattern.test(response))) return true

  return (response.match(FILE_REFERENCE_PATTERN) || []).length >= 2
}

function shouldSkipAutoSpeak(prompt = '', response = '') {
  return promptLooksCoding(prompt) || responseLooksCoding(response)
}

function extractFileReferences(text = '') {
  return [...new Set(text.match(FILE_REFERENCE_PATTERN) || [])].slice(0, 5)
}

function shouldOfferDownload(text = '') {
  if (!responseLooksCoding(text)) return false

  const lineCount = text.split(/\r?\n/).length
  const fileRefs = extractFileReferences(text)
  const fenceMarkers = (text.match(/```/g) || []).length

  return (
    text.length >= CODE_DOWNLOAD_MIN_LENGTH ||
    lineCount >= CODE_DOWNLOAD_MIN_LINES ||
    fileRefs.length >= 3 ||
    fenceMarkers >= 4 ||
    (fenceMarkers >= 2 && text.length >= 1200)
  )
}

function createCompactPreview(text = '') {
  const fileRefs = extractFileReferences(text)
  const narrative = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (narrative) {
    const preview = narrative.length > 240 ? `${narrative.slice(0, 240).trimEnd()}...` : narrative
    return fileRefs.length > 0 ? `${preview} Files: ${fileRefs.join(', ')}` : preview
  }

  if (fileRefs.length > 0) {
    return `Large generated code output hidden for readability. Files detected: ${fileRefs.join(', ')}.`
  }

  return 'Large generated code output hidden for readability. Download the full response to inspect every file and snippet.'
}

function createDownloadFilename(ts) {
  const stamp = new Date(ts || Date.now()).toISOString().replace(/[:.]/g, '-')
  return `jarvis-generated-output-${stamp}.md`
}

function downloadChatContent(content, ts) {
  if (typeof window === 'undefined' || !content) return

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = createDownloadFilename(ts)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function ChatBubble({ msg, onSave }) {
  const isUser = msg.role === 'user'
  const time = formatIstTime(msg.ts)
  const saveToVault = useJarvisStore((s) => s.saveToVault)
  const confirmAction = useJarvisStore((s) => s.confirmAction)
  const [showInline, setShowInline] = useState(false)
  const downloadable = !isUser && shouldOfferDownload(msg.content)
  const preview = downloadable ? createCompactPreview(msg.content) : ''
  const fileRefs = downloadable ? extractFileReferences(msg.content) : []
  const lineCount = downloadable ? msg.content.split(/\r?\n/).length : 0
  const sizeKb = downloadable ? Math.max(1, Math.round(msg.content.length / 1024)) : 0

  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: isUser ? 'var(--text-dim)' : 'var(--cyan)',
          textShadow: isUser ? 'none' : '0 0 6px rgba(0,217,255,0.35)',
          marginBottom: '5px',
          letterSpacing: '0.16em',
        }}
      >
        {isUser ? 'USR' : 'J.A.R.V.I.S.'} :: {time}
      </div>

      <div
        style={{
          maxWidth: '96%',
          padding: '12px 16px',
          background: isUser
            ? 'linear-gradient(180deg, rgba(0, 217, 255, 0.1), rgba(0, 217, 255, 0.04))'
            : 'linear-gradient(180deg, rgba(2, 20, 36, 0.7), rgba(2, 12, 24, 0.6))',
          border: isUser ? '1px solid rgba(0, 217, 255, 0.3)' : '1px solid rgba(0, 217, 255, 0.14)',
          boxShadow: isUser ? '0 0 12px rgba(0, 217, 255, 0.08)' : 'inset 0 0 18px rgba(0, 217, 255, 0.03)',
          clipPath: isUser
            ? 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)'
            : 'polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)',
          fontFamily: 'var(--font-mono)',
          fontSize: isUser ? '13px' : '14px',
          color: isUser ? 'var(--cyan)' : 'var(--text-primary)',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {downloadable && !showInline ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>{preview}</div>

            {fileRefs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {fileRefs.map((file) => (
                  <span key={file} className="tag">
                    {file}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-gold" onClick={() => downloadChatContent(msg.content, msg.ts)}>
                DOWNLOAD FULL OUTPUT
              </button>
              <button className="btn" onClick={() => setShowInline(true)}>
                SHOW INLINE
              </button>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
                lineHeight: 1.6,
              }}
            >
              {lineCount} lines | {sizeKb} KB | large code output hidden for readability
            </div>
          </div>
        ) : downloadable ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="scroll-area" style={{ maxHeight: '320px', overflowX: 'auto' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-gold" onClick={() => downloadChatContent(msg.content, msg.ts)}>
                DOWNLOAD FULL OUTPUT
              </button>
              <button className="btn" onClick={() => setShowInline(false)}>
                HIDE INLINE
              </button>
            </div>
          </div>
        ) : (
          msg.content
        )}
        {!isUser && msg.citations?.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {msg.citations.map((c) => (
              <span key={c.id} className="tag" title={c.snippet}>
                [{c.id}] {c.path}
              </span>
            ))}
          </div>
        )}
        {!isUser && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-gold" style={{ fontSize: '10px' }} onClick={() => saveToVault(msg.content, 'JARVIS reply')}>
              SAVE TO VAULT
            </button>
            {(msg.actions || []).map((a) => (
              <button key={a.id} type="button" className="btn" style={{ fontSize: '10px' }} onClick={() => confirmAction(a.id)}>
                {a.label}
              </button>
            ))}
            {msg.demo?.id ? (
              <>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '10px' }}
                  onClick={() => useJarvisStore.getState().openDemo(msg.demo.id)}
                >
                  OPEN PREVIEW
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '10px' }}
                  onClick={() => useJarvisStore.getState().openDemo(msg.demo.id)}
                >
                  EDIT
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '10px' }}
                  onClick={async () => {
                    useJarvisStore.getState().openDemo(msg.demo.id)
                    try {
                      const base = resolveApiBase()
                      const res = await fetch(`${base}/demos/${msg.demo.id}/publish`, { method: 'POST' })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.detail || 'publish failed')
                      useJarvisStore.getState().setStatusMsg(`PUBLIC — ${data.public_url}`)
                    } catch (e) {
                      useJarvisStore.getState().setStatusMsg(`PUBLISH FAILED — ${String(e.message || e).slice(0, 40)}`)
                    }
                  }}
                >
                  PUBLISH
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
      <div className="decode-text" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--cyan)', letterSpacing: '0.2em', textShadow: '0 0 6px rgba(0,217,255,0.4)' }}>
        PROCESSING
      </div>
      <div style={{ display: 'flex', gap: '3px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="voice-bar"
            style={{
              height: '12px',
              background: 'var(--cyan)',
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const chatHistory = useJarvisStore((s) => s.chatHistory)
  const sendChat = useJarvisStore((s) => s.sendChat)
  const dossier = useJarvisStore((s) => s.dossier)
  const setShellMode = useJarvisStore((s) => s.setShellMode)
  const setActivePanel = useJarvisStore((s) => s.setActivePanel)
  const setLayoutMode = useJarvisStore((s) => s.setLayoutMode)
  const setVoiceState = useJarvisStore((s) => s.setVoiceState)
  const scrollRef = useRef()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, thinking])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || thinking) return

    setInput('')
    setThinking(true)

    // Skip live TTS for coding prompts; otherwise speak each word as tokens arrive
    const liveSpeak = !promptLooksCoding(msg)
    let speaker = null
    if (liveSpeak) {
      speaker = createStreamingSpeaker({
        preferBrowser: true,
        lang: 'en-US',
        rate: 1.32,
        pitch: 1,
        voiceMatchers: AMERICAN_VOICE_MATCHERS,
        onStart: () => setVoiceState('speaking'),
        onEnd: () => setVoiceState('idle'),
      })
    }

    let response = ''
    try {
      response = await sendChat(msg, {
        onToken: liveSpeak
          ? (delta) => {
              void speaker?.push(delta)
            }
          : undefined,
      })
    } finally {
      setThinking(false)
    }

    if (!liveSpeak) return

    if (shouldSkipAutoSpeak(msg, response)) {
      speaker?.cancel()
      setVoiceState('idle')
      return
    }

    const started = await speaker?.end()
    if (!started) setVoiceState('idle')
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 16px 0', borderBottom: '1px solid rgba(0,200,255,0.06)', paddingBottom: '12px' }}>
        <div className="section-header" style={{ marginBottom: '10px' }}>
          QUICK QUERIES
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {QUICK_PROMPTS.map((prompt, index) => (
            <button
              key={index}
              className="btn"
              style={{ fontSize: '10px', padding: '5px 10px', opacity: 0.86 }}
              onClick={() => setInput(prompt)}
            >
              {prompt.slice(0, 24)}...
            </button>
          ))}
        </div>
      </div>

      {dossier?.topic ? (
        <button
          type="button"
          className="dossier-strip"
          onClick={() => {
            setShellMode('lab')
            setLayoutMode('lab')
            setActivePanel('intel')
          }}
        >
          DOSSIER READY · {dossier.topic} · OPEN INTEL
        </button>
      ) : null}

      <div ref={scrollRef} className="scroll-area" style={{ flex: 1, padding: '18px', minHeight: 0 }}>
        {chatHistory.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 24px',
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              color: 'var(--text-dim)',
              lineHeight: 1.7,
            }}
          >
            <div className="left-panel-title" style={{ marginBottom: 10 }}>
              Chat
            </div>
            Ask anything — context and vault RAG are active when available.
          </div>
        )}

        {chatHistory.map((msg, index) => (
          <ChatBubble key={index} msg={msg} />
        ))}
        {thinking && <ThinkingIndicator />}
      </div>

      <div style={{ padding: '16px 18px', borderTop: '1px solid rgba(0,217,255,0.14)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            className="input-cyber"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message JARVIS…"
            rows={3}
            style={{ resize: 'none', flex: 1, fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.5 }}
          />
          <button
            className="btn"
            onClick={handleSend}
            disabled={thinking || !input.trim()}
            style={{ padding: '10px 16px', height: '64px', opacity: thinking ? 0.5 : 1, fontSize: 13 }}
          >
            Send
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.55 }}>
          Enter to send · Shift+Enter for newline · reply streams aloud when enabled
        </div>
      </div>
    </div>
  )
}
