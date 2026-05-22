'use client'
import { useState, useRef, useCallback } from 'react'
import { useJarvisStore } from '../app/store'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }, [onFiles])

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--cyan)' : 'rgba(0,200,255,0.2)'}`,
        borderRadius: '6px',
        padding: '20px 16px',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'rgba(0,200,255,0.07)' : 'rgba(0,200,255,0.02)',
        transition: 'all 0.2s',
        boxShadow: dragging ? 'var(--glow-sm)' : 'none',
      }}
    >
      <div style={{ fontSize: '22px', marginBottom: '8px', color: dragging ? 'var(--cyan)' : 'rgba(0,200,255,0.4)' }}>
        ⬆
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: dragging ? 'var(--cyan)' : 'var(--text-dim)', letterSpacing: '0.1em' }}>
        {dragging ? 'DROP TO INGEST' : 'DRAG FILES HERE OR CLICK'}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)', marginTop: '4px', opacity: 0.6 }}>
        .py .ts .js .md .txt .pdf .json .yaml .sql .go .rs + more
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => onFiles(Array.from(e.target.files))}
      />
    </div>
  )
}

function ResultRow({ result }) {
  const isOk = result.status === 'ok'
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '5px 10px',
      marginBottom: '4px',
      background: isOk ? 'rgba(0,255,159,0.04)' : 'rgba(255,56,96,0.04)',
      border: `1px solid ${isOk ? 'rgba(0,255,159,0.15)' : 'rgba(255,56,96,0.15)'}`,
      borderRadius: '3px',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: isOk ? 'var(--green)' : 'var(--red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
        {isOk ? '✓' : '✗'} {result.file || result.title || result.path}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)', flexShrink: 0 }}>
        {isOk ? `${result.chunks} chunks` : result.status?.slice(0, 20)}
      </span>
    </div>
  )
}

