'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line as DreiLine, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useJarvisStore } from '../app/store'
import { enrichRepo, rankRelevantNews, repoUpdateItems } from '../lib/knowledge'

/** J.A.R.V.I.S. holographic palette — layers stay distinguishable */
const BG = '#02060e'
const CORE_WHITE = '#eaffff'
const NODE_LIGHT = '#5ce1ff'
const NODE_MID = '#2a8bb8'
const NODE_NEWS = '#4ec8ff'
const NODE_GOLD = '#ffcc66'
const NODE_ORANGE = '#ff7a18'
const NODE_DEMO = '#3ee0c8'
const NODE_ONLINE = '#3ee6b0'
const NODE_DEGRADED = '#c9a227'
const NODE_DOWN = '#ff4d5a'
const NODE_CONTAINER = '#4ec8ff'
const NODE_HERO = '#b8f4ff'
const NODE_HERO_ALT = '#7ae0ff'
const NODE_ARCHIVED = '#1a3a4a'
const NODE_ACCENT = '#ff9a3c'
const NODE_ACCENT_SOFT = '#ffb060'
const MESH = '#3ecfff'
const MESH_DIM = '#145a78'
const MESH_NEWS = '#2a6a90'
const MESH_GOLD = '#c97820'
const MESH_DEMO = '#1a6a60'
const INK = '#010609'

/** Concentric shells on one sphere — scaled to fit between side rails */
const R_INNER = 1.65
const R_MID = 2.45
const R_NEWS = 3.8
const R_UPDATES = 4.4
const R_DEMOS = 5.0
const R_SITES = 5.45
const R_CONTAINERS = 5.9

const HERO_REPOS = new Set(['corvex', 'anima', 'neuralvortex', 'drift'])
const HARDWARE_NODES = [
  { id: 'quad', name: 'Quad-KK2.1.5', label: 'QUAD · KK2.1.5' },
  { id: 'hex', name: 'Hex-F550', label: 'HEX · F550 NAZA' },
]
const SYSTEM_NODES = [
  { id: 'weather', name: 'Weather-BLR', label: 'WX · BANGALORE', type: 'weather' },
  { id: 'map', name: 'World-Map', label: 'MAP · LIVE', type: 'map' },
  { id: 'infra', name: 'Infra-Grid', label: 'INFRA · GRID', type: 'infrahub' },
]
const ARCHIVED_REPOS = new Set([
  'ai-brain',
  'ai-powered-whatsapp-chatbot',
  'ai-risk-prediction-',
  'ai-risk-prediction',
  'health-tracker-v2',
  'webcam-sketcher',
  'cv2-volume-control',
  'elevyx',
])

const FALLBACK = [
  'Corvex', 'Anima', 'NeuralVortex', 'Drift', 'Lexprobe', 'Health-AI',
  'GeoQuant', 'Athera', 'text2sql-rag', 'Drone-Vortex-Ring-Simulation',
  'Propeller-simulator', 'vortex-tracker', 'siddarthb', 'AI-BRAIN',
]

function repoKey(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
}

function isHeroRepo(name) {
  return HERO_REPOS.has(repoKey(name))
}

function isArchivedRepo(repo = {}) {
  if (repo?.archived) return true
  return ARCHIVED_REPOS.has(repoKey(repo?.name || repo))
}

function hash(s = '') {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Fibonacci sphere distribution — index must be in [0, count) */
function fibSphere(index, count, radius) {
  const n = Math.max(count, 1)
  const i = (index % n) + 0.5
  const y = 1 - (2 * i) / n
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = Math.PI * (1 + Math.sqrt(5)) * i
  return [radius * r * Math.cos(theta), radius * y, radius * r * Math.sin(theta)]
}

function WireSphere({ radius, color, opacity, segments = 36 }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, segments, Math.floor(segments * 0.65)]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

function Line({ a, b, color, opacity }) {
  const points = useMemo(() => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return null
    if (a.some((n) => !Number.isFinite(n)) || b.some((n) => !Number.isFinite(n))) return null
    return [
      new THREE.Vector3(a[0], a[1], a[2]),
      new THREE.Vector3(b[0], b[1], b[2]),
    ]
  }, [a, b])

  if (!points) return null

  return (
    <DreiLine
      points={points}
      color={color}
      transparent
      opacity={opacity}
      lineWidth={1}
      depthWrite={false}
    />
  )
}

function Core({ mood = 'idle' }) {
  const glow = useRef()
  const ring = useRef()
  const emissive =
    mood === 'thinking' ? NODE_GOLD : mood === 'speaking' ? NODE_ONLINE : NODE_LIGHT
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const speed = mood === 'thinking' ? 4.2 : mood === 'speaking' ? 3.1 : 2.1
    if (glow.current) {
      const s = 1 + Math.sin(t * speed) * (mood === 'idle' ? 0.08 : 0.14)
      glow.current.scale.setScalar(s)
      glow.current.material.emissiveIntensity = 0.75 + Math.sin(t * speed) * 0.25
    }
    if (ring.current) ring.current.rotation.z = t * (mood === 'idle' ? 0.35 : 0.9)
  })
  return (
    <group>
      <mesh ref={glow}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial
          color={CORE_WHITE}
          emissive={emissive}
          emissiveIntensity={1.45}
          roughness={0.18}
          metalness={0.2}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0.2, 0]}>
        <torusGeometry args={[0.72, 0.012, 8, 64]} />
        <meshBasicMaterial color={NODE_LIGHT} transparent opacity={0.45} />
      </mesh>
      <WireSphere radius={1.15} color={MESH} opacity={0.28} segments={28} />
    </group>
  )
}

