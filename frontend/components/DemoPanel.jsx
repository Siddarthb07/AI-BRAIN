'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveApiBase } from '../lib/api'
import { useJarvisStore } from '../app/store'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 12, opacity: 0.6, fontSize: 12, fontFamily: 'var(--font-mono)' }}>Loading editor…</div>
  ),
})

function monacoLanguage(path) {
  if (!path) return 'plaintext'
  if (path.endsWith('.jsx') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.ts')) return 'javascript'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.md')) return 'markdown'
  return 'plaintext'
}

export default function DemoPanel() {
  const api = () => resolveApiBase()
  const activeDemoId = useJarvisStore((s) => s.activeDemoId)
  const setActiveDemoId = useJarvisStore((s) => s.setActiveDemoId)
  const setStatusMsg = useJarvisStore((s) => s.setStatusMsg)

  const [demos, setDemos] = useState([])
  const [meta, setMeta] = useState(null)
  const [files, setFiles] = useState([])
  const [activeFile, setActiveFile] = useState('src/App.jsx')
  const [content, setContent] = useState('')
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  const previewSrc = useMemo(() => {
    if (!meta?.preview_url) return ''
    const base = api()
    if (meta.preview_url.startsWith('http')) return `${meta.preview_url}?t=${iframeKey}`
    return `${base}${meta.preview_url}?t=${iframeKey}`
  }, [meta, iframeKey])

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch(`${api()}/demos`, { cache: 'no-store' })
      const data = await res.json()
      setDemos(data.demos || [])
    } catch {
      setDemos([])
    }
  }, [])

  const loadDemo = useCallback(
    async (id) => {
      if (!id) return
      setBusy(true)
      try {
        const res = await fetch(`${api()}/demos/${id}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('load failed')
        const m = await res.json()
        setMeta(m)
        setActiveDemoId(id)
        const fr = await fetch(`${api()}/demos/${id}/files`, { cache: 'no-store' })
        const fd = await fr.json()
        const list = fd.files || []
        setFiles(list)
        const preferred =
          list.find((f) => f === 'src/App.jsx') ||
          list.find((f) => f.endsWith('.jsx')) ||
          list.find((f) => f.endsWith('.css')) ||
          list[0]
        if (preferred) {
          setActiveFile(preferred)
          const cr = await fetch(`${api()}/demos/${id}/files/${preferred}`, { cache: 'no-store' })
          const cd = await cr.json()
          setContent(cd.content || '')
        }
        setIframeKey((k) => k + 1)
      } catch (e) {
        setStatusMsg(`DEMO LOAD FAILED — ${String(e.message || e).slice(0, 40)}`)
      } finally {
        setBusy(false)
      }
    },
    [setActiveDemoId, setStatusMsg]
  )

  useEffect(() => {
    refreshList()
  }, [refreshList])

  useEffect(() => {
    if (activeDemoId) loadDemo(activeDemoId)
  }, [activeDemoId, loadDemo])

  const openFile = async (path) => {
    if (!meta?.id) return
    setActiveFile(path)
    const cr = await fetch(`${api()}/demos/${meta.id}/files/${path}`, { cache: 'no-store' })
    const cd = await cr.json()
    setContent(cd.content || '')
  }

  const saveFile = async () => {
    if (!meta?.id || !activeFile) return
    setBusy(true)
    try {
      await fetch(`${api()}/demos/${meta.id}/files/${activeFile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      setStatusMsg(`SAVED ${activeFile}`)
    } catch (e) {
      setStatusMsg(`SAVE FAILED — ${String(e.message || e).slice(0, 40)}`)
    } finally {
      setBusy(false)
    }
  }

  const rebuild = async () => {
    if (!meta?.id) return
    setBusy(true)
    setStatusMsg('REBUILDING DEMO…')
    try {
      const res = await fetch(`${api()}/demos/${meta.id}/rebuild`, { method: 'POST' })
      const m = await res.json()
      setMeta(m)
      setIframeKey((k) => k + 1)
      setStatusMsg(m.build_ok ? 'REBUILD OK' : `REBUILD FALLBACK — ${m.build_error || ''}`)
    } catch (e) {
      setStatusMsg(`REBUILD FAILED — ${String(e.message || e).slice(0, 40)}`)
    } finally {
      setBusy(false)
    }
  }

  const buildNew = async () => {
    if (!brief.trim()) return
    setBusy(true)
    setStatusMsg('BUILDING CINEMATIC DEMO…')
    try {
      const res = await fetch(`${api()}/demos/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: brief.trim() }),
      })
      const m = await res.json()
      if (!res.ok) throw new Error(m.detail || 'build failed')
      setMeta(m)
      setActiveDemoId(m.id)
      await refreshList()
      await loadDemo(m.id)
      setStatusMsg(`DEMO READY — ${m.title}`)
    } catch (e) {
      setStatusMsg(`BUILD FAILED — ${String(e.message || e).slice(0, 60)}`)
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!meta?.id) return
    setBusy(true)
    setStatusMsg('PUBLISHING TUNNEL…')
    try {
      const res = await fetch(`${api()}/demos/${meta.id}/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'publish failed')
      setMeta(data.demo || { ...meta, public_url: data.public_url })
      setStatusMsg(`PUBLIC — ${data.public_url}`)
    } catch (e) {
      setStatusMsg(`PUBLISH FAILED — ${String(e.message || e).slice(0, 50)}`)
    } finally {
      setBusy(false)
    }
  }

  const openInCursor = async () => {
    if (!meta?.id) return
    try {
      const res = await fetch(`${api()}/demos/${meta.id}/open-path`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'path failed')
      const host =
        data.host_path ||
        (typeof window !== 'undefined'
          ? `C:\\Users\\siddu\\OneDrive\\Desktop\\AI-BRAIN\\backend\\data\\generated\\demos\\${meta.id}`
          : data.container_path)
      const uri = `cursor://file/${String(host).replace(/\\/g, '/')}`
      window.open(uri, '_blank')
      setStatusMsg(`OPEN IN CURSOR — ${host}`)
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(host)
      }
    } catch (e) {
      setStatusMsg(`OPEN FAILED — ${String(e.message || e).slice(0, 50)}`)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, gap: 0, fontFamily: 'inherit' }}>
      <aside className="left-panel" style={{ width: 268, borderRight: '1px solid rgba(255,170,80,0.12)', overflow: 'auto', background: 'rgba(12, 10, 18, 0.55)' }}>
        <div className="left-panel-title">Demos</div>
        <div className="left-panel-meta">Brief → Vite React site</div>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Build a website for…"
          rows={4}
          className="input-cyber"
          style={{
            width: '100%',
            fontSize: 14,
            fontFamily: 'var(--font-body)',
            padding: 10,
            resize: 'vertical',
            marginBottom: 10,
            minHeight: 96,
          }}
        />
        <button type="button" className="btn" disabled={busy || !brief.trim()} onClick={buildNew} style={{ width: '100%', marginBottom: 16, fontSize: 12 }}>
          Build
        </button>
        {(demos || []).map((d) => (
          <button
            key={d.id}
            type="button"
            className={`left-list-btn${d.id === meta?.id ? ' is-active' : ''}`}
            onClick={() => loadDemo(d.id)}
          >
            {d.title || d.id}
            <span className="left-list-sub">{d.kit}</span>
          </button>
        ))}
      </aside>

      <section
        style={{
          width: 320,
          borderRight: '1px solid rgba(0,200,255,0.12)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div style={{ padding: 8, fontSize: 11, opacity: 0.7, letterSpacing: '0.1em' }}>SOURCE · MONACO</div>
        <div style={{ overflow: 'auto', maxHeight: 120, borderBottom: '1px solid rgba(0,200,255,0.1)' }}>
          {files.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => openFile(f)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: f === activeFile ? 'rgba(0,200,255,0.12)' : 'transparent',
                border: 'none',
                color: 'inherit',
                fontSize: 11,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 180 }}>
          <MonacoEditor
            height="100%"
            theme="vs-dark"
            language={monacoLanguage(activeFile)}
            value={content}
            onChange={(v) => setContent(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, padding: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={busy || !meta} onClick={saveFile}>
            SAVE
          </button>
          <button type="button" className="btn" disabled={busy || !meta} onClick={rebuild}>
            REBUILD
          </button>
          <button type="button" className="btn" disabled={!meta} onClick={openInCursor}>
            CURSOR
          </button>
        </div>
      </section>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid rgba(0,200,255,0.12)' }}>
          <div style={{ flex: 1, fontSize: 12, opacity: 0.85 }}>
            {meta ? (
              <>
                <strong>{meta.title}</strong> · {meta.kit}
                {meta.public_url ? (
                  <>
                    {' '}
                    ·{' '}
                    <a href={meta.public_url} target="_blank" rel="noreferrer">
                      public
                    </a>
                  </>
                ) : null}
              </>
            ) : (
              'No demo selected'
            )}
          </div>
          <button
            type="button"
            className="btn"
            disabled={!previewSrc}
            onClick={() => window.open(previewSrc, '_blank', 'noopener,noreferrer')}
          >
            OPEN
          </button>
          <button type="button" className="btn" disabled={busy || !meta} onClick={publish}>
            PUBLISH
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
          {previewSrc ? (
            <iframe
              key={iframeKey}
              title="demo-preview"
              src={previewSrc}
              style={{ width: '100%', height: '100%', border: 'none', background: '#111' }}
              sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
            />
          ) : (
            <div style={{ padding: 24, opacity: 0.6, fontSize: 13 }}>
              Ask chat: “build me a website for …” or use BUILD above.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