export default function LocalIngestPanel() {
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])
  const [dirPath, setDirPath] = useState('')
  const [dirLoading, setDirLoading] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteLang, setPasteLang] = useState('text')
  const [pasteLoading, setPasteLoading] = useState(false)
  const [tab, setTab] = useState('upload') // upload | dir | paste
  const setStatusMsg = useJarvisStore(s => s.setStatusMsg)
  const pollIngestStatus = useJarvisStore(s => s.pollIngestStatus)

  // ── File upload ──────────────────────────────────────────────────
  const handleFiles = async (files) => {
    setUploading(true)
    setStatusMsg(`INGESTING ${files.length} FILE(S)...`)
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    try {
      const res = await fetch(`${API}/ingest/local/upload`, { method: 'POST', body: form })
      const data = await res.json()
      setResults(prev => [...data.results.reverse(), ...prev].slice(0, 20))
      setStatusMsg(`INGESTED ${data.total_chunks} CHUNKS FROM ${data.files_processed} FILES`)
      pollIngestStatus()
    } catch (e) {
      setStatusMsg('UPLOAD FAILED — IS BACKEND RUNNING?')
    }
    setUploading(false)
  }

  // ── Directory scan ───────────────────────────────────────────────
  const handleDir = async () => {
    if (!dirPath.trim()) return
    setDirLoading(true)
    setStatusMsg(`SCANNING ${dirPath}...`)
    try {
      const res = await fetch(`${API}/ingest/local/directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        setResults(prev => [{ file: dirPath, status: 'ok', chunks: '∞', title: 'Directory scan' }, ...prev].slice(0, 20))
        setStatusMsg('DIRECTORY SCAN STARTED IN BACKGROUND')
        setTimeout(() => pollIngestStatus(), 1500)
      } else {
        setStatusMsg(`ERROR: ${data.detail}`)
      }
    } catch (e) {
      setStatusMsg('DIRECTORY SCAN FAILED')
    }
    setDirLoading(false)
  }

  // ── Paste ────────────────────────────────────────────────────────
  const handlePaste = async () => {
    if (!pasteText.trim()) return
    setPasteLoading(true)
    setStatusMsg('INGESTING PASTE...')
    try {
      const res = await fetch(`${API}/ingest/local/paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText, title: pasteTitle || 'Pasted Content', language: pasteLang })
      })
      const data = await res.json()
      setResults(prev => [{ file: data.title, status: 'ok', chunks: data.chunks }, ...prev].slice(0, 20))
      setPasteText('')
      setPasteTitle('')
      setStatusMsg(`INGESTED PASTE: ${data.chunks} CHUNKS`)
      pollIngestStatus()
    } catch (e) {
      setStatusMsg('PASTE INGEST FAILED')
    }
    setPasteLoading(false)
  }

  const tabStyle = (id) => ({
    flex: 1,
    padding: '7px 4px',
    background: tab === id ? 'rgba(0,200,255,0.08)' : 'transparent',
    border: 'none',
    borderBottom: tab === id ? '2px solid var(--cyan)' : '2px solid transparent',
    color: tab === id ? 'var(--cyan)' : 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,200,255,0.08)', flexShrink: 0 }}>
        {[['upload','⬆ FILES'],['dir','◈ DIRECTORY'],['paste','⌨ PASTE']].map(([id, label]) => (
          <button key={id} style={tabStyle(id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="scroll-area" style={{ flex: 1, padding: '14px', minHeight: 0 }}>

        {/* ── File Upload Tab ── */}
        {tab === 'upload' && (
          <div>
            <div className="section-header">▸ DRAG &amp; DROP FILES</div>
            <DropZone onFiles={handleFiles} />
            {uploading && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {[0,1,2].map(i=><div key={i} className="voice-bar" style={{ height: '14px', animationDelay:`${i*0.15}s` }} />)}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--cyan)' }}>INGESTING...</span>
              </div>
            )}
            <div style={{ marginTop: '12px', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Supported: <span style={{ color: 'var(--cyan)' }}>Python, TypeScript, JavaScript, Go, Rust, Java, SQL, Markdown, PDF, DOCX, JSON, YAML, Jupyter Notebooks</span> and more. Multiple files at once.
            </div>
          </div>
        )}

        {/* ── Directory Tab ── */}
        {tab === 'dir' && (
          <div>
            <div className="section-header">▸ SCAN LOCAL DIRECTORY</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
              Enter an absolute path. The backend will recursively scan all readable code files. Skips <code style={{ color: 'var(--cyan)', fontSize: '11px' }}>node_modules</code>, <code style={{ color: 'var(--cyan)', fontSize: '11px' }}>.git</code>, build artifacts.
            </div>
            <div style={{ marginBottom: '8px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
              EXAMPLES: C:\Users\you\projects\lexprobe&nbsp;&nbsp;/home/you/code/myapp
            </div>
            <input
              className="input-cyber"
              value={dirPath}
              onChange={e => setDirPath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDir()}
              placeholder="/absolute/path/to/directory"
              style={{ marginBottom: '10px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
            />
            <button
              className="btn btn-gold"
              onClick={handleDir}
              disabled={dirLoading || !dirPath.trim()}
              style={{ width: '100%' }}
            >
              {dirLoading ? '⟳ SCANNING...' : '◈ SCAN DIRECTORY'}
            </button>
            <div style={{ marginTop: '12px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
              Max 100 files · 100KB per file<br/>
              Scan runs in background — check status below
            </div>
          </div>
        )}

        {/* ── Paste Tab ── */}
        {tab === 'paste' && (
          <div>
            <div className="section-header">▸ PASTE CONTENT</div>
            <input
              className="input-cyber"
              value={pasteTitle}
              onChange={e => setPasteTitle(e.target.value)}
              placeholder="Title (e.g. My Architecture Notes)"
              style={{ marginBottom: '8px' }}
            />
            <select
              value={pasteLang}
              onChange={e => setPasteLang(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(0,10,20,0.8)',
                border: '1px solid rgba(0,200,255,0.2)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                padding: '8px 10px',
                marginBottom: '8px',
                outline: 'none',
              }}
            >
              {['text','python','typescript','javascript','go','rust','java','sql','markdown','yaml','json','bash','other'].map(l=>(
                <option key={l} value={l} style={{ background: '#001020' }}>{l}</option>
              ))}
            </select>
            <textarea
              className="input-cyber"
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste any code, notes, specs, documentation..."
              rows={8}
              style={{ resize: 'vertical', marginBottom: '10px', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)' }}>
                {pasteText.length.toLocaleString()} chars
              </span>
              <button className="btn" style={{ fontSize: '9px', padding: '4px 8px' }} onClick={() => setPasteText('')}>
                CLEAR
              </button>
            </div>
            <button
              className="btn btn-gold"
              onClick={handlePaste}
              disabled={pasteLoading || !pasteText.trim()}
              style={{ width: '100%' }}
            >
              {pasteLoading ? '⟳ INGESTING...' : '⬆ INGEST TO BRAIN'}
            </button>
          </div>
        )}

        {/* ── Results ── */}
        {results.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-header" style={{ marginBottom: '8px' }}>▸ RECENT INGESTIONS</div>
              <button className="btn" style={{ fontSize: '8px', padding: '2px 6px', marginBottom: '8px', opacity: 0.5 }} onClick={() => setResults([])}>CLEAR</button>
            </div>
            {results.slice(0, 12).map((r, i) => <ResultRow key={i} result={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