function SparkField({ count = 90 }) {
  const group = useRef()
  const sparks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const radius = 1.3 + (hash(`spark:${i}`) % 100) / 28
        return {
          id: `spark:${i}`,
          position: fibSphere(i, count, radius),
          size: 0.02 + (i % 4) * 0.006,
          color: i % 5 === 0 ? NODE_ACCENT_SOFT : i % 3 === 0 ? NODE_GOLD : NODE_LIGHT,
          speed: 0.4 + (hash(`spd:${i}`) % 10) / 14,
          phase: (hash(`ph:${i}`) % 100) / 16,
        }
      }),
    [count],
  )

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime
    group.current.children.forEach((child, i) => {
      const spark = sparks[i]
      if (!spark || !child) return
      const breathe = 0.55 + Math.sin(t * spark.speed + spark.phase) * 0.45
      child.scale.setScalar(breathe)
      child.material.opacity = 0.25 + breathe * 0.45
    })
  })

  return (
    <group ref={group}>
      {sparks.map((spark) => (
        <mesh key={spark.id} position={spark.position}>
          <sphereGeometry args={[spark.size, 8, 8]} />
          <meshBasicMaterial color={spark.color} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Dot({
  position,
  size,
  color,
  label,
  showLabel,
  labelColor,
  onSelect,
  selected,
  pulsing,
  hero = false,
  archived = false,
  accent = false,
  dimmed = false,
  craft = false,
}) {
  const [hovered, setHovered] = useState(false)
  const active = selected || hovered
  const mesh = useRef()
  const halo = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!mesh.current) return
    const base = hero ? 1.08 : archived ? 0.92 : 1
    const pulseAmp = craft ? 0.18 : hero ? 0.16 : pulsing ? 0.12 : accent ? 0.1 : 0.05
    const pulseSpeed = hero ? 2.6 : pulsing ? 3.2 : accent ? 2.2 : 1.4
    const pulse = base + Math.sin(t * pulseSpeed + (hero ? 0.4 : 0)) * pulseAmp
    mesh.current.scale.setScalar((active ? 1.32 : 1) * pulse)
    if (mesh.current.material) {
      mesh.current.material.emissiveIntensity = craft
        ? 1.55 + Math.sin(t * 3.4) * 0.35
        : hero
          ? 1.45 + Math.sin(t * 2.8) * 0.3
          : pulsing
            ? 1.25
            : accent
              ? 0.95 + Math.sin(t * 2.1) * 0.25
              : active
                ? 1.05
                : archived
                  ? 0.22
                  : 0.72
    }
    if (halo.current) {
      halo.current.rotation.z = t * (hero ? 0.8 : 0.35)
      const hs = 1 + Math.sin(t * 2.2) * 0.08
      halo.current.scale.setScalar(hs)
    }
  })

  return (
    <group position={Array.isArray(position) && position.length === 3 && position.every((n) => Number.isFinite(n)) ? position : [0, 0, 0]}>
      {hero || craft ? (
        <mesh ref={halo} rotation={[Math.PI / 2.6, 0.15, 0]}>
          <torusGeometry args={[size * 1.85, 0.01, 6, 48]} />
          <meshBasicMaterial color={color} transparent opacity={craft ? 0.88 : 0.62} depthWrite={false} />
        </mesh>
      ) : null}
      <mesh
        ref={mesh}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'default'
        }}
      >
        <sphereGeometry args={[size, hero ? 20 : 16, hero ? 20 : 16]} />
        <meshStandardMaterial
          color={active ? CORE_WHITE : color}
          emissive={color}
          emissiveIntensity={craft ? 1.6 : hero ? 1.45 : pulsing ? 1.2 : accent ? 0.95 : archived ? 0.22 : 0.75}
          roughness={archived ? 0.65 : 0.35}
          metalness={archived ? 0.1 : 0.3}
          transparent={archived || dimmed}
          opacity={dimmed ? 0.22 : archived ? 0.72 : 1}
        />
      </mesh>
      {showLabel && label ? (
        <Html
          position={[0, size + (craft ? 0.14 : hero ? 0.16 : 0.1), 0]}
          center
          distanceFactor={16}
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            color: labelColor || NODE_LIGHT,
            fontFamily: 'var(--font-mono), monospace',
            fontSize: craft ? 7 : hero ? 8 : archived ? 6 : 7,
            letterSpacing: '0.06em',
            textShadow: `0 0 8px ${color}, 0 0 2px ${INK}`,
            opacity: archived ? 0.45 : craft || hero ? 1 : 0.72,
            userSelect: 'none',
          }}
          zIndexRange={[10, 0]}
        >
          {craft ? label : hero ? `◆ ${label}` : label}
        </Html>
      ) : null}
    </group>
  )
}

