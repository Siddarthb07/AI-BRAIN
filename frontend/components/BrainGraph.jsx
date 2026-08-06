'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useJarvisStore } from '../app/store'
import { enrichRepo, rankRelevantNews, repoUpdateItems } from '../lib/knowledge'

/** Palette matched to the reference MEMORY MAP sphere */
const BG = '#050a0f'
const CORE_WHITE = '#e8f4ff'
const NODE_LIGHT = '#a5d8ff'
const NODE_MID = '#4a90d9'
const NODE_DARK = '#1e50a2'
const NODE_NEWS = '#c084fc'
const NODE_GOLD = '#f0b429'
const NODE_DEMO = '#34d399'
const MESH = '#6a8aaa'
const MESH_DIM = '#1a3a5c'
const LINE_OUTER = '#0d2a4a'
const MESH_NEWS = '#5a3a78'
const MESH_GOLD = '#5a4820'
const MESH_DEMO = '#1a4a3a'
const INK = '#02060c'

/** Concentric shells on one sphere — scaled to fit between side rails */
const R_INNER = 1.65
const R_MID = 2.45
const R_OUTER = 3.15
const R_NEWS = 3.8
const R_UPDATES = 4.4
const R_DEMOS = 5.0

const FALLBACK = [
  'AI-BRAIN', 'Lexprobe', 'NeuralVortex', 'Health-AI', 'GeoQuant',
  'Athera', 'Anima', 'text2sql-rag', 'Drone-Vortex-Ring-Simulation',
  'Propeller-simulator', 'vortex-tracker', 'siddarthb',
]

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
  useFrame(({ clock }) => {
    if (!glow.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 1.8) * 0.06
    glow.current.scale.setScalar(s)
  })
  return (
    <group>
      <mesh ref={glow}>
        <sphereGeometry args={[0.38, 32, 32]} />
        <meshStandardMaterial
          color={CORE_WHITE}
          emissive={NODE_LIGHT}
          emissiveIntensity={0.85}
          roughness={0.25}
          metalness={0.2}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <WireSphere radius={1.15} color={MESH} opacity={0.12} segments={28} />
    </group>
  )
}

function Dot({ position, size, color, label, showLabel, labelColor, onSelect, selected, pulsing }) {
  const [hovered, setHovered] = useState(false)
  const active = selected || hovered
  const mesh = useRef()

  useFrame(({ clock }) => {
    if (!mesh.current) return
    const pulse = pulsing ? 1 + Math.sin(clock.elapsedTime * 6) * 0.28 : 1
    mesh.current.scale.setScalar((active ? 1.35 : 1) * pulse)
  })

  return (
    <group position={position}>
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
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={active ? CORE_WHITE : color}
          emissive={color}
          emissiveIntensity={pulsing ? 1.1 : active ? 0.7 : 0.35}
          roughness={0.4}
          metalness={0.25}
        />
      </mesh>
      {showLabel && label ? (
        <Billboard follow>
          <Text
            position={[0, size + 0.16, 0]}
            fontSize={0.13}
            color={labelColor || NODE_LIGHT}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.012}
            outlineColor={INK}
            fillOpacity={0.88}
            maxWidth={2.2}
          >
            {label}
          </Text>
        </Billboard>
      ) : null}
    </group>
  )
}

