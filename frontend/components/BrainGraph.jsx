'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useJarvisStore } from '../app/store'
import { enrichRepo, rankRelevantNews, repoUpdateItems } from '../lib/knowledge'

/** J.A.R.V.I.S. holographic palette — layers stay distinguishable */
const BG = '#020810'
const CORE_WHITE = '#eaffff'
const NODE_LIGHT = '#7fdfff'
const NODE_MID = '#00b4e0'
const NODE_NEWS = '#7aa8ff'
const NODE_GOLD = '#ffb800'
const NODE_DEMO = '#2ee6c8'
const NODE_ONLINE = '#33f0c0'
const NODE_DEGRADED = '#ffb800'
const NODE_DOWN = '#ff4d6d'
const NODE_CONTAINER = '#8ae8ff'
const NODE_HERO = '#9af6ff'
const NODE_HERO_ALT = '#ffd56a'
const NODE_ARCHIVED = '#3d5f78'
const NODE_ACCENT = '#ff4d6d'
const NODE_ACCENT_SOFT = '#ff7a8a'
const MESH = '#3e88b0'
const MESH_DIM = '#123a58'
const MESH_NEWS = '#31456e'
const MESH_GOLD = '#5a4820'
const MESH_DEMO = '#134a40'
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
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...a),
      new THREE.Vector3(...b),
    ])
    return g
  }, [a, b])

  return (
    <line geometry={geom}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </line>
  )
}

function Core() {
  const glow = useRef()
  const ring = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (glow.current) {
      const s = 1 + Math.sin(t * 2.1) * 0.08
      glow.current.scale.setScalar(s)
      glow.current.material.emissiveIntensity = 0.75 + Math.sin(t * 2.4) * 0.25
    }
    if (ring.current) ring.current.rotation.z = t * 0.35
  })
  return (
    <group>
      <mesh ref={glow}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial
          color={CORE_WHITE}
          emissive={NODE_LIGHT}
          emissiveIntensity={0.9}
          roughness={0.22}
          metalness={0.25}
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
      <WireSphere radius={1.15} color={MESH} opacity={0.14} segments={28} />
    </group>
  )
}