function buildNodes(graphProjection, repos, hnStories, pins = []) {
  const repoLookup = new Map((repos || []).map((r) => [r.name, enrichRepo(r)]))

  // Merge graph + store metadata so archived flags survive even if one source is thin.
  for (const node of graphProjection?.nodes || []) {
    if (node.type !== 'repo') continue
    const name = String(node.label || node.id).replace(/^repo:/, '')
    if (!name) continue
    const existing = repoLookup.get(name) || { name }
    repoLookup.set(name, enrichRepo({ ...existing, ...(node.meta || {}), name }))
  }

  let repoNames = (graphProjection?.nodes || [])
    .filter((n) => n.type === 'repo')
    .map((n) => String(n.label || n.id).replace(/^repo:/, ''))

  if (!repoNames.length) {
    repoNames = (repos || []).map((r) => r.name).filter(Boolean)
  }
  if (!repoNames.length) repoNames = FALLBACK

  // Keep heroes near the front of the shell, archived toward the end.
  repoNames = [...new Set(repoNames)].sort((a, b) => {
    const ah = isHeroRepo(a) ? 0 : isArchivedRepo(repoLookup.get(a) || { name: a }) ? 2 : 1
    const bh = isHeroRepo(b) ? 0 : isArchivedRepo(repoLookup.get(b) || { name: b }) ? 2 : 1
    if (ah !== bh) return ah - bh
    return a.localeCompare(b)
  }).slice(0, 24)

  const accentRepoIndexes = new Set()
  repoNames.forEach((name, i) => {
    if (isHeroRepo(name) || isArchivedRepo(repoLookup.get(name) || { name })) return
    if (hash(`accent:${name}`) % 7 === 0) accentRepoIndexes.add(i)
  })
  // Guarantee a couple of red accents even if hash misses.
  repoNames.forEach((name, i) => {
    if (accentRepoIndexes.size >= 3) return
    if (!isHeroRepo(name) && !isArchivedRepo(repoLookup.get(name) || { name })) accentRepoIndexes.add(i)
  })

  const midCount = repoNames.length + HARDWARE_NODES.length + SYSTEM_NODES.length
  const mid = repoNames.map((name, i) => {
    const data = repoLookup.get(name) || enrichRepo({ name })
    const hero = isHeroRepo(name)
    const archived = isArchivedRepo(data)
    const accent = !hero && !archived && accentRepoIndexes.has(i)
    const color = hero
      ? i % 2 === 0
        ? NODE_HERO
        : NODE_HERO_ALT
      : archived
        ? NODE_ARCHIVED
        : accent
          ? NODE_ACCENT
          : NODE_LIGHT
    return {
      id: `repo:${name}`,
      label: name.length > 18 ? `${name.slice(0, 17)}…` : name,
      position: fibSphere(i, midCount, hero ? R_MID - 0.12 : archived ? R_MID + 0.08 : R_MID),
      size: hero ? 0.075 : archived ? 0.035 : 0.048 + (hash(name) % 8) * 0.002,
      color,
      labelColor: color,
      shell: 'mid',
      showLabel: true,
      type: 'repo',
      hero,
      archived,
      accent,
      data: { ...data, hero, archived },
    }
  })
  HARDWARE_NODES.forEach((h, i) => {
    mid.push({
      id: `hw:${h.id}`,
      label: h.label,
      position: fibSphere(repoNames.length + i, midCount, R_MID - 0.06),
      size: 0.07,
      color: NODE_ORANGE,
      labelColor: NODE_ORANGE,
      shell: 'mid',
      showLabel: true,
      type: 'hardware',
      hero: false,
      craft: true,
      archived: false,
      accent: true,
      data: h,
    })
  })
  SYSTEM_NODES.forEach((h, i) => {
    const color = h.type === 'weather' ? NODE_ONLINE : h.type === 'map' ? NODE_NEWS : NODE_CONTAINER
    mid.push({
      id: `sys:${h.id}`,
      label: h.label,
      position: fibSphere(repoNames.length + HARDWARE_NODES.length + i, midCount, R_MID),
      size: 0.068,
      color,
      labelColor: color,
      shell: 'mid',
      showLabel: true,
      type: h.type,
      hero: false,
      craft: h.type === 'weather',
      archived: false,
      accent: true,
      data: h,
    })
  })

  const innerCount = 14
  const inner = Array.from({ length: innerCount }, (_, i) => {
    const accent = i % 4 === 0
    return {
      id: `inner:${i}`,
      label: '',
      position: fibSphere(i, innerCount, R_INNER),
      size: 0.04 + (i % 3) * 0.008,
      color: accent ? NODE_ACCENT_SOFT : NODE_MID,
      shell: 'inner',
      showLabel: false,
      type: 'node',
      accent,
      data: null,
    }
  })

  const newsRaw = []
  const updateRaw = []
  const stories = hnStories || []
  const focusRepos = [
    ...mid.filter((n) => n.hero),
    ...mid.filter((n) => !n.hero && !n.archived),
  ].slice(0, 6)
  const seenNews = new Set()

  focusRepos.forEach((repoNode) => {
    rankRelevantNews(repoNode.data, stories, 3).forEach(({ story, index }) => {
      const key = String(story?.title || index)
      if (seenNews.has(key)) return
      seenNews.add(key)
      const title = String(story?.title || 'News').trim()
      newsRaw.push({
        id: `news:${hash(key)}`,
        label: title.length > 16 ? `${title.slice(0, 15)}…` : title,
        size: 0.055,
        color: NODE_NEWS,
        labelColor: NODE_NEWS,
        shell: 'news',
        showLabel: true,
        type: 'news',
        data: story,
        parentRepo: repoNode.data.name,
      })
    })

    repoUpdateItems(repoNode.data, 3).forEach((upd, fi) => {
      updateRaw.push({
        id: `update:${repoNode.data.name}:${fi}`,
        label: upd.short,
        size: 0.05,
        color: NODE_GOLD,
        labelColor: NODE_GOLD,
        shell: 'updates',
        showLabel: true,
        type: 'update',
        data: { text: upd.text, repo: upd.repo, short: upd.short },
        parentRepo: repoNode.data.name,
      })
    })
  })

  const newsCapped = newsRaw.slice(0, 16)
  const updateCapped = updateRaw.slice(0, 16)
  const news = newsCapped.map((node, i) => ({
    ...node,
    position: fibSphere(i, Math.max(newsCapped.length, 1), R_NEWS),
  }))
  const updates = updateCapped.map((node, i) => ({
    ...node,
    position: fibSphere(i, Math.max(updateCapped.length, 1), R_UPDATES),
  }))

  const demoNodes = (graphProjection?.nodes || [])
    .filter((n) => n.type === 'demo')
    .slice(0, 10)
    .map((n, i) => {
      const title = String(n.label || n.id || 'demo')
      return {
        id: n.id,
        label: title.length > 16 ? `${title.slice(0, 15)}…` : title,
        position: fibSphere(i, Math.max(10, 1), R_DEMOS),
        size: 0.055,
        color: NODE_DEMO,
        labelColor: NODE_DEMO,
        shell: 'demos',
        showLabel: true,
        type: 'demo',
        data: n.meta || n,
      }
    })

  const siteNodes = (graphProjection?.nodes || [])
    .filter((n) => n.type === 'site')
    .slice(0, 18)
    .map((n, i, all) => {
      const status = n.meta?.status || 'unknown'
      return {
        id: n.id,
        label: `WEB · ${String(n.label || 'site').slice(0, 14)}`,
        position: fibSphere(i, Math.max(all.length, 1), R_SITES),
        size: 0.055,
        color: status === 'up' ? NODE_ONLINE : status === 'down' ? NODE_DOWN : NODE_DEGRADED,
        labelColor: status === 'up' ? NODE_ONLINE : status === 'down' ? NODE_DOWN : NODE_DEGRADED,
        shell: 'sites',
        showLabel: true,
        type: 'site',
        data: n.meta || n,
      }
    })

  const containerNodes = (graphProjection?.nodes || [])
    .filter((n) => n.type === 'container')
    .slice(0, 22)
    .map((n, i, all) => {
      const state = n.meta?.state
      const health = n.meta?.health
      const color =
        state !== 'running'
          ? NODE_DEGRADED
          : health === 'unhealthy'
            ? NODE_DOWN
            : health === 'healthy'
              ? NODE_ONLINE
              : NODE_CONTAINER
      return {
        id: n.id,
        label: `CTR · ${String(n.label || 'container').slice(0, 14)}`,
        position: fibSphere(i, Math.max(all.length, 1), R_CONTAINERS),
        size: 0.055,
        color,
        labelColor: color,
        shell: 'containers',
        showLabel: true,
        type: 'container',
        data: n.meta || n,
      }
    })

  const pinNodes = (pins || []).slice(0, 3).map((p, i) => ({
    id: p.id || `pin:${i}`,
    label: String(p.title || 'PIN').slice(0, 22),
    position: fibSphere(i, Math.max((pins || []).length, 3), R_INNER + 0.55),
    size: 0.14,
    color: NODE_GOLD,
    labelColor: NODE_GOLD,
    shell: 'pins',
    showLabel: true,
    type: 'pin',
    data: p,
  }))

  const main = [...inner, ...mid]
  return { mid, main, news, updates, demos: demoNodes, sites: siteNodes, containers: containerNodes, pins: pinNodes }
}

