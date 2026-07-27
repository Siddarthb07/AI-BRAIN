'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useJarvisStore } from '../app/store'
import { API_BASE } from '../lib/api'

const TABS = [
  { id: 'capture', label: 'CAPTURE' },
  { id: 'vault', label: 'VAULT' },
]

export default function VisionPanel() {
  const analyzeVision = useJarvisStore((s) => s.analyzeVision)
  const sendChat = useJarvisStore((s) => s.sendChat)
  const saveToVault = useJarvisStore((s) => s.saveToVault)
  const vaultNotes = useJarvisStore((s) => s.vaultNotes)
  const vaultStatus = useJarvisStore((s) => s.vaultStatus)
  const fetchVaultNotes = useJarvisStore((s) => s.fetchVaultNotes)
  const fetchVaultStatus = useJarvisStore((s) => s.fetchVaultStatus)
  const lastSaveToast = useJarvisStore((s) => s.lastSaveToast)
  const setVisionCameraActive = useJarvisStore((s) => s.setVisionCameraActive)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const previewUrlRef = useRef('')
  const [tab, setTab] = useState('capture')
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState('What should I notice for my active project?')
  const [preview, setPreview] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [meta, setMeta] = useState(null)
  const [overlayNote, setOverlayNote] = useState('')
  const visionOk = Boolean(analysis) && meta?.provider !== 'text_fallback' && !meta?.error

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setLive(false)
    setVisionCameraActive(false)
  }, [setVisionCameraActive])

  useEffect(() => () => {
    stopCamera()
    revokePreview()
  }, [stopCamera, revokePreview])

  useEffect(() => {
    if (tab === 'vault') {
      fetchVaultStatus()
      fetchVaultNotes()
    }
  }, [tab, fetchVaultNotes, fetchVaultStatus])

  const startCamera = async () => {
    setError('')
    setOverlayNote('REQUESTING CAMERA…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setLive(true)
      setVisionCameraActive(true)
      setOverlayNote('LIVE')
      return true
    } catch (e) {
      setError('Camera permission denied or unavailable.')
      setLive(false)
      setVisionCameraActive(false)
      setOverlayNote('')
      return false
    }
  }

  const waitForVideo = () =>
    new Promise((resolve) => {
      const video = videoRef.current
      if (!video) {
        resolve(false)
        return
      }
      if (video.videoWidth > 0) {
        resolve(true)
        return
      }
      const onReady = () => {
        video.removeEventListener('loadeddata', onReady)
        resolve(true)
      }
      video.addEventListener('loadeddata', onReady)
      setTimeout(() => {
        video.removeEventListener('loadeddata', onReady)
        resolve(video.videoWidth > 0)
      }, 1500)
    })

  const captureFrame = async () => {
    setTab('capture')
    setError('')
    setBusy(true)
    try {
      let isLive = live
      if (!isLive) {
        isLive = await startCamera()
        if (!isLive) return
        await waitForVideo()
        await new Promise((r) => setTimeout(r, 250))
      }

      const video = videoRef.current
      if (!video) {
        setError('Camera not ready.')
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
      if (!blob) throw new Error('capture failed')

      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        const url = URL.createObjectURL(blob)
        previewUrlRef.current = url
        return url
      })
      setOverlayNote('ANALYZING FRAME…')
      const result = await analyzeVision(blob, prompt)
      const provider = result?.provider
      const degraded = provider === 'text_fallback' || Boolean(result?.error)
      setMeta({ provider, model: result?.model, error: result?.error })
      setAnalysis(result?.analysis || '')
      if (degraded) {
        setError(
          result?.error
            ? `Capture OK — vision unavailable (${result.error})`
            : 'Capture OK — vision unavailable (text fallback)',
        )
        setOverlayNote('CAPTURE OK — VISION DEGRADED')
      } else if (result?.analysis) {
        setError('')
        setOverlayNote('CAPTURE READY')
      } else {
        setError(result?.error || 'No analysis returned')
        setOverlayNote('NO ANALYSIS')
      }
    } catch (e) {
      setError(String(e.message || e))
      setOverlayNote('')
    } finally {
      setBusy(false)
    }
  }

  const askJarvis = async () => {
    if (!visionOk) return
    await sendChat(`Camera analysis:\n${analysis}\n\nUse this for my current work.`)
  }

  const saveAnalysisToVault = async () => {
    if (!visionOk || saving) return
    setSaving(true)
    try {
      await saveToVault(analysis, `Vision capture — ${new Date().toLocaleString()}`)
      setTab('vault')
      await fetchVaultNotes()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 14, padding: 18, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div className="section-header" style={{ margin: 0, fontSize: 16 }}>
          VISION
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn"
              onClick={() => setTab(t.id)}
              style={{
                fontSize: 13,
                padding: '8px 14px',
                borderColor: tab === t.id ? 'var(--amber)' : undefined,
                color: tab === t.id ? 'var(--amber)' : undefined,
                background: tab === t.id ? 'rgba(255,159,67,0.12)' : undefined,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'capture' ? (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 18, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            <div
              style={{
                flex: 1,
                minHeight: 300,
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid rgba(255,120,80,0.35)',
                background: 'radial-gradient(ellipse at 30% 20%, #1a1020, #050608 70%)',
                position: 'relative',
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: live ? 'block' : 'none' }}
              />
              {!live && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 18,
                    color: 'var(--text-dim)',
                    letterSpacing: '0.14em',
                    textAlign: 'center',
                    padding: 24,
                  }}
                >
                  CAMERA OFF
                  <div style={{ fontSize: 14, marginTop: 10, letterSpacing: '0.06em', opacity: 0.7 }}>
                    Press CAPTURE to open the camera
                  </div>
                </div>
              )}
              {(live || overlayNote) && (
                <div
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: 14,
                    right: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 15,
                      letterSpacing: '0.12em',
                      color: live ? 'var(--amber)' : 'var(--text-primary)',
                      background: 'rgba(0,0,0,0.55)',
                      padding: '8px 12px',
                      borderRadius: 4,
                    }}
                  >
                    {overlayNote || (live ? 'LIVE' : '')}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-gold"
                style={{ fontSize: 14, padding: '10px 16px' }}
                disabled={busy}
                onClick={captureFrame}
              >
                {busy ? 'WORKING…' : live ? 'CAPTURE + ANALYZE' : 'CAPTURE (OPENS CAMERA)'}
              </button>
              {live ? (
                <button type="button" className="btn" style={{ fontSize: 14, padding: '10px 16px' }} onClick={stopCamera}>
                  STOP CAMERA
                </button>
              ) : null}
            </div>

            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about the frame…"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,170,60,0.25)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 16,
                borderRadius: 4,
              }}
            />
            {error ? (
              <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>{error}</div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
            <div className="section-header" style={{ fontSize: 15 }}>
              ANALYSIS
            </div>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Last capture"
                style={{
                  width: '100%',
                  maxHeight: 180,
                  objectFit: 'cover',
                  borderRadius: 4,
                  border: '1px solid rgba(255,170,60,0.2)',
                }}
              />
            ) : null}
            <div
              className="scroll-area"
              style={{
                flex: 1,
                minHeight: 180,
                padding: 14,
                background: 'rgba(0,8,16,0.55)',
                border: '1px solid rgba(0,200,255,0.12)',
                borderRadius: 4,
                fontFamily: 'var(--font-body)',
                fontSize: 17,
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {analysis || 'Capture a frame to analyze what the camera sees.'}
            </div>
            {meta?.provider ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>
                {String(meta.provider).toUpperCase()}
                {meta.model ? ` · ${meta.model}` : ''} · API {API_BASE}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 13, padding: '10px 14px' }}
                disabled={!visionOk}
                onClick={askJarvis}
              >
                SEND TO CHAT
              </button>
              <button
                type="button"
                className="btn btn-gold"
                style={{ fontSize: 13, padding: '10px 14px' }}
                disabled={!visionOk || saving}
                onClick={saveAnalysisToVault}
              >
                {saving ? 'SAVING…' : 'SAVE TO VAULT'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            {vaultStatus?.vault_path || 'Vault path pending'}
            <br />
            {(vaultStatus?.note_count ?? vaultNotes?.length ?? 0)} notes indexed
          </div>

          {visionOk ? (
            <div
              style={{
                padding: 14,
                border: '1px solid rgba(240,180,41,0.25)',
                background: 'rgba(240,180,41,0.06)',
                borderRadius: 4,
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--gold)', marginBottom: 8 }}>
                LAST CAPTURE — READY TO SAVE
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                {analysis.slice(0, 280)}
                {analysis.length > 280 ? '…' : ''}
              </div>
              <button
                type="button"
                className="btn btn-gold"
                style={{ marginTop: 12, fontSize: 14, padding: '10px 16px' }}
                disabled={saving}
                onClick={saveAnalysisToVault}
              >
                {saving ? 'SAVING…' : 'SAVE ANALYSIS TO VAULT'}
              </button>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-dim)' }}>
              Capture a frame first, then save it here.
            </div>
          )}

          {lastSaveToast ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--green)' }}>
              Saved: {lastSaveToast}
            </div>
          ) : null}

          <div className="section-header" style={{ fontSize: 14 }}>
            RECENT NOTES
          </div>
          <div className="scroll-area" style={{ flex: 1, minHeight: 0 }}>
            {(vaultNotes || []).length === 0 ? (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-dim)' }}>No vault notes yet.</div>
            ) : (
              vaultNotes.map((note) => (
                <div
                  key={note.relative_path}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(0,200,255,0.08)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ color: 'var(--cyan)', marginBottom: 4, fontSize: 15 }}>
                    {note.title || note.relative_path}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {note.relative_path?.replace(/\\/g, '/')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
