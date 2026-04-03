'use client'
import { useState, useRef, useEffect } from 'react'
import { useJarvisStore } from '../app/store'
import { AMERICAN_VOICE_MATCHERS, speakText as playSpeech } from '../lib/speech'
import { formatIstTime } from '../lib/time'

const QUICK_PROMPTS = [
  'What should I focus on today?',
  'Summarize my GitHub projects',
  "What's trending in AI today?",
  'How can I improve LexProbe?',
  'Give me a code review checklist',
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

function ChatBubble({ msg }) {
  const isUser = msg.role === 'user'
  const time = formatIstTime(msg.ts)
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
          color: 'var(--text-dim)',
          marginBottom: '5px',
          letterSpacing: '0.1em',
        }}
      >
        {isUser ? 'YOU' : 'JARVIS'} | {time}
      </div>

      <div
        style={{
          maxWidth: '96%',
          padding: '12px 16px',
          borderRadius: isUser ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
          background: isUser ? 'rgba(0, 200, 255, 0.08)' : 'rgba(0, 255, 159, 0.04)',
          border: isUser ? '1px solid rgba(0, 200, 255, 0.2)' : '1px solid rgba(0, 255, 159, 0.15)',
          fontFamily: isUser ? 'var(--font-mono)' : 'var(--font-body)',
          fontSize: isUser ? '13px' : '15px',
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
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
        JARVIS PROCESSING
      </div>
      <div style={{ display: 'flex', gap: '3px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="voice-bar"
            style={{
              height: '12px',
              background: 'var(--green)',
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
    const response = await sendChat(msg)
    setThinking(false)

    if (shouldSkipAutoSpeak(msg, response)) return
    speakResponse(response)
  }

  const speakResponse = async (text) => {
    if (!text) return

    setVoiceState('speaking')
    const started = await playSpeech(text, {
      preferBrowser: true,
      preferBackend: true,
      backendMaxChars: 400,
      browserMaxChars: 240,
      browserChunkSize: 200,
      lang: 'en-US',
      rate: 0.98,
      pitch: 1,
      voiceMatchers: AMERICAN_VOICE_MATCHERS,
      onEnd: () => setVoiceState('idle'),
    })

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

      <div ref={scrollRef} className="scroll-area" style={{ flex: 1, padding: '16px', minHeight: 0 }}>
        {chatHistory.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '34px 22px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-dim)',
              lineHeight: 2,
            }}
          >
            <div style={{ fontSize: '22px', marginBottom: '12px' }}>[ ]</div>
            JARVIS AWAITING INPUT
            <br />
            <span style={{ fontSize: '10px', opacity: 0.65 }}>context and rag active</span>
          </div>
        )}

        {chatHistory.map((msg, index) => (
          <ChatBubble key={index} msg={msg} />
        ))}
        {thinking && <ThinkingIndicator />}
      </div>

      <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(0,200,255,0.08)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            className="input-cyber"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Query JARVIS..."
            rows={3}
            style={{ resize: 'none', flex: 1, fontSize: '14px', lineHeight: 1.55 }}
          />
          <button
            className="btn"
            onClick={handleSend}
            disabled={thinking || !input.trim()}
            style={{ padding: '10px 16px', height: '64px', opacity: thinking ? 0.5 : 1 }}
          >
            SEND
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', marginTop: '7px', lineHeight: 1.6 }}>
          ENTER to send | SHIFT+ENTER for newline | auto-speak for general chat only | large code outputs can be downloaded
        </div>
      </div>
    </div>
  )
}