function shellLinks(nodes, radius, maxLinks = 28) {
  const links = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = new THREE.Vector3(...nodes[i].position)
      const b = new THREE.Vector3(...nodes[j].position)
      if (a.distanceTo(b) < radius * 1.05) links.push([nodes[i].position, nodes[j].position])
    }
  }
  return links.slice(0, maxLinks)
}

function Scene({
  graphProjection,
  repos,
  hnStories,
  pins,
  selectedId,
  onSelect,
  spinEnabled,
  rotateRef,
  scanHits,
  scanQuery,
  controlsRef,
  coreMood,
}) {
  const root = useRef()
  const newsLayer = useRef()
  const updatesLayer = useRef()
  const demosLayer = useRef()
  const infraLayer = useRef()
  const { camera } = useThree()
  const flown = useRef('')
  const { mid, main, news, updates, demos, sites, containers, pins: pinNodes } = useMemo(
    () => buildNodes(graphProjection, repos, hnStories, pins),
    [graphProjection, repos, hnStories, pins],
  )

  const pulseIds = useMemo(() => {
    const now = Date.now() / 1000
    const set = new Set()
    for (const p of graphProjection?.pulses || []) {
      const age = typeof p.ts === 'number' ? now - p.ts : 0
      if (age >= 0 && age < 8) {
        if (p.node_id) set.add(String(p.node_id))
        // Also pulse core on any recent bus event
        set.add('jarvis')
      }
    }
    // Demo / research / action events → pulse matching nodes
    for (const p of graphProjection?.pulses || []) {
      const reason = String(p.reason || '')
      if (reason.includes('demo') || reason.includes('research')) {
        for (const d of demos || []) set.add(d.id)
      }
      if (reason.includes('action') || reason.includes('confirm')) {
        set.add('jarvis')
      }
    }
    return set
  }, [graphProjection?.pulses, demos])

  const repoLinks = useMemo(() => {
    const pos = new Map()
    for (const n of mid) {
      const name = n.data?.name || n.label
      pos.set(`repo:${name}`, n.position)
      pos.set(n.id, n.position)
    }
    const out = []
    for (const e of graphProjection?.edges || []) {
      const src = String(e.source || '')
      const tgt = String(e.target || '')
      const repoPair = src.startsWith('repo:') && tgt.startsWith('repo:')
      if (e.kind !== 'library' && !(e.kind === 'related' && repoPair)) continue
      const a = pos.get(src)
      const b = pos.get(tgt)
      if (!a || !b) continue
      out.push({
        a,
        b,
        color: e.kind === 'library' ? NODE_GOLD : MESH,
        opacity: scanHits?.size ? 0.7 : e.kind === 'library' ? 0.5 : 0.2,
        libs: e.libs || [],
      })
    }
    return out.slice(0, 48)
  }, [mid, graphProjection, scanHits])
  const newsLinks = useMemo(() => shellLinks(news, R_NEWS, 24), [news])
  const updateLinks = useMemo(() => shellLinks(updates, R_UPDATES, 24), [updates])
  const demoLinks = useMemo(() => shellLinks(demos, R_DEMOS, 16), [demos])

  useEffect(() => {
    if (!scanHits?.size) return
    const first = mid.find((n) => scanHits.has(String(n.data?.name || '').toLowerCase()))
    if (!first || !Array.isArray(first.position)) return
    const key = `${scanQuery || ''}:${[...scanHits].join(',')}`
    if (flown.current === key) return
    flown.current = key
    const [x, y, z] = first.position
    const dest = new THREE.Vector3(x, y, z).normalize().multiplyScalar(11)
    camera.position.copy(dest)
    if (controlsRef?.current) {
      controlsRef.current.target.set(x * 0.12, y * 0.12, z * 0.12)
      controlsRef.current.update()
    }
  }, [scanHits, scanQuery, mid, camera, controlsRef])

  useFrame((_, dt) => {
    if (root.current) {
      if (spinEnabled) root.current.rotation.y += dt * 0.055
      const ext = rotateRef?.current
      if (ext) {
        root.current.rotation.y += (ext.yaw || 0) * dt * 2.2
        root.current.rotation.x += (ext.pitch || 0) * dt * 2.0
        root.current.rotation.x = Math.max(-0.7, Math.min(0.7, root.current.rotation.x))
      }
    }
    if (newsLayer.current && spinEnabled) newsLayer.current.rotation.y -= dt * 0.022
    if (updatesLayer.current && spinEnabled) updatesLayer.current.rotation.y += dt * 0.016
    if (demosLayer.current && spinEnabled) demosLayer.current.rotation.y -= dt * 0.012
    if (infraLayer.current && spinEnabled) infraLayer.current.rotation.y += dt * 0.01
  })

  const pick = (n) =>
    onSelect({
      id: n.id,
      label:
        n.type === 'news'
          ? n.data?.title || n.label
          : n.type === 'update'
            ? n.data?.short || n.label
            : n.type === 'demo'
              ? n.data?.title || n.label
              : n.label || n.id,
      type: n.type,
      data: n.data,
      position: n.position,
    })

  const scanning = Boolean(scanHits?.size)
  const renderDots = (nodes) =>
    nodes.map((n) => {
      const repoName = String(n.data?.name || n.label || '').toLowerCase()
      const hit = n.type === 'repo' && scanHits?.has(repoName)
      return (
      <Dot
        key={n.id}
        position={n.position}
        size={n.size}
        color={n.color}
        label={n.label}
        labelColor={n.labelColor}
        showLabel={n.showLabel}
        selected={selectedId === n.id}
        hero={Boolean(n.hero)}
        craft={Boolean(n.craft) || n.type === 'hardware'}
        archived={Boolean(n.archived)}
        accent={Boolean(n.accent) || hit}
        dimmed={scanning && n.type === 'repo' && !hit}
        pulsing={
          Boolean(n.hero) ||
          pulseIds.has(n.id) ||
          (n.type === 'repo' && pulseIds.has(`repo:${n.label}`)) ||
          hit
        }
        onSelect={() => pick(n)}
      />
      )
    })

  return (
    <group ref={root}>
      <ambientLight intensity={0.62} color="#c8f4ff" />
      <pointLight position={[0, 0, 0]} intensity={2.1} distance={22} color={NODE_LIGHT} />
      <pointLight position={[4, 3, 5]} intensity={0.85} distance={24} color={NODE_NEWS} />
      <pointLight position={[-3, -2, 4]} intensity={0.7} distance={22} color={NODE_ORANGE} />
      <pointLight position={[5, -3, 3]} intensity={0.55} distance={22} color={NODE_ACCENT_SOFT} />
      <pointLight position={[6, 5, 4]} intensity={0.8} distance={28} color="#ffffff" />

      <Core mood={coreMood} />
      <SparkField count={96} />
      <WireSphere radius={R_INNER} color={MESH} opacity={0.18} segments={32} />
      <WireSphere radius={R_MID} color={MESH} opacity={0.24} segments={40} />
      <WireSphere radius={R_NEWS} color={MESH_NEWS} opacity={0.2} segments={30} />
      <WireSphere radius={R_UPDATES} color={MESH_GOLD} opacity={0.16} segments={26} />
      <WireSphere radius={R_DEMOS} color={MESH_DEMO} opacity={0.16} segments={24} />
      <WireSphere radius={R_SITES} color={NODE_ONLINE} opacity={0.14} segments={24} />
      <WireSphere radius={R_CONTAINERS} color={NODE_CONTAINER} opacity={0.12} segments={22} />

      {repoLinks.map((lnk, i) => (
        <Line key={`lib-${i}`} a={lnk.a} b={lnk.b} color={lnk.color} opacity={lnk.opacity} />
      ))}

      {main.map((n) => (
        <Line
          key={`r-${n.id}`}
          a={[0, 0, 0]}
          b={n.position}
          color={n.hero ? n.color : n.accent ? NODE_ACCENT : n.archived ? NODE_ARCHIVED : MESH_DIM}
          opacity={n.hero ? 0.45 : n.accent ? 0.28 : n.archived ? 0.12 : 0.2}
        />
      ))}

      {renderDots(main)}

      <group ref={newsLayer}>
        {news.map((n) => (
          <Line key={`nr-${n.id}`} a={[0, 0, 0]} b={n.position} color={NODE_NEWS} opacity={0.2} />
        ))}
        {newsLinks.map(([a, b], i) => (
          <Line key={`nl-${i}`} a={a} b={b} color={NODE_NEWS} opacity={0.18} />
        ))}
        {renderDots(news)}
      </group>

      <group ref={updatesLayer}>
        {updates.map((n) => (
          <Line key={`ur-${n.id}`} a={[0, 0, 0]} b={n.position} color={NODE_GOLD} opacity={0.2} />
        ))}
        {updateLinks.map(([a, b], i) => (
          <Line key={`ul-${i}`} a={a} b={b} color={NODE_GOLD} opacity={0.16} />
        ))}
        {renderDots(updates)}
      </group>

      <group ref={demosLayer}>
        {demos.map((n) => (
          <Line key={`dr-${n.id}`} a={[0, 0, 0]} b={n.position} color={NODE_DEMO} opacity={0.22} />
        ))}
        {demoLinks.map(([a, b], i) => (
          <Line key={`dl-${i}`} a={a} b={b} color={NODE_DEMO} opacity={0.14} />
        ))}
        {renderDots(demos)}
      </group>

      <group ref={infraLayer}>
        {sites.map((n) => (
          <Line key={`sr-${n.id}`} a={[0, 0, 0]} b={n.position} color={n.color} opacity={0.28} />
        ))}
        {containers.map((n) => (
          <Line key={`cr-${n.id}`} a={[0, 0, 0]} b={n.position} color={n.color} opacity={0.18} />
        ))}
        {renderDots(sites)}
        {renderDots(containers)}
      </group>
      {renderDots(pinNodes || [])}
      {(() => {
        const sel = mid.find((n) => n.id === selectedId && n.type === 'repo')
        return sel ? <RepoWorkbench node={sel} /> : null
      })()}
    </group>
  )
}

