'use client'

import { useRef } from 'react'
import { useJarvisStore } from '../app/store'
import WorldMap2D from './WorldMap2D'
import PlexusCraft from './PlexusCraft'

function ProjectCard({ repo, onClose }) {
  const name = repo?.name || 'UNKNOWN'
  const deps = Object.keys(repo?.key_deps || {}).slice(0, 16)
  return (
    <div className="project-blueprint">
      <div className="project-blueprint-scan" aria-hidden />
      <header>
        <span>PROJECT FILE</span>
        <button type="button" onClick={onClose}>
          CLOSE
        </button>
      </header>
      <h2>PROJECT {String(name).toUpperCase()}</h2>
      <p>{repo?.description || 'No description ingested.'}</p>
      <dl>
        <dt>LANGUAGE</dt>
        <dd>{repo?.language || '—'}</dd>
        <dt>STACK</dt>
        <dd>{deps.length ? deps.join(' · ') : 'Ingest lockfiles for blueprint lines.'}</dd>
      </dl>
    </div>
  )
}

export default function WorldStage() {
  const stageProject = useJarvisStore((s) => s.stageProject)
  const stageHardware = useJarvisStore((s) => s.stageHardware)
  const applyUiCommand = useJarvisStore((s) => s.applyUiCommand)
  const repos = useJarvisStore((s) => s.repos)
  const radarHits = useJarvisStore((s) => s.radarHits)
  const webSummary = useJarvisStore((s) => s.webSummary)
  const runRadarSearch = useJarvisStore((s) => s.runRadarSearch)
  const summarizeWebHit = useJarvisStore((s) => s.summarizeWebHit)
  const runLibraryScan = useJarvisStore((s) => s.runLibraryScan)
  const clearHud = useJarvisStore((s) => s.clearHud)
  const worldEvents = useJarvisStore((s) => s.worldEvents)
  const sendChat = useJarvisStore((s) => s.sendChat)
  const scanQ = useRef(null)
  const webQ = useRef(null)
  const news = [...(worldEvents?.news || []), ...(worldEvents?.hn || [])].slice(0, 8)

  return (
    <div className="world-stage">
      <WorldMap2D className="world-stage-map" />
      {stageHardware ? (
        <div className="world-stage-holo">
          <PlexusCraft kind={stageHardware} height={280} interactive />
        </div>
      ) : null}

      <div className="world-stage-chrome">
        <div className="world-kicker">WORLD MAP</div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runLibraryScan(scanQ.current?.value)
          }}
        >
          <input ref={scanQ} placeholder="scan library…" />
          <button type="submit">SCAN</button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            runRadarSearch(webQ.current?.value)
          }}
        >
          <input ref={webQ} placeholder="news / query…" />
          <button type="submit">PULL</button>
        </form>
        <div className="world-hw">
          <button type="button" onClick={() => applyUiCommand({ type: 'ui_show_hardware', params: { id: 'quad' } })}>
            QUAD KK2.1.5
          </button>
          <button type="button" onClick={() => applyUiCommand({ type: 'ui_show_hardware', params: { id: 'hex' } })}>
            HEX NAZA-M LITE
          </button>
          <button type="button" onClick={clearHud}>
            CLEAR
          </button>
        </div>
        <div className="world-repos">
          {(repos || []).slice(0, 10).map((r) => (
            <button
              key={r.name}
              type="button"
              onClick={() => applyUiCommand({ type: 'ui_open_project', params: { name: r.name } })}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {stageProject ? (
        <ProjectCard repo={stageProject} onClose={() => useJarvisStore.setState({ stageProject: null })} />
      ) : null}
      {stageHardware ? (
        <div className="hw-plaque">
          {stageHardware === 'quad'
            ? 'QUAD · FC HobbyKing KK2.1.5 · plexus hologram'
            : 'HEX F550 · FC DJI NAZA-M Lite · plexus hologram'}
        </div>
      ) : null}

      <div className="world-news">
        {news.map((n) => (
          <button
            key={n.url || n.title}
            type="button"
            onClick={() => sendChat(`Brief me on this headline: ${n.title} ${n.url || ''}`)}
          >
            {n.title}
          </button>
        ))}
      </div>
      {webSummary?.summary ? <pre className="world-summary">{webSummary.summary}</pre> : null}
      <div className="world-hits">
        {(radarHits || []).slice(0, 4).map((h) => (
          <button key={h.url} type="button" onClick={() => summarizeWebHit(h)}>
            {h.title}
          </button>
        ))}
      </div>
    </div>
  )
}
