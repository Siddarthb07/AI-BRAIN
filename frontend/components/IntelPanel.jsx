'use client'

import { useEffect, useState } from 'react'
import { useJarvisStore } from '../app/store'

function kindTone(kind) {
  if (kind === 'DECLARED') return '#4ade80'
  if (kind === 'IMPORT') return '#60a5fa'
  if (kind === 'FILE') return '#fbbf24'
  return '#9aa8b5'
}

export default function IntelPanel() {
  const scanSweep = useJarvisStore((s) => s.scanSweep)
  const radarHits = useJarvisStore((s) => s.radarHits)
  const webSummary = useJarvisStore((s) => s.webSummary)
  const runLibraryScan = useJarvisStore((s) => s.runLibraryScan)
  const runRadarSearch = useJarvisStore((s) => s.runRadarSearch)
  const summarizeWebHit = useJarvisStore((s) => s.summarizeWebHit)
  const pinWebHit = useJarvisStore((s) => s.pinWebHit)
  const askAboutUrl = useJarvisStore((s) => s.askAboutUrl)
  const fetchArmory = useJarvisStore((s) => s.fetchArmory)
  const setLayoutMode = useJarvisStore((s) => s.setLayoutMode)
  const setActivePanel = useJarvisStore((s) => s.setActivePanel)
  const setFocusRepo = useJarvisStore((s) => s.setFocusRepo)

  const [scanQ, setScanQ] = useState('')
  const [radarQ, setRadarQ] = useState('')

  useEffect(() => {
    fetchArmory()
  }, [fetchArmory])

  const scanHits = scanSweep?.hits || []

  return (
    <div className="intel-cmd">
      <header className="intel-cmd-head">
        <div>
          <span className="hud-kicker">GRAPH / INTEL</span>
          <h2>Scan. Summarize. Ask. Clear.</h2>
          <p>
            Library scan lights the 3-D graph. Web hits stay in this HUD — summarize, pin, or ask. Compare is gone.
          </p>
        </div>
      </header>

      <section className="intel-cmd-grid">
        <article className="intel-cmd-card">
          <h3>1 · LIBRARY SCAN</h3>
          <p className="intel-cmd-help">DECLARED = lockfile. IMPORT = code import. FILE = GitHub path. META = name/README match.</p>
          <form
            className="intel-cmd-row"
            onSubmit={(e) => {
              e.preventDefault()
              runLibraryScan(scanQ)
              setLayoutMode('graph')
              setActivePanel('graph')
            }}
          >
            <input value={scanQ} onChange={(e) => setScanQ(e.target.value)} placeholder="fastapi, redis…" />
            <button type="submit">SCAN</button>
          </form>
          {scanSweep?.github_error ? (
            <p className="intel-cmd-status">SEARCH UNAVAILABLE · {scanSweep.github_error}</p>
          ) : null}
          <ul className="intel-hit-list">
            {scanHits.map((h) => (
              <li key={`${h.repo}-${h.kind}-${h.path || ''}`}>
                <button
                  type="button"
                  onClick={() => {
                    setFocusRepo(h.repo)
                    setLayoutMode('graph')
                    setActivePanel('graph')
                  }}
                >
                  <strong>{h.repo}</strong>
                  <span style={{ color: kindTone(h.kind) }}>{h.kind}</span>
                  {h.path ? <code>{h.path}</code> : null}
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className="intel-cmd-card">
          <h3>2 · WEB INTEL</h3>
          <p className="intel-cmd-help">Summarize in-HUD. Pin onto the graph (max 3). Ask JARVIS about the URL. No iframes.</p>
          <form
            className="intel-cmd-row"
            onSubmit={(e) => {
              e.preventDefault()
              runRadarSearch(radarQ)
            }}
          >
            <input value={radarQ} onChange={(e) => setRadarQ(e.target.value)} placeholder="fourier neural operator…" />
            <button type="submit">SEARCH</button>
          </form>
          {webSummary?.summary ? <pre className="intel-summary">{webSummary.summary}</pre> : null}
          <ul className="intel-web-list">
            {(radarHits || []).slice(0, 8).map((h, i) => (
              <li key={h.url || i}>
                <span>{h.title || h.url}</span>
                <span className="intel-web-verbs">
                  <button type="button" onClick={() => summarizeWebHit(h)}>SUMMARIZE</button>
                  <button type="button" onClick={() => pinWebHit(h)}>PIN</button>
                  <button type="button" onClick={() => askAboutUrl(h)}>ASK</button>
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  )
}