function RepoWorkbench({ node }) {
  const runLibraryScan = useJarvisStore((s) => s.runLibraryScan)
  const fetchXray = useJarvisStore((s) => s.fetchXray)
  const askFocusedRepo = useJarvisStore((s) => s.askFocusedRepo)
  const grantRepoLlmConsent = useJarvisStore((s) => s.grantRepoLlmConsent)
  const pending = useJarvisStore((s) => s.pendingRepoAsk)
  const xrayView = useJarvisStore((s) => s.xrayView)
  const graphAskReply = useJarvisStore((s) => s.graphAskReply)
  const name = node.data?.name || node.label
  const deps = Object.keys(node.data?.key_deps || {}).slice(0, 10)
  const scanTarget = deps[0] || name
  return (
    <Html
      position={[node.position[0], node.position[1] + 0.35, node.position[2]]}
      center
      distanceFactor={10}
      zIndexRange={[50, 10]}
      style={{ pointerEvents: 'auto' }}
    >
      <div className="graph-workbench">
        <div className="graph-workbench-scanline" aria-hidden />
        <b>{name}</b>
        <div className="graph-workbench-actions">
          <button type="button" onClick={() => runLibraryScan(scanTarget)}>SCAN THIS</button>
          <button type="button" onClick={() => fetchXray(name)}>X-RAY</button>
          <button type="button" onClick={() => askFocusedRepo(name)}>ASK</button>
        </div>
        {pending ? (
          <button type="button" className="graph-workbench-consent" onClick={grantRepoLlmConsent}>
            SEND THIS REPO CONTEXT TO LLM
          </button>
        ) : null}
        {xrayView?.name === name && xrayView.deps ? (
          <div className="graph-workbench-deps">
            {Object.keys(xrayView.deps).slice(0, 12).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        ) : deps.length ? (
          <div className="graph-workbench-deps">
            {deps.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        ) : null}
        {graphAskReply ? <pre className="graph-workbench-reply">{graphAskReply.slice(0, 900)}</pre> : null}
      </div>
    </Html>
  )
}

function GraphCommandHud() {
  const [scanQ, setScanQ] = useState('')
  const [webQ, setWebQ] = useState('')
  const runLibraryScan = useJarvisStore((s) => s.runLibraryScan)
  const runRadarSearch = useJarvisStore((s) => s.runRadarSearch)
  const radarHits = useJarvisStore((s) => s.radarHits)
  const webSummary = useJarvisStore((s) => s.webSummary)
  const summarizeWebHit = useJarvisStore((s) => s.summarizeWebHit)
  const pinWebHit = useJarvisStore((s) => s.pinWebHit)
  const askAboutUrl = useJarvisStore((s) => s.askAboutUrl)
  const clearHud = useJarvisStore((s) => s.clearHud)
  const scanSweep = useJarvisStore((s) => s.scanSweep)
  return (
    <div className="graph-cmd-hud">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          runLibraryScan(scanQ)
        }}
      >
        <input value={scanQ} onChange={(e) => setScanQ(e.target.value)} placeholder="scan library…" />
        <button type="submit">SCAN</button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          runRadarSearch(webQ)
        }}
      >
        <input value={webQ} onChange={(e) => setWebQ(e.target.value)} placeholder="web intel…" />
        <button type="submit">SEARCH</button>
      </form>
      <button type="button" onClick={clearHud}>CLEAR</button>
      {scanSweep?.github_error ? (
        <div className="graph-cmd-err">SEARCH UNAVAILABLE · {scanSweep.github_error}</div>
      ) : null}
      {webSummary?.summary ? <pre className="graph-cmd-summary">{webSummary.summary}</pre> : null}
      {(radarHits || []).slice(0, 5).map((h) => (
        <div key={h.url} className="graph-cmd-hit">
          <span>{h.title || h.url}</span>
          <button type="button" onClick={() => summarizeWebHit(h)}>SUMMARIZE</button>
          <button type="button" onClick={() => pinWebHit(h)}>PIN</button>
          <button type="button" onClick={() => askAboutUrl(h)}>ASK</button>
        </div>
      ))}
    </div>
  )
}

