'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useJarvisStore } from '../app/store'

const FALLBACK_HOTSPOTS = [
  { id: 'ua', title: 'Ukraine war', lat: 48.4, lon: 31.2, kind: 'war', region: 'ukraine' },
  { id: 'gaza', title: 'Gaza / Israel', lat: 31.5, lon: 34.45, kind: 'war', region: 'gaza' },
  { id: 'sd', title: 'Sudan civil war', lat: 15.5, lon: 32.5, kind: 'war', region: 'sudan' },
  { id: 'mm', title: 'Myanmar conflict', lat: 21.9, lon: 96.1, kind: 'war', region: 'myanmar' },
  { id: 'ye', title: 'Yemen', lat: 15.55, lon: 48.5, kind: 'war', region: 'yemen' },
  { id: 'sy', title: 'Syria', lat: 35.0, lon: 38.0, kind: 'war', region: 'syria' },
  { id: 'sahel', title: 'Sahel insurgency', lat: 16.0, lon: 0.0, kind: 'war', region: 'sahel' },
  { id: 'ht', title: 'Haiti crisis', lat: 18.97, lon: -72.28, kind: 'crisis', region: 'haiti' },
  { id: 'tw', title: 'Taiwan strait', lat: 23.7, lon: 121.0, kind: 'tension', region: 'taiwan' },
  { id: 'kr', title: 'Korean peninsula', lat: 38.3, lon: 127.2, kind: 'tension', region: 'korea' },
  { id: 'in', title: 'India — regional watch', lat: 22.0, lon: 79.0, kind: 'watch', region: 'india' },
  { id: 'blr', title: 'Bangalore base', lat: 12.97, lon: 77.59, kind: 'watch', region: 'india' },
  { id: 'ny', title: 'New York', lat: 40.7, lon: -74.0, kind: 'watch', region: 'usa' },
  { id: 'lon', title: 'London', lat: 51.5, lon: -0.12, kind: 'watch', region: 'europe' },
  { id: 'tyo', title: 'Tokyo', lat: 35.68, lon: 139.69, kind: 'tension', region: 'taiwan' },
]

const REGION_WORDS = {
  ukraine: ['ukraine', 'kyiv', 'kiev', 'donbas'],
  gaza: ['gaza', 'israel', 'rafah', 'hamas'],
  sudan: ['sudan', 'khartoum', 'darfur'],
  myanmar: ['myanmar', 'rakhine'],
  yemen: ['yemen', 'houthi'],
  syria: ['syria', 'damascus'],
  sahel: ['sahel', 'mali', 'niger'],
  haiti: ['haiti'],
  taiwan: ['taiwan', 'taipei'],
  korea: ['korea', 'pyongyang', 'seoul'],
  india: ['india', 'delhi', 'kashmir', 'bangalore'],
  usa: ['united states', 'washington', 'new york'],
  europe: ['europe', 'london', 'eu '],
}

