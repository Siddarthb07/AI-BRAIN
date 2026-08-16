'use client'

import { useEffect, useMemo } from 'react'
import { useJarvisStore } from '../app/store'
import { enrichRepo } from '../lib/knowledge'
import { nodeSlug } from '../lib/hashNav'

function Pane({ title, children, wide }) {
  return (
    <section className={`dossier-pane${wide ? ' is-wide' : ''}`}>
      <header>{title}</header>
      <div className="dossier-pane-body">{children}</div>
    </section>
  )
}

export default function ProjectDossier({ project, onAsk, onClose }) {
  const fetchXray = useJarvisStore((s) => s.fetchXray)
  const xrayView = useJarvisStore((s) => s.xrayView)
  const runLibraryScan = useJarvisStore((s) => s.runLibraryScan)
  const graphProjection = useJarvisStore((s) => s.graphProjection)
  const data = enrichRepo(project || {})
  const name = data.name || 'project'
  const deps = Object.keys(xrayView?.deps || data.key_deps || {}).slice(0, 18)
  const files = (xrayView?.entry_points || data.entry_points || []).slice(0, 16)
  const env = (xrayView?.required_env || data.required_env || []).slice(0, 10)
  const pulses = (graphProjection?.pulses || []).slice(-12).reverse()
  const slug = nodeSlug(name)

  useEffect(() => {
    if (name) void fetchXray(name)
  }, [name, fetchXray])

  const readme = String(data.readme_excerpt || data.description || '').trim()
  const lang = xrayView?.language || data.language || '—'
  const stackLine = deps.length ? deps.join(' · ') : lang

  const tree = useMemo(() => {
    const rows = files.length ? files : ['README.md', lang === 'Python' ? 'main.py' : 'src/', 'requirements.txt']
    return rows.map((f) => String(f))
  }, [files, lang])

  return (
    <div className="dossier-shell">
      <div className="dossier-stars" aria-hidden />
      <header className="dossier-top">
        <div>
          <div className="dossier-kicker">DOSSIER · JRVS · #{slug}</div>
          <h1>PROJECT {String(name).toUpperCase()}</h1>
          <p>{stackLine}</p>
        </div>
        <div className="dossier-actions">
          <button type="button" className="btn" onClick={() => runLibraryScan(deps[0] || name)}>SCAN</button>
          <button type="button" className="btn" onClick={() => fetchXray(name)}>X-RAY</button>
          <button type="button" className="btn" onClick={onAsk}>ASK</button>
          <button type="button" className="btn" onClick={onClose}>CLOSE</button>
        </div>
      </header>

      <div className="dossier-grid">
        <Pane title="REPOSITORY DOSSIER">
          <dl className="dossier-meta">
            <div><dt>OWNER</dt><dd>@Siddarthb07</dd></div>
            <div><dt>REPO</dt><dd>{name}</dd></div>
            <div><dt>LANG</dt><dd>{lang}</dd></div>
            <div><dt>STATUS</dt><dd>{data.archived ? 'ARCHIVED' : 'ACTIVE'}</dd></div>
            <div><dt>FILES</dt><dd>{xrayView?.file_count || data.file_count || '—'}</dd></div>
            <div><dt>HASH</dt><dd>#{slug}</dd></div>
          </dl>
          <div className="dossier-summary">
            <b>SUMMARY</b>
            <p>{readme || 'No README ingested yet. Run GitHub ingest, then X-RAY.'}</p>
          </div>
        </Pane>

        <Pane title="MANIFEST">
          <pre>{JSON.stringify({ name, language: lang, dependencies: deps.slice(0, 12), env }, null, 2)}</pre>
        </Pane>

        <Pane title="INFRASTRUCTURE">
          <pre>{`# inferred from inventory
services:
  app:
    runtime: ${lang}
    env: ${env.slice(0, 6).join(', ') || 'local'}
  graph:
    qdrant: enabled
`}</pre>
        </Pane>

        <Pane title="ARCHITECTURE">
          <div className="dossier-arch">
            <span>YOU</span>
            <i />
            <span>JARVIS</span>
            <i />
            <span>{lang}</span>
            {deps.slice(0, 3).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </Pane>

        <Pane title="FILES">
          <ul className="dossier-tree">
            {tree.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Pane>

        <Pane title="EVENT LOG" wide>
          <div className="dossier-log">
            {pulses.length === 0 ? (
              <div>No recent pulses for this graph.</div>
            ) : (
              pulses.map((p, i) => (
                <div key={p.ts || i}>
                  {(p.node_id || 'core').toString().slice(0, 18)} · {String(p.reason || 'event')}
                </div>
              ))
            )}
          </div>
        </Pane>
      </div>
    </div>
  )
}