function GraphHud({ gestureOn, gesture, spinEnabled, inset = {} }) {
  const waiting =
    gesture?.source === 'opencv'
      ? 'Waiting for OpenCV…'
      : 'Show palm to rotate · pinch zoom · point select'
  const left = inset.left ?? 12
  const bottom = inset.bottom ?? 12
  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom,
        zIndex: 5,
        maxWidth: inset.maxWidth || 320,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-dim)',
        background: 'rgba(2,10,20,0.85)',
        border: '1px solid rgba(0,217,255,0.2)',
        padding: '8px 10px',
        borderRadius: 2,
        pointerEvents: 'none',
        lineHeight: 1.6,
        boxShadow: 'inset 0 0 14px rgba(0,217,255,0.05)',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div style={{ color: 'var(--cyan)', letterSpacing: '0.12em', marginBottom: 4 }}>
        ◆ HERO · CORVEX / ANIMA / NEURALVORTEX / DRIFT
      </div>
      <div style={{ opacity: 0.75, marginBottom: 6 }}>
        ARCHIVED DIM · ACCENT RED · LIVE SPARKS
      </div>
      {gestureOn ? (
        <>
          HAND · {source} · {gesture?.hands || 0}/2 · {(gesture?.gesture || 'none').toUpperCase()}
          <br />
          {gesture?.message || waiting}
          {gesture?.selectTarget ? (
            <>
              <br />
              AIM · {gesture.selectTarget}
            </>
          ) : null}
          {gesture?.cannedGestures?.length ? (
            <>
              <br />
              MP · {gesture.cannedGestures.join(' + ')}
            </>
          ) : null}
          {gesture?.handGestures?.length ? (
            <>
              <br />
              MAP · {gesture.handGestures.join(' + ')}
            </>
          ) : null}
        </>
      ) : (
        <>
          MOUSE · drag orbit · scroll zoom
          <br />
          KEYS · ←→↑↓ · +/− · 1–9 · R reset · S spin
          <br />
          LAYERS · repos · blue news · gold updates · teal demos
        </>
      )}
      <br />
      SPIN · {spinEnabled ? 'ON' : 'OFF'}
    </div>
  )
}

