'use client'

import { useEffect, useMemo, useState } from 'react'
import { useJarvisStore } from '../app/store'
import HoloFrame from './jarvis/HoloFrame'
import ArcReactor from './jarvis/ArcReactor'

function formatDuration(value) {
  if (!value) return '—'
  const start = new Date(value).getTime()
  if (!Number.isFinite(start)) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`
}

function compactBytes(bytes) {
  if (bytes == null) return 'N/A'
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function Gauge({ value, label, tone = 'cyan', suffix = '%' }) {
  const safe = value == null ? 0 : Math.max(0, Math.min(100, Number(value)))
  return (
    <div className={`infra-gauge infra-tone-${tone}`} style={{ '--value': `${safe * 3.6}deg` }}>
      <div className="infra-gauge-core">
        <strong>{value == null ? '—' : `${Number(value).toFixed(1)}${suffix}`}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function StatusLabel({ status }) {
  const raw = status || 'unknown'
  const normalized =
    raw === 'healthy' || raw === 'running' || raw === 'up'
      ? 'up'
      : raw === 'unhealthy' || raw === 'down'
        ? 'down'
        : raw === 'none' || raw === 'exited' || raw === 'created'
          ? 'unknown'
          : raw
  const text = raw === 'none' ? 'NO HEALTHCHECK' : String(raw).toUpperCase()
  return <span className={`infra-status-label status-${normalized}`}>{text}</span>
}

function TopologyStage({ sites, containers, source }) {
  const siteDots = sites.slice(0, 8)
  const containerDots = containers.slice(0, 9)
  return (
    <HoloFrame
      title="Live Systems Topology"
      right={<span className="infra-microcopy">SOURCE · {source || 'UNAVAILABLE'}</span>}
      style={{ minHeight: 310 }}
      bodyStyle={{ padding: 0, position: 'relative', overflow: 'hidden' }}
    >
      <div className="infra-topology-grid" aria-hidden />
      <div className="dash-radar-sweep infra-topology-radar" aria-hidden />
      <svg className="infra-topology-lines" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden>
        {siteDots.map((site, index) => (
          <line key={`s-${site.id}`} x1="500" y1="150" x2={95 + index * 105} y2="55" />
        ))}
        {containerDots.map((container, index) => (
          <line key={`c-${container.id}`} x1="500" y1="150" x2={75 + index * 105} y2="250" />
        ))}
      </svg>
      <div className="infra-topology-core">
        <ArcReactor size={118} halo />
        <span>AI-BRAIN</span>
      </div>
      <div className="infra-topology-orbit infra-topology-sites">
        {siteDots.map((site, index) => (
          <div
            key={site.id}
            className={`infra-topology-node status-${site.status || 'unknown'}`}
            style={{ '--slot': index, '--total': Math.max(siteDots.length, 1) }}
            title={`${site.name}: ${site.status}`}
          >
            <span>{site.name}</span>
          </div>
        ))}
      </div>
      <div className="infra-topology-orbit infra-topology-containers">
        {containerDots.map((container, index) => (
          <div
            key={container.id}
            className={`infra-topology-node status-${container.health === 'unhealthy' ? 'down' : container.state === 'running' ? 'up' : 'unknown'}`}
            style={{ '--slot': index, '--total': Math.max(containerDots.length, 1) }}
            title={`${container.name}: ${container.state}`}
          >
            <span>{container.name}</span>
          </div>
        ))}
      </div>
      {!sites.length && !containers.length ? (
        <div className="infra-empty-state">NO LIVE NODES · WAITING FOR DISCOVERY AND RUNTIME TELEMETRY</div>
      ) : null}
    </HoloFrame>
  )
}

function siteUptimeLabel(site) {
  return site.uptime_label || site.uptime_streak?.label || (site.status === 'up' ? 'UP · OBSERVING' : site.status === 'down' ? 'DOWN · OBSERVING' : 'NO CHECKS YET')
}

function SiteCard({ site }) {
  const uptime24 = site.uptime_24h?.uptime_pct
  const uptime7 = site.uptime_7d?.uptime_pct
  const streakHuman = site.uptime_human || site.uptime_streak?.human
  const origin = useMemo(() => {
    try {
      return new URL(site.url).origin
    } catch {
      return ''
    }
  }, [site.url])
  return (
    <article className={`infra-card infra-site-card status-${site.status || 'unknown'}`}>
      <div className="infra-card-scan" aria-hidden />
      <header>
        <div className="infra-site-identity">
          {origin ? <img src={`${origin}/favicon.ico`} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : null}
          <div>
            <span className="infra-eyebrow">GITHUB PAGES · {site.repo}</span>
            <h3>{site.name || site.repo}</h3>
          </div>
        </div>
        <StatusLabel status={site.status} />
      </header>
      <div className={`infra-uptime-banner status-${site.status || 'unknown'}`}>
        <span>CURRENT STREAK</span>
        <strong>{siteUptimeLabel(site)}</strong>
        {streakHuman ? <small>{site.status === 'down' ? 'CONTINUOUS OUTAGE' : 'CONTINUOUS AVAILABILITY'}</small> : null}
      </div>
      <div className="infra-card-metrics">
        <Gauge value={uptime24} label="24H" tone={site.status === 'down' ? 'red' : 'cyan'} />
        <Gauge value={uptime7} label="7D" tone={site.status === 'down' ? 'red' : 'cyan'} />
        <div className="infra-metric-stack">
          <span>HTTP</span><strong>{site.status_code || '—'}</strong>
          <span>LATENCY</span><strong>{site.latency_ms != null ? `${site.latency_ms} ms` : '—'}</strong>
        </div>
      </div>
      <div className="infra-url">{site.url}</div>
      {site.active_incident ? (
        <div className="infra-incident-live">ACTIVE OUTAGE · {formatDuration(site.active_incident.started_at)}</div>
      ) : (
        <div className="infra-incident-clear">NO ACTIVE INCIDENT</div>
      )}
      <div className="infra-incident-strip" aria-label="Recent incident checks">
        {(site.incidents || []).length
          ? site.incidents.slice(0, 10).map((incident) => (
              <i key={incident.id} className={incident.ended_at ? 'resolved' : 'active'} title={incident.started_at} />
            ))
          : <span>OBSERVATION WINDOW BUILDING</span>}
      </div>
      <footer>
        <span>LAST CHECK · {site.checked_at ? new Date(site.checked_at).toLocaleTimeString() : 'PENDING'}</span>
        <a className="btn" href={site.url} target="_blank" rel="noreferrer">OPEN SITE ↗</a>
      </footer>
    </article>
  )
}

function containerUptimeLabel(container) {
  if (container.uptime_label) return container.uptime_label
  if (container.state === 'running' && container.started_at) return `UP ${formatDuration(container.started_at)}`
  return container.state === 'running' ? 'UP · UNKNOWN' : 'STOPPED'
}

function ContainerCard({ container, selected, onSelect }) {
  const running = container.state === 'running'
  const unhealthy = running && container.health === 'unhealthy'
  const tone = unhealthy ? 'down' : running ? 'up' : 'unknown'
  const uptimeText = container.uptime_human || (running && container.started_at ? formatDuration(container.started_at) : null)
  return (
    <button
      type="button"
      className={`infra-card infra-container-card status-${tone}${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="infra-card-scan" aria-hidden />
      <header>
        <div>
          <span className="infra-eyebrow">DOCKER · {container.id}</span>
          <h3>{container.name}</h3>
        </div>
        <div className="infra-dual-status">
          <StatusLabel status={container.state} />
          <StatusLabel status={container.health} />
        </div>
      </header>
      <div className={`infra-uptime-banner status-${tone}`}>
        <span>CONTAINER UPTIME</span>
        <strong>{containerUptimeLabel(container)}</strong>
        {running && container.started_at ? (
          <small>SINCE {new Date(container.started_at).toLocaleString()}</small>
        ) : null}
      </div>
      <div className="infra-card-metrics">
        <Gauge value={running ? container.cpu_percent : null} label="CPU" tone={unhealthy ? 'red' : 'cyan'} />
        <Gauge value={running ? container.memory?.percent : null} label="RAM" tone={unhealthy ? 'red' : 'cyan'} />
        <div className="infra-metric-stack infra-metric-wide">
          <span>MEMORY</span><strong>{container.memory?.display || compactBytes(container.memory?.usage_bytes)}</strong>
          <span>LIVE UPTIME</span><strong>{uptimeText || '—'}</strong>
        </div>
      </div>
      <div className="infra-image-name">{container.image}</div>
      <div className="infra-port-bank">
        {(container.ports || []).length ? container.ports.map((port) => <span key={port}>{port}</span>) : <span>NO PUBLISHED PORTS</span>}
      </div>
      <footer><span>READ-ONLY TELEMETRY</span><strong>{selected ? 'LOG CONSOLE OPEN' : 'SELECT FOR LOGS'}</strong></footer>
    </button>
  )
}