function project(lat, lon) {
  return {
    left: `${((Number(lon) + 180) / 360) * 100}%`,
    top: `${((90 - Number(lat)) / 180) * 100}%`,
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function matchLocal(items, h) {
  const words = [
    ...(REGION_WORDS[h.region] || []),
    ...String(h.title || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
  ]
  return (items || [])
    .filter((n) => {
      const t = `${n.title || ''} ${n.snippet || ''}`.toLowerCase()
      return words.some((w) => t.includes(w))
    })
    .slice(0, 4)
}

async function wikiHits(query) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=6&namespace=0&format=json&origin=*`,
    )
    if (!res.ok) return []
    const data = await res.json()
    const titles = data[1] || []
    const descs = data[2] || []
    const urls = data[3] || []
    return titles.map((title, i) => ({
      title,
      url: urls[i] || '',
      snippet: descs[i] || '',
      provider: 'wikipedia',
    }))
  } catch {
    return []
  }
}

export default function WorldMap2D({ className = '', expandable = false, legend = false, mini = false }) {
  const fetchWorldEvents = useJarvisStore((s) => s.fetchWorldEvents)
  const fetchHotspotBrief = useJarvisStore((s) => s.fetchHotspotBrief)
  const worldEvents = useJarvisStore((s) => s.worldEvents)
  const mapFocus = useJarvisStore((s) => s.mapFocus)
  const mapOpen = useJarvisStore((s) => s.mapOpen)
  const applyUiCommand = useJarvisStore((s) => s.applyUiCommand)
  const gestureLatest = useJarvisStore((s) => s.gestureLatest)
  const gestureOn = useJarvisStore((s) => s.gestureControlEnabled)
  const [brief, setBrief] = useState(null)
  const [busy, setBusy] = useState(false)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef(null)
  const rootRef = useRef(null)
  const lastGesture = useRef(0)

  useEffect(() => {
    fetchWorldEvents()
  }, [fetchWorldEvents])

  const hotspots = (worldEvents?.hotspots || []).length ? worldEvents.hotspots : FALLBACK_HOTSPOTS

  useEffect(() => {
    if (mini || expandable) return
    const dist = Number(mapFocus?.distance || 14)
    const nextScale = clamp(14 / Math.max(dist, 3.5), 1, 7)
    const ox = ((Number(mapFocus?.lon ?? 20) + 180) / 360) * 100
    const oy = ((90 - Number(mapFocus?.lat ?? 20)) / 180) * 100
    setScale(nextScale)
    setPan({ x: 50 - ox, y: 50 - oy })
  }, [expandable, mapFocus?.distance, mapFocus?.lat, mapFocus?.lon, mapFocus?.region, mini])

  const loadBrief = useCallback(
    async (h) => {
      const local = matchLocal([...(worldEvents?.news || []), ...(worldEvents?.hn || [])], h)
      setBusy(true)
      setBrief({ title: h.title, kind: h.kind, region: h.region, hits: [], local })
      try {
        const data = fetchHotspotBrief ? await fetchHotspotBrief(h.title, h.region || '') : { hits: [] }
        let hits = (data?.hits || []).slice(0, 8)
        if (!hits.length) hits = await wikiHits(`${h.title} ${h.region || ''}`.trim())
        setBrief({
          title: h.title,
          kind: h.kind,
          region: h.region,
          hits,
          local,
          error: data?.error,
        })
      } finally {
        setBusy(false)
      }
    },
    [fetchHotspotBrief, worldEvents?.hn, worldEvents?.news],
  )

  useEffect(() => {
    if (mini || expandable) return
    const region = mapFocus?.region
    if (!region || region === 'world') return
    const list = (worldEvents?.hotspots || []).length ? worldEvents.hotspots : FALLBACK_HOTSPOTS
    const h = list.find((x) => x.region === region)
    if (h) void loadBrief(h)
  }, [expandable, loadBrief, mapFocus?.region, mini, worldEvents?.hotspots])

  useEffect(() => {
    const el = rootRef.current
    if (!el || mini || expandable) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const dir = e.deltaY > 0 ? 0.9 : 1.12
      setScale((s) => clamp(s * dir, 1, 8))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [expandable, mini])

  useEffect(() => {
    if (mini || expandable || !gestureOn || !mapOpen) return
    const g = gestureLatest
    if (!g?.active) return
    const now = Date.now()
    if (now - lastGesture.current < 40) return
    lastGesture.current = now
    if (g.zoom) setScale((s) => clamp(s * (1 + Number(g.zoom) * 0.045), 1, 8))
    const yaw = Number(g.yaw || 0)
    const pitch = Number(g.pitch || 0)
    if (yaw || pitch) {
      setPan((p) => ({ x: p.x + yaw * 6, y: p.y - pitch * 6 }))
    }
  }, [expandable, gestureLatest, gestureOn, mapOpen, mini])

  const openPin = async (h) => {
    if (mini || expandable) {
      applyUiCommand({ type: 'ui_open_map' })
      applyUiCommand({ type: 'ui_zoom_map', params: { region: h.region || 'world' } })
      return
    }
    const ox = ((Number(h.lon) + 180) / 360) * 100
    const oy = ((90 - Number(h.lat)) / 180) * 100
    setScale((s) => clamp(Math.max(s, 3.1), 1, 8))
    setPan({ x: 50 - ox, y: 50 - oy })
    await loadBrief(h)
  }

  const onPointerDown = (e) => {
    if (mini || expandable) return
    if (e.target.closest?.('.world-map-pin, .world-map-brief, .world-map-legend')) return
    drag.current = { x: e.clientX, y: e.clientY, pan: { ...pan } }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const dx = (e.clientX - drag.current.x) / 6
    const dy = (e.clientY - drag.current.y) / 6
    setPan({ x: drag.current.pan.x + dx, y: drag.current.pan.y + dy })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <div
      ref={rootRef}
      className={`world-map-2d${legend ? ' has-legend' : ''}${mini ? ' is-mini' : ''} ${className}`}
      role={expandable || mini ? 'button' : undefined}
      tabIndex={expandable || mini ? 0 : undefined}
      onClick={() => {
        if (expandable || mini) applyUiCommand({ type: 'ui_open_map' })
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="world-map-2d-inner"
        style={{
          transform: `translate(${pan.x}%, ${pan.y}%) scale(${mini ? 1 : scale})`,
          transition: drag.current ? 'none' : 'transform 0.18s ease-out',
        }}
      >
        <img
          alt="Earth night"
          className="world-map-2d-img"
          src="https://unpkg.com/three-globe@2.44.1/example/img/earth-night.jpg"
        />
        {hotspots.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`world-map-pin${h.kind === 'watch' ? ' is-watch' : h.kind === 'tension' ? ' is-tension' : ''}`}
            style={project(h.lat, h.lon)}
            title={h.title}
            onClick={(e) => {
              e.stopPropagation()
              void openPin(h)
            }}
          >
            <span className="world-map-pin-core" />
            <span className="world-map-pin-ring" />
            {mini ? null : <span className="world-map-pin-name">{h.title}</span>}
          </button>
        ))}
      </div>
      {mini ? null : (
        <div className="world-map-2d-label">
          {(mapFocus?.label || 'WORLD')} · {scale.toFixed(1)}X · {hotspots.length} LOCKS · SCROLL / PINCH / DRAG
        </div>
      )}
      {legend ? (
        <aside className="world-map-legend">
          <div className="world-map-legend-title">HOTSPOTS</div>
          {hotspots.map((h) => (
            <button key={`lg-${h.id}`} type="button" className="world-map-legend-row" onClick={() => void openPin(h)}>
              <i className={h.kind === 'watch' ? 'is-watch' : ''} />
              {h.title}
            </button>
          ))}
        </aside>
      ) : null}
      {!mini && (brief || busy) ? (
        <article className="world-map-brief">
          <header>
            <span>BRIEF · {(brief?.title || 'LOCK').toUpperCase()}</span>
            <button type="button" onClick={() => setBrief(null)}>X</button>
          </header>
          {busy ? <p>Pulling live headlines…</p> : null}
          {(brief?.local || []).map((n) => (
            <a key={`l-${n.url || n.title}`} href={n.url || '#'} target="_blank" rel="noreferrer">
              {n.title}
            </a>
          ))}
          {(brief?.hits || []).map((n) => (
            <a key={n.url || n.title} href={n.url || '#'} target="_blank" rel="noreferrer">
              <b>{n.title}</b>
              <em>{n.snippet || n.content || ''}</em>
            </a>
          ))}
          {!busy && !(brief?.hits || []).length && !(brief?.local || []).length ? (
            <p>{brief?.error || 'No headlines returned for this lock.'}</p>
          ) : null}
        </article>
      ) : null}
    </div>
  )
}