function buildNodes(graphProjection, repos, hnStories) {
  const repoLookup = new Map((repos || []).map((r) => [r.name, enrichRepo(r)]))

  let repoNames = (graphProjection?.nodes || [])
    .filter((n) => n.type === 'repo')
    .map((n) => String(n.label || n.id).replace(/^repo:/, ''))

  if (!repoNames.length) {
    repoNames = (repos || []).map((r) => r.name).filter(Boolean)
  }
  if (!repoNames.length) repoNames = FALLBACK
  repoNames = repoNames.slice(0, 24)

  const mid = repoNames.map((name, i) => {
    const data = repoLookup.get(name) || enrichRepo({ name })
    return {
      id: `repo:${name}`,
      label: name.length > 18 ? `${name.slice(0, 17)}…` : name,
      position: fibSphere(i, repoNames.length, R_MID),
      size: 0.18 + (hash(name) % 8) * 0.01,
      color: NODE_LIGHT,
      shell: 'mid',
      showLabel: true,
      type: 'repo',
      data,
    }
  })

  const outerCount = 14
  const outer = Array.from({ length: outerCount }, (_, i) => ({
    id: `outer:${i}`,
    label: '',
    position: fibSphere(i, outerCount, R_OUTER),
    size: 0.14 + (i % 4) * 0.018,
    color: NODE_DARK,
    shell: 'outer',
    showLabel: false,
    type: 'node',
    data: null,
  }))

  const innerCount = 12
  const inner = Array.from({ length: innerCount }, (_, i) => ({
    id: `inner:${i}`,
    label: '',
    position: fibSphere(i, innerCount, R_INNER),
    size: 0.09 + (i % 3) * 0.012,
    color: NODE_MID,
    shell: 'inner',
    showLabel: false,
    type: 'node',
    data: null,
  }))

  const newsRaw = []
  const updateRaw = []
  const stories = hnStories || []
  const focusRepos = mid.slice(0, 6)
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

  const main = [...inner, ...mid, ...outer]
  return { mid, main, news, updates, demos: demoNodes }
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
  const { mid, main, news, updates, demos } = useMemo(
    () => buildNodes(graphProjection, repos, hnStories),
    [graphProjection, repos, hnStories],
  )

  const pulseIds = useMemo(() => {
    const now = Date.now() / 1000
    const set = new Set()
    for (const p of graphProjection?.pulses || []) {
      const age = typeof p.ts === 'number' ? now - p.ts : 0
      if (age >= 0 && age < 45) {
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
      if (spinEnabled) root.current.rotation.y += dt * 0.045
      const ext = rotateRef?.current
      if (ext) {
        root.current.rotation.y += (ext.yaw || 0) * dt * 2.2
        root.current.rotation.x += (ext.pitch || 0) * dt * 2.0
        root.current.rotation.x = Math.max(-0.7, Math.min(0.7, root.current.rotation.x))
      }
    }
    if (newsLayer.current && spinEnabled) newsLayer.current.rotation.y -= dt * 0.018
    if (updatesLayer.current && spinEnabled) updatesLayer.current.rotation.y += dt * 0.012
    if (demosLayer.current && spinEnabled) demosLayer.current.rotation.y -= dt * 0.01
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
        pulsing={pulseIds.has(n.id) || (n.type === 'repo' && pulseIds.has(`repo:${n.label}`))}
        onSelect={() => pick(n)}
      />
    ))

  return (
    <group ref={root}>
      <ambientLight intensity={0.4} color="#b0d4ff" />
      <pointLight position={[0, 0, 0]} intensity={1.1} distance={20} color={NODE_LIGHT} />
      <pointLight position={[4, 3, 5]} intensity={0.35} distance={22} color={NODE_NEWS} />
      <pointLight position={[-3, -2, 4]} intensity={0.3} distance={22} color={NODE_GOLD} />
      <pointLight position={[5, -3, 3]} intensity={0.25} distance={22} color={NODE_DEMO} />
      <pointLight position={[6, 5, 4]} intensity={0.4} distance={28} color="#ffffff" />

      <Core />
      <WireSphere radius={R_INNER} color={MESH} opacity={0.07} segments={32} />
      <WireSphere radius={R_MID} color={MESH} opacity={0.11} segments={40} />
      <WireSphere radius={R_OUTER} color={MESH_DIM} opacity={0.14} segments={28} />
      <WireSphere radius={R_NEWS} color={MESH_NEWS} opacity={0.16} segments={30} />
      <WireSphere radius={R_UPDATES} color={MESH_GOLD} opacity={0.14} segments={26} />
      <WireSphere radius={R_DEMOS} color={MESH_DEMO} opacity={0.14} segments={24} />

      {midLinks.map(([a, b], i) => (
        <Line key={`m-${i}`} a={a} b={b} color={MESH} opacity={0.22} />
      ))}

      {main.map((n) => (
        <Line
          key={`r-${n.id}`}
          a={[0, 0, 0]}
          b={n.position}
          color={n.shell === 'outer' ? LINE_OUTER : MESH_DIM}
          opacity={n.shell === 'outer' ? 0.45 : 0.2}
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
        background: 'rgba(0,8,16,0.82)',
        border: '1px solid rgba(0,200,255,0.12)',
        padding: '8px 10px',
        borderRadius: 4,
        pointerEvents: 'none',
        lineHeight: 1.6,
      }}
    >
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
          LAYERS · repos · purple news · gold updates · jade demos
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
        camera={{ position: [0, 0.6, 13.5], fov: 38, near: 0.1, far: 140 }}
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