function UptimeBoard({ title, rows }) {
  return (
    <div className="infra-uptime-board">
      <div className="infra-uptime-board-head">
        <span>{title}</span>
        <small>{rows.length} TARGET{rows.length === 1 ? '' : 'S'}</small>
      </div>
      <div className="infra-uptime-board-rows">
        {rows.map((row) => (
          <div key={row.id} className={`infra-uptime-row status-${row.tone || 'unknown'}`}>
            <div>
              <strong>{row.name}</strong>
              <span>{row.detail}</span>
            </div>
            <em>{row.uptime}</em>
          </div>
        ))}
        {!rows.length ? <div className="infra-empty-state">NO TARGETS YET</div> : null}
      </div>
    </div>
  )
}

export default function InfraPanel() {
  const infra = useJarvisStore((state) => state.infraStatus)
  const loading = useJarvisStore((state) => state.infraLoading)
  const selectedId = useJarvisStore((state) => state.selectedInfraId)
  const logs = useJarvisStore((state) => state.infraLogs)
  const fetchStatus = useJarvisStore((state) => state.fetchInfraStatus)
  const pollNow = useJarvisStore((state) => state.pollInfraNow)
  const select = useJarvisStore((state) => state.setSelectedInfraId)
  const fetchLogs = useJarvisStore((state) => state.fetchContainerLogs)
  const [, setClock] = useState(0)

  const sites = infra?.sites?.items || []
  const containers = infra?.docker?.items || []
  const selectedContainer = containers.find((item) => item.id === selectedId || item.name === selectedId)
  const selectedLogs = selectedContainer ? logs[selectedContainer.id] : null

  useEffect(() => {
    void fetchStatus()
    const metricsTimer = setInterval(() => void fetchStatus({ silent: true }), 10000)
    const clockTimer = setInterval(() => setClock((value) => value + 1), 1000)
    return () => {
      clearInterval(metricsTimer)
      clearInterval(clockTimer)
    }
  }, [fetchStatus])

  useEffect(() => {
    if (selectedContainer) {
      void fetchLogs(selectedContainer.id)
      const timer = setInterval(() => void fetchLogs(selectedContainer.id), 8000)
      return () => clearInterval(timer)
    }
  }, [fetchLogs, selectedContainer?.id])

  return (
    <div className="infra-command-center scroll-area">
      <div className="infra-ambient-ring infra-ambient-ring-a" aria-hidden />
      <div className="infra-ambient-ring infra-ambient-ring-b" aria-hidden />

      <header className="infra-command-header">
        <div>
          <span className="infra-eyebrow glitch-text">STARK WORKSHOP · OBSERVABILITY DECK</span>
          <h1>INFRASTRUCTURE COMMAND CENTER</h1>
          <p>GitHub Pages availability and Docker runtime telemetry. Observe only. No container controls exposed.</p>
        </div>
        <div className="infra-command-actions">
          <button className="btn" type="button" onClick={() => pollNow({ discover: true })} disabled={loading}>
            {loading ? 'SCANNING…' : 'DISCOVER PAGES'}
          </button>
          <button className="btn btn-gold" type="button" onClick={() => pollNow()} disabled={loading}>POLL NOW</button>
        </div>
      </header>

      <section className="infra-summary-ribbon">
        <button type="button"><span>SITES ONLINE</span><strong>{infra.sites?.up || 0}<small>/{infra.sites?.total || 0}</small></strong></button>
        <button type="button" className={infra.sites?.down ? 'is-alert' : ''}><span>ACTIVE INCIDENTS</span><strong>{infra.sites?.down || 0}</strong></button>
        <button type="button"><span>CONTAINERS RUNNING</span><strong>{infra.docker?.running || 0}<small>/{infra.docker?.total || 0}</small></strong></button>
        <button type="button" className={infra.docker?.unhealthy ? 'is-alert' : ''}><span>UNHEALTHY</span><strong>{infra.docker?.unhealthy || 0}</strong></button>
        <div className="infra-source-state">
          <span>DOCKER LINK</span>
          <strong>{String(infra.docker?.source || 'unavailable').replace('_', ' ').toUpperCase()}</strong>
          <small>{infra.docker?.last_poll_at ? new Date(infra.docker.last_poll_at).toLocaleTimeString() : 'AWAITING POLL'}</small>
        </div>
      </section>

      {(infra.sites?.error || infra.docker?.error) ? (
        <div className="infra-degraded-banner">
          <strong>PARTIAL TELEMETRY</strong>
          <span>{infra.sites?.error || infra.docker?.error}</span>
        </div>
      ) : null}

      <TopologyStage sites={sites} containers={containers} source={infra.docker?.source} />

      <section className="infra-uptime-boards">
        <UptimeBoard
          title="PAGES UPTIME"
          rows={sites.map((site) => ({
            id: site.id,
            name: site.name || site.repo,
            detail: site.url,
            uptime: siteUptimeLabel(site),
            tone: site.status || 'unknown',
          }))}
        />
        <UptimeBoard
          title="CONTAINER UPTIME"
          rows={containers.map((container) => ({
            id: container.id,
            name: container.name,
            detail: container.image,
            uptime: containerUptimeLabel(container),
            tone: container.state === 'running' && container.health === 'unhealthy'
              ? 'down'
              : container.state === 'running'
                ? 'up'
                : 'unknown',
          }))}
        />
      </section>

      <section className="infra-section">
        <div className="infra-section-heading">
          <div><span>DEPLOYMENT ARRAY</span><h2>GITHUB PAGES</h2></div>
          <small>{infra.sites?.last_discovery_at ? `DISCOVERED ${new Date(infra.sites.last_discovery_at).toLocaleString()}` : 'DISCOVERY PENDING'}</small>
        </div>
        <div className="infra-card-grid">
          {sites.map((site) => <SiteCard key={site.id} site={site} />)}
          {!sites.length ? <div className="infra-empty-state infra-empty-card">NO PAGES DEPLOYMENTS DISCOVERED · ADD GITHUB_TOKEN IF RATE LIMITED</div> : null}
        </div>
      </section>

      <section className="infra-section">
        <div className="infra-section-heading">
          <div><span>RUNTIME ARRAY</span><h2>DOCKER CONTAINERS</h2></div>
          <small>PROXY PRIMARY · HOST SNAPSHOT FALLBACK</small>
        </div>
        <div className="infra-runtime-layout">
          <div className="infra-card-grid infra-container-grid">
            {containers.map((container) => (
              <ContainerCard
                key={container.id}
                container={container}
                selected={selectedContainer?.id === container.id}
                onSelect={() => select(container.id)}
              />
            ))}
            {!containers.length ? <div className="infra-empty-state infra-empty-card">DOCKER PROXY OFFLINE · NO FRESH HOST SNAPSHOT AVAILABLE</div> : null}
          </div>
          <HoloFrame
            title={selectedContainer ? `Bounded Logs · ${selectedContainer.name}` : 'Bounded Log Console'}
            right={selectedContainer ? <button type="button" className="infra-console-close" onClick={() => select(null)}>CLOSE</button> : null}
            style={{ minHeight: 380 }}
            bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
          >
            {selectedContainer ? (
              <>
                <div className="infra-console-meta">
                  <span>TAIL 120</span><span>64 KB SERVER CAP</span><span>READ ONLY</span>
                </div>
                <pre className="infra-log-console">
                  {selectedLogs?.error ? `[telemetry degraded] ${selectedLogs.error}` : selectedLogs?.logs || 'Awaiting bounded log stream…'}
                </pre>
              </>
            ) : (
              <div className="infra-empty-state infra-console-idle">SELECT A CONTAINER TO OPEN ITS BOUNDED READ-ONLY LOG TAIL</div>
            )}
          </HoloFrame>
        </div>
      </section>
    </div>
  )
}