function SparkField({ count = 28 }) {
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
}) {
  const [hovered, setHovered] = useState(false)
  const active = selected || hovered
  const mesh = useRef()
  const halo = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!mesh.current) return
    const base = hero ? 1.08 : archived ? 0.92 : 1
    const pulseAmp = hero ? 0.16 : pulsing ? 0.12 : accent ? 0.1 : 0.04
    const pulseSpeed = hero ? 2.6 : pulsing ? 3.2 : accent ? 2.2 : 1.4
    const pulse = base + Math.sin(t * pulseSpeed + (hero ? 0.4 : 0)) * pulseAmp
    mesh.current.scale.setScalar((active ? 1.32 : 1) * pulse)
    if (mesh.current.material) {
      mesh.current.material.emissiveIntensity = hero
        ? 1.15 + Math.sin(t * 2.8) * 0.25
        : pulsing
          ? 1.05
          : accent
            ? 0.7 + Math.sin(t * 2.1) * 0.2
            : active
              ? 0.75
              : archived
                ? 0.18
                : 0.38
    }
    if (halo.current) {
      halo.current.rotation.z = t * (hero ? 0.8 : 0.35)
      const hs = 1 + Math.sin(t * 2.2) * 0.08
      halo.current.scale.setScalar(hs)
    }
  })

  return (
    <group position={position}>
      {hero ? (
        <mesh ref={halo} rotation={[Math.PI / 2.6, 0.15, 0]}>
          <torusGeometry args={[size * 1.85, 0.012, 6, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
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
          emissiveIntensity={hero ? 1.2 : pulsing ? 1.05 : accent ? 0.75 : archived ? 0.2 : 0.4}
          roughness={archived ? 0.65 : 0.35}
          metalness={archived ? 0.1 : 0.3}
          transparent={archived}
          opacity={archived ? 0.72 : 1}
        />
      </mesh>
      {showLabel && label ? (
        <Billboard follow>
          <Text
            position={[0, size + (hero ? 0.22 : 0.16), 0]}
            fontSize={hero ? 0.155 : archived ? 0.11 : 0.13}
            color={labelColor || NODE_LIGHT}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={hero ? 0.016 : 0.012}
            outlineColor={INK}
            fillOpacity={archived ? 0.55 : hero ? 1 : 0.9}
            maxWidth={2.4}
          >
            {hero ? `◆ ${label}` : label}
          </Text>
        </Billboard>
      ) : null}
    </group>
  )
}

function buildNodes(graphProjection, repos, hnStories) {
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
      position: fibSphere(i, repoNames.length, hero ? R_MID - 0.12 : archived ? R_MID + 0.08 : R_MID),
      size: hero ? 0.28 : archived ? 0.14 : accent ? 0.2 : 0.17 + (hash(name) % 8) * 0.01,
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

  const innerCount = 14
  const inner = Array.from({ length: innerCount }, (_, i) => {
    const accent = i % 4 === 0
    return {
      id: `inner:${i}`,
      label: '',
      position: fibSphere(i, innerCount, R_INNER),
      size: 0.08 + (i % 3) * 0.014,
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
        size: 0.13,
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
        size: 0.12,
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
        size: 0.14,
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
        size: 0.17,
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
        size: 0.15,
        color,
        labelColor: color,
        shell: 'containers',
        showLabel: true,
        type: 'container',
        data: n.meta || n,
      }
    })

  const main = [...inner, ...mid]
  return { mid, main, news, updates, demos: demoNodes, sites: siteNodes, containers: containerNodes }
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

function Scene({ graphProjection, repos, hnStories, selectedId, onSelect, spinEnabled, rotateRef }) {
  const root = useRef()
  const newsLayer = useRef()
  const updatesLayer = useRef()
  const demosLayer = useRef()
  const infraLayer = useRef()
  const { mid, main, news, updates, demos, sites, containers } = useMemo(
    () => buildNodes(graphProjection, repos, hnStories),
    [graphProjection, repos, hnStories],
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

  const midLinks = useMemo(() => shellLinks(mid, R_MID, 48), [mid])
  const newsLinks = useMemo(() => shellLinks(news, R_NEWS, 24), [news])
  const updateLinks = useMemo(() => shellLinks(updates, R_UPDATES, 24), [updates])
  const demoLinks = useMemo(() => shellLinks(demos, R_DEMOS, 16), [demos])

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

  const renderDots = (nodes) =>
    nodes.map((n) => (
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
        archived={Boolean(n.archived)}
        accent={Boolean(n.accent)}
        pulsing={
          Boolean(n.hero) ||
          pulseIds.has(n.id) ||
          (n.type === 'repo' && pulseIds.has(`repo:${n.label}`))
        }
        onSelect={() => pick(n)}
      />
    ))

  return (
    <group ref={root}>
      <ambientLight intensity={0.42} color="#b0d4ff" />
      <pointLight position={[0, 0, 0]} intensity={1.25} distance={20} color={NODE_LIGHT} />
      <pointLight position={[4, 3, 5]} intensity={0.4} distance={22} color={NODE_NEWS} />
      <pointLight position={[-3, -2, 4]} intensity={0.35} distance={22} color={NODE_GOLD} />
      <pointLight position={[5, -3, 3]} intensity={0.3} distance={22} color={NODE_ACCENT_SOFT} />
      <pointLight position={[6, 5, 4]} intensity={0.45} distance={28} color="#ffffff" />

      <Core />
      <SparkField count={32} />
      <WireSphere radius={R_INNER} color={MESH} opacity={0.09} segments={32} />
      <WireSphere radius={R_MID} color={MESH} opacity={0.13} segments={40} />
      <WireSphere radius={R_NEWS} color={MESH_NEWS} opacity={0.16} segments={30} />
      <WireSphere radius={R_UPDATES} color={MESH_GOLD} opacity={0.14} segments={26} />
      <WireSphere radius={R_DEMOS} color={MESH_DEMO} opacity={0.14} segments={24} />
      <WireSphere radius={R_SITES} color={NODE_ONLINE} opacity={0.1} segments={24} />
      <WireSphere radius={R_CONTAINERS} color={NODE_CONTAINER} opacity={0.09} segments={22} />

      {midLinks.map(([a, b], i) => (
        <Line key={`m-${i}`} a={a} b={b} color={MESH} opacity={0.26} />
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
    </group>
  )
}

function GraphHud({ gestureOn, gesture, spinEnabled, inset = {} }) {
  const source = gesture?.source === 'opencv' ? 'OpenCV' : gesture?.source === 'browser' ? 'MediaPipe' : 'hands'
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

export default function BrainGraph({ hudInset } = {}) {
  const graphProjection = useJarvisStore((s) => s.graphProjection)
  const repos = useJarvisStore((s) => s.repos)
  const hnStories = useJarvisStore((s) => s.hnStories)
  const selectedNode = useJarvisStore((s) => s.selectedNode)
  const setSelectedNode = useJarvisStore((s) => s.setSelectedNode)
  const gestureControlEnabled = useJarvisStore((s) => s.gestureControlEnabled)
  const gestureLatest = useJarvisStore((s) => s.gestureLatest)
  const pollGestureLatest = useJarvisStore((s) => s.pollGestureLatest)
  const graphSpinEnabled = useJarvisStore((s) => s.graphSpinEnabled)
  const setGraphSpinEnabled = useJarvisStore((s) => s.setGraphSpinEnabled)

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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 0.6, 15.5], fov: 38, near: 0.1, far: 140 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onPointerMissed={() => setSelectedNode(null)}
        tabIndex={0}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 14, 36]} />
        <Scene
          graphProjection={graphProjection}
          repos={repos}
          hnStories={hnStories}
          selectedId={selectedNode?.id}
          onSelect={setSelectedNode}
          spinEnabled={graphSpinEnabled}
          rotateRef={rotateRef}
        />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableRotate={!handOrbitLock}
          minDistance={9}
          maxDistance={22}
          enableDamping
          dampingFactor={0.05}
          target={[0, 0, 0]}
        />
      </Canvas>
      <GraphHud
        gestureOn={gestureControlEnabled}
        gesture={gestureLatest}
        spinEnabled={graphSpinEnabled}
        inset={hudInset}
      />
    </div>
  )
}