function GraphErrorFallback({ error, onRetry }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: BG,
        color: NODE_DOWN,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: '0.08em',
        textAlign: 'center',
        padding: 24,
        gap: 12,
      }}
    >
      <div>BRAIN GRAPH FAULT</div>
      <div style={{ color: 'var(--text-dim)', maxWidth: 420 }}>{String(error?.message || error || 'Unknown render error')}</div>
      <button type="button" className="btn" onClick={onRetry}>
        RELOAD GRAPH
      </button>
    </div>
  )
}

class BrainGraphBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[BrainGraph]', error)
  }

  render() {
    if (this.state.error) {
      return (
        <GraphErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

export default function BrainGraph({ hudInset, compact = false } = {}) {
  const graphProjection = useJarvisStore((s) => s.graphProjection)
  const repos = useJarvisStore((s) => s.repos)
  const hnStories = useJarvisStore((s) => s.hnStories)
  const selectedNode = useJarvisStore((s) => s.selectedNode)
  const setSelectedNode = useJarvisStore((s) => s.setSelectedNode)
  const applyUiCommand = useJarvisStore((s) => s.applyUiCommand)
  const gestureControlEnabled = useJarvisStore((s) => s.gestureControlEnabled)
  const gestureLatest = useJarvisStore((s) => s.gestureLatest)
  const pollGestureLatest = useJarvisStore((s) => s.pollGestureLatest)
  const graphSpinEnabled = useJarvisStore((s) => s.graphSpinEnabled)
  const setGraphSpinEnabled = useJarvisStore((s) => s.setGraphSpinEnabled)
  const scanSweep = useJarvisStore((s) => s.scanSweep)
  const ingestCinema = useJarvisStore((s) => s.ingestCinema)
  const ephemeralPins = useJarvisStore((s) => s.ephemeralPins)
  const voiceState = useJarvisStore((s) => s.voiceState)
  const isLoading = useJarvisStore((s) => s.isLoading)
  const coreMood = isLoading || voiceState === 'thinking' ? 'thinking' : voiceState === 'speaking' ? 'speaking' : 'idle'
  const scanHits = useMemo(
    () => new Set((scanSweep?.hits || []).map((h) => String(h.repo || '').toLowerCase())),
    [scanSweep],
  )

  const controlsRef = useRef(null)
  const rotateRef = useRef({ yaw: 0, pitch: 0 })
  const lastSelectTs = useRef(0)
  const [kbRotate, setKbRotate] = useState({ yaw: 0, pitch: 0 })
  const repoNodes = useMemo(() => {
    const names = (repos || []).map((r) => r.name).filter(Boolean)
    return names.length ? names : FALLBACK
  }, [repos])

  useEffect(() => {
    if (!gestureControlEnabled) return undefined
    // Only poll backend when OpenCV script owns the session
    const session = useJarvisStore.getState().gestureSession
    if (gestureLatest?.source === 'browser' || session?.source === 'browser') return undefined
    if (session?.source !== 'opencv') return undefined
    const id = setInterval(() => {
      pollGestureLatest()
    }, 50)
    return () => clearInterval(id)
  }, [gestureControlEnabled, pollGestureLatest, gestureLatest?.source])

  const handOrbitLock = Boolean(gestureControlEnabled && gestureLatest?.active)

  useEffect(() => {
    if (!gestureControlEnabled || !gestureLatest) {
      rotateRef.current = { yaw: kbRotate.yaw, pitch: kbRotate.pitch }
      return
    }
    rotateRef.current = {
      yaw: (gestureLatest.yaw || 0) + kbRotate.yaw,
      pitch: (gestureLatest.pitch || 0) + kbRotate.pitch,
    }

    const zoom = gestureLatest.zoom || 0
    if (controlsRef.current && Math.abs(zoom) > 0.002) {
      const cam = controlsRef.current.object
      const dir = new THREE.Vector3()
      cam.getWorldDirection(dir)
      // Positive zoom = hands apart / expand = move camera back (pull away)
      // Negative = minimize / pinch = move camera forward
      const step = zoom > 0 ? -Math.abs(zoom) * 0.95 : Math.abs(zoom) * 0.95
      cam.position.addScaledVector(dir, step)
      // Clamp distance from origin
      const d = cam.position.length()
      if (d < 9) cam.position.setLength(9)
      if (d > 28) cam.position.setLength(28)
      controlsRef.current.update()
    }

    const sel = gestureLatest.select || 0
    const now = Date.now()
    if (sel && now - lastSelectTs.current > 450) {
      lastSelectTs.current = now
      if (sel === -1 && controlsRef.current) {
        controlsRef.current.reset()
        setSelectedNode(null)
      } else if (sel === -2) {
        setSelectedNode(null)
      } else if (sel === 2) {
        setGraphSpinEnabled(!useJarvisStore.getState().graphSpinEnabled)
      } else if (sel === 3 && controlsRef.current) {
        // Expand — pull camera back
        const cam = controlsRef.current.object
        const dir = new THREE.Vector3()
        cam.getWorldDirection(dir)
        cam.position.addScaledVector(dir, -2.2)
        if (cam.position.length() > 26) cam.position.setLength(26)
        controlsRef.current.update()
      } else if (sel === 4 && controlsRef.current) {
        // Minimize — push in
        const cam = controlsRef.current.object
        const dir = new THREE.Vector3()
        cam.getWorldDirection(dir)
        cam.position.addScaledVector(dir, 2.0)
        if (cam.position.length() < 10) cam.position.setLength(10)
        controlsRef.current.update()
      } else if (sel === 1) {
        const name =
          gestureLatest.selectTarget ||
          (typeof gestureLatest.hoverIndex === 'number' ? repoNodes[gestureLatest.hoverIndex] : null)
        if (name) {
          const repo = (repos || []).find((r) => r.name === name) || { name }
          setSelectedNode({ id: `repo:${name}`, label: name, type: 'repo', data: repo })
        }
      }
    }
  }, [
    gestureControlEnabled,
    gestureLatest,
    kbRotate,
    repoNodes,
    repos,
    setSelectedNode,
    setGraphSpinEnabled,
  ])

  useEffect(() => {
    const down = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') setKbRotate((r) => ({ ...r, yaw: -0.9 }))
      if (e.key === 'ArrowRight') setKbRotate((r) => ({ ...r, yaw: 0.9 }))
      if (e.key === 'ArrowUp') setKbRotate((r) => ({ ...r, pitch: -0.7 }))
      if (e.key === 'ArrowDown') setKbRotate((r) => ({ ...r, pitch: 0.7 }))
      if (e.key === '=' || e.key === '+') {
        if (controlsRef.current) {
          const cam = controlsRef.current.object
          const dir = new THREE.Vector3()
          cam.getWorldDirection(dir)
          cam.position.addScaledVector(dir, 0.4)
          controlsRef.current.update()
        }
      }
      if (e.key === '-' || e.key === '_') {
        if (controlsRef.current) {
          const cam = controlsRef.current.object
          const dir = new THREE.Vector3()
          cam.getWorldDirection(dir)
          cam.position.addScaledVector(dir, -0.4)
          controlsRef.current.update()
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        controlsRef.current?.reset?.()
        setSelectedNode(null)
      }
      if (e.key === 's' || e.key === 'S') {
        setGraphSpinEnabled(!useJarvisStore.getState().graphSpinEnabled)
      }
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1
        const name = repoNodes[idx]
        if (name) {
          const repo = (repos || []).find((r) => r.name === name) || { name }
          setSelectedNode({ id: `repo:${name}`, label: name, type: 'repo', data: repo })
        }
      }
    }
    const up = (e) => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) setKbRotate((r) => ({ ...r, yaw: 0 }))
      if (['ArrowUp', 'ArrowDown'].includes(e.key)) setKbRotate((r) => ({ ...r, pitch: 0 }))
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [repoNodes, repos, setSelectedNode, setGraphSpinEnabled])

  return (
    <BrainGraphBoundary>
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <Canvas
          camera={{ position: compact ? [0, 0.15, 7.6] : [0, 0.35, 12.2], fov: compact ? 52 : 42, near: 0.1, far: 140 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          style={{ background: 'transparent' }}
          onPointerMissed={() => setSelectedNode(null)}
          onCreated={({ gl }) => {
            gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
          }}
          tabIndex={0}
        >
          {compact ? null : <color attach="background" args={[BG]} />}
          <fog attach="fog" args={compact ? [BG, 18, 42] : [BG, 14, 36]} />
          <Scene
            graphProjection={graphProjection}
            repos={repos}
            hnStories={hnStories}
            pins={ephemeralPins}
            selectedId={selectedNode?.id}
            onSelect={(n) => {
              setSelectedNode(n)
              if (n?.type === 'hardware') {
                applyUiCommand({ type: 'ui_show_hardware', params: { id: n.data?.id || n.id } })
              } else if (n?.type === 'repo') {
                applyUiCommand({ type: 'ui_open_project', params: { name: n.data?.name || n.label } })
              } else if (n?.type === 'weather') {
                applyUiCommand({ type: 'ui_show_weather' })
              } else if (n?.type === 'map') {
                applyUiCommand({ type: 'ui_open_map' })
              } else if (n?.type === 'infrahub' || n?.type === 'site' || n?.type === 'container') {
                window.location.hash = '#infra'
              } else {
                useJarvisStore.setState({ stageHardware: null, stageProject: null, mapOpen: false })
              }
            }}
            spinEnabled={graphSpinEnabled}
            rotateRef={rotateRef}
            scanHits={scanHits}
            scanQuery={scanSweep?.query}
            controlsRef={controlsRef}
            coreMood={coreMood}
          />
          {/* compact dash uses default sphere scale */}
          <OrbitControls
            ref={controlsRef}
            enablePan={false}
            enableRotate={!handOrbitLock}
            minDistance={compact ? 5.4 : 9}
            maxDistance={compact ? 14 : 22}
            enableDamping
            dampingFactor={0.05}
            target={[0, 0, 0]}
          />
        </Canvas>
        {compact ? null : <GraphCommandHud />}
        {compact ? null : (
          <GraphHud
            gestureOn={gestureControlEnabled}
            gesture={gestureLatest}
            spinEnabled={graphSpinEnabled}
            inset={hudInset}
          />
        )}
        {scanSweep?.query && Date.now() - (scanSweep.t0 || 0) < 12000 ? (
          <div className="graph-scan-banner">
            <div className="graph-scan-ring" />
            SCAN · {String(scanSweep.query).toUpperCase()} · {scanSweep.hits?.length || 0} LOCKS
            {scanSweep.github_error ? ` · SEARCH UNAVAILABLE · ${scanSweep.github_error}` : ''}
            <div className="graph-scan-stamps">
              {(scanSweep.hits || []).slice(0, 8).map((h) => (
                <span key={`${h.repo}-${h.kind}-${h.path || ''}`} className={`stamp stamp-${String(h.kind || 'META').toLowerCase()}`}>
                  {h.kind} {h.repo}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {ingestCinema?.active || (ingestCinema?.files || []).length ? (
          <div className="ingest-rain" aria-hidden>
            {(ingestCinema.files || ['reading tree…', 'main.py', 'requirements.txt']).map((f, i) => (
              <div key={`${f}-${i}`} className="ingest-line" style={{ animationDelay: `${i * 0.12}s` }}>
                {f}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </BrainGraphBoundary>
  )
}
