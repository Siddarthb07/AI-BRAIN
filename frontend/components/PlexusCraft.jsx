'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Line as DreiLine } from '@react-three/drei'
import * as THREE from 'three'
import { useJarvisStore } from '../app/store'

const CYAN = '#5ad4ff'
const ORANGE = '#ff7a18'
const GOLD = '#ffcc66'

function armAngle(kind, i, n) {
  return (i / n) * Math.PI * 2 + (kind === 'quad' ? Math.PI / 4 : 0)
}

function catalog(kind) {
  const n = kind === 'hex' ? 6 : 4
  const armLen = kind === 'hex' ? 1.22 : 1.08
  const parts = [
    { id: 'frame', label: kind === 'hex' ? 'F550 FRAME' : 'X FRAME', group: 'airframe', rest: [0, 0, 0], explode: [0, -0.15, 0] },
    { id: 'fc', label: kind === 'hex' ? 'NAZA-M LITE' : 'KK2.1.5', group: 'avionics', rest: [0, 0.09, 0], explode: [0, 0.62, 0] },
    { id: 'pdb', label: 'PDB / BEC', group: 'power', rest: [0, -0.04, 0], explode: [0, -0.48, 0] },
    { id: 'battery', label: '4S LIPO', group: 'power', rest: [0, -0.17, 0.08], explode: [0, -0.78, 0.4] },
    { id: 'rx', label: 'RX / LINK', group: 'avionics', rest: [0.16, 0.11, -0.08], explode: [0.58, 0.38, -0.22] },
  ]
  if (kind === 'hex') {
    parts.push({ id: 'gps', label: 'GPS MAST', group: 'avionics', rest: [0, 0.3, -0.12], explode: [0, 0.92, -0.28] })
  }
  parts.push({ id: 'gear', label: 'LANDING GEAR', group: 'airframe', rest: [0, -0.3, 0], explode: [0, -0.9, 0] })
  for (let i = 0; i < n; i++) {
    const a = armAngle(kind, i, n)
    const x = Math.cos(a) * armLen
    const z = Math.sin(a) * armLen
    const mx = Math.cos(a) * 0.62
    const mz = Math.sin(a) * 0.62
    parts.push({ id: `arm-${i}`, label: `ARM ${i + 1}`, group: 'airframe', rest: [x * 0.48, 0, z * 0.48], explode: [mx, 0.1, mz] })
    parts.push({ id: `esc-${i}`, label: `ESC ${i + 1}`, group: 'power', rest: [x * 0.42, -0.05, z * 0.42], explode: [mx * 0.9, -0.38, mz * 0.9] })
    parts.push({ id: `motor-${i}`, label: `MOTOR ${i + 1}`, group: 'lift', rest: [x, 0.07, z], explode: [x * 0.38, 0.5, z * 0.38] })
    parts.push({ id: `prop-${i}`, label: `PROP ${i + 1}`, group: 'lift', rest: [x, 0.16, z], explode: [x * 0.48, 0.82, z * 0.48] })
  }
  return parts
}

function v3(a) {
  return new THREE.Vector3(a[0], a[1], a[2])
}

function dist2(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}

function autoLinks(points, maxDist) {
  const links = []
  const m = maxDist * maxDist
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (dist2(points[i], points[j]) <= m) links.push([i, j])
    }
  }
  return links
}

function ringPts(radius, count, y = 0) {
  const pts = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    pts.push([Math.cos(a) * radius, y, Math.sin(a) * radius])
  }
  return pts
}

function boxPts(sx, sy, sz, mid = true) {
  const hx = sx / 2
  const hy = sy / 2
  const hz = sz / 2
  const pts = []
  for (const x of [-hx, 0, hx]) {
    for (const y of [-hy, 0, hy]) {
      for (const z of [-hz, 0, hz]) {
        if (!mid && (x === 0 || y === 0 || z === 0) && !(Math.abs(x) === hx && Math.abs(y) === hy && Math.abs(z) === hz)) continue
        pts.push([x, y, z])
      }
    }
  }
  return pts
}

function cylPts(rTop, rBot, h, segs = 10, stacks = 2) {
  const pts = []
  for (let s = 0; s <= stacks; s++) {
    const t = s / stacks
    const y = -h / 2 + t * h
    const r = rBot + (rTop - rBot) * t
    pts.push(...ringPts(r, segs, y))
  }
  return pts
}

function PlexusCloud({ points, color, opacity = 0.72, maxDist, nodeSize = 0.016, selected, ghost }) {
  const links = useMemo(() => autoLinks(points, maxDist), [points, maxDist])
  const c = selected ? GOLD : color
  const op = ghost ? opacity * 0.28 : selected ? 1 : opacity
  const size = ghost ? nodeSize * 0.55 : selected ? nodeSize * 1.35 : nodeSize
  return (
    <group>
      {points.map((p, i) => (
        <mesh key={`n-${i}`} position={p}>
          <sphereGeometry args={[size, 8, 8]} />
          <meshBasicMaterial color={c} transparent opacity={op} depthWrite={false} />
        </mesh>
      ))}
      {links.map(([i, j], k) => (
        <DreiLine
          key={`l-${k}`}
          points={[v3(points[i]), v3(points[j])]}
          color={c}
          transparent
          opacity={op}
          lineWidth={1}
          depthWrite={false}
        />
      ))}
    </group>
  )
}

function PartBody({ id, kind, color, selected, ghost = false }) {
  const n = kind === 'hex' ? 6 : 4
  const armLen = kind === 'hex' ? 1.22 : 1.08
  const c = selected ? GOLD : color
  if (id === 'frame') {
    const pts = [
      ...ringPts(0.26, 16, 0.02),
      ...ringPts(0.18, 12, -0.02),
      [0, 0, 0],
      ...Array.from({ length: n }, (_, i) => {
        const a = armAngle(kind, i, n)
        return [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28]
      }),
    ]
    return <PlexusCloud points={pts} color={c} maxDist={0.16} selected={selected} ghost={ghost} nodeSize={0.018} />
  }
  if (id === 'fc') {
    const size = kind === 'hex' ? [0.24, 0.045, 0.24] : [0.3, 0.038, 0.24]
    return (
      <group>
        <PlexusCloud points={boxPts(...size)} color={c} maxDist={0.16} selected={selected} ghost={ghost} />
        <PlexusCloud points={[[-0.1, 0.03, 0.1], [0.1, 0.03, 0.1], [-0.1, 0.03, -0.1], [0.1, 0.03, -0.1], [0, 0.04, 0]]} color={GOLD} maxDist={0.22} selected={selected} ghost={ghost} nodeSize={0.012} />
      </group>
    )
  }
  if (id === 'pdb') {
    return <PlexusCloud points={boxPts(0.2, 0.018, 0.2)} color="#3cffb0" maxDist={0.14} selected={selected} ghost={ghost} />
  }
  if (id === 'battery') {
    return <PlexusCloud points={boxPts(0.36, 0.11, 0.18)} color="#ff6a4a" maxDist={0.2} selected={selected} ghost={ghost} />
  }
  if (id === 'rx') return <PlexusCloud points={boxPts(0.09, 0.03, 0.13)} color={GOLD} maxDist={0.1} selected={selected} ghost={ghost} />
  if (id === 'gps') {
    const mast = [[0, -0.18, 0], [0, -0.08, 0], [0, 0.02, 0], ...ringPts(0.075, 12, 0.04)]
    return <PlexusCloud points={mast} color={c} maxDist={0.12} selected={selected} ghost={ghost} />
  }
  if (id === 'gear') {
    const pts = []
    for (const x of [-0.24, 0.24]) {
      pts.push([x, 0.18, 0], [x * 1.05, 0.02, 0], [x * 1.18, -0.08, -0.16], [x * 1.18, -0.08, 0.16])
    }
    return <PlexusCloud points={pts} color={c} maxDist={0.28} selected={selected} ghost={ghost} />
  }
  if (id.startsWith('arm-')) {
    const i = Number(id.split('-')[1])
    const a = armAngle(kind, i, n)
    const half = armLen * 0.29
    const pts = []
    for (let t = -half; t <= half; t += half / 4) {
      pts.push([t, 0.012, 0.028], [t, -0.012, 0.028], [t, 0.012, -0.028], [t, -0.012, -0.028])
    }
    return (
      <group rotation={[0, -a, 0]}>
        <PlexusCloud points={pts} color={c} maxDist={0.16} selected={selected} ghost={ghost} nodeSize={0.012} />
      </group>
    )
  }
  if (id.startsWith('esc-')) return <PlexusCloud points={boxPts(0.11, 0.022, 0.05)} color="#7cff9a" maxDist={0.08} selected={selected} ghost={ghost} />
  if (id.startsWith('motor-')) {
    const pts = [...cylPts(0.072, 0.072, 0.085, 12, 2), [0, 0.06, 0], [0, 0, 0], ...ringPts(0.078, 14, 0.04)]
    return <PlexusCloud points={pts} color={c} maxDist={0.09} selected={selected} ghost={ghost} nodeSize={0.013} />
  }
  if (id.startsWith('prop-')) {
    const pts = [...ringPts(0.26, 18, 0), [0, 0, 0]]
    for (let t = -0.27; t <= 0.27; t += 0.045) {
      pts.push([t, 0.004, 0.01 * Math.sign(t || 1)], [0.01 * Math.sign(t || 1), 0.004, t])
    }
    return <PlexusCloud points={pts} color={c} maxDist={0.09} selected={selected} ghost={ghost} nodeSize={0.011} opacity={0.55} />
  }
  if (id === 'cam') {
    return (
      <group>
        <PlexusCloud points={boxPts(0.08, 0.05, 0.09)} color={c} maxDist={0.08} selected={selected} ghost={ghost} />
        <PlexusCloud points={ringPts(0.03, 10, 0.06)} color={GOLD} maxDist={0.05} selected={selected} ghost={ghost} nodeSize={0.01} />
      </group>
    )
  }
  if (id === 'vtx') return <PlexusCloud points={boxPts(0.08, 0.03, 0.11)} color="#ff8ad4" maxDist={0.08} selected={selected} ghost={ghost} />
  if (id === 'led') return <PlexusCloud points={ringPts(0.32, 24, 0)} color={GOLD} maxDist={0.1} selected={selected} ghost={ghost} />
  if (id === 'buzzer') return <PlexusCloud points={cylPts(0.03, 0.03, 0.04, 8, 1)} color={GOLD} maxDist={0.05} selected={selected} ghost={ghost} />
  if (id === 'antenna') {
    const pts = [[0, -0.12, 0], [0, 0, 0], [0, 0.12, 0], [0, 0.2, 0], ...ringPts(0.02, 6, 0.16)]
    return <PlexusCloud points={pts} color={c} maxDist={0.14} selected={selected} ghost={ghost} />
  }
  if (id === 'sonar') return <PlexusCloud points={ringPts(0.04, 12, 0).concat([[0, 0, 0]])} color="#9dff7a" maxDist={0.06} selected={selected} ghost={ghost} />
  return null
}

function extrasCatalog() {
  return [
    { id: 'cam', label: 'FPV CAM', group: 'payload', rest: [0, 0.04, 0.28], explode: [0, 0.25, 0.85] },
    { id: 'vtx', label: 'VTX 5.8', group: 'payload', rest: [-0.16, 0.12, -0.08], explode: [-0.72, 0.42, -0.22] },
    { id: 'led', label: 'LED RING', group: 'payload', rest: [0, -0.09, 0], explode: [0, -0.55, 0.35] },
    { id: 'buzzer', label: 'BUZZER', group: 'avionics', rest: [-0.16, 0.11, 0.1], explode: [-0.58, 0.4, 0.28] },
    { id: 'antenna', label: 'RX ANT', group: 'avionics', rest: [0.22, 0.16, 0.1], explode: [0.72, 0.48, 0.28] },
    { id: 'sonar', label: 'SONAR', group: 'payload', rest: [0, -0.22, 0.16], explode: [0, -0.7, 0.45] },
  ]
}

function familyOf(id) {
  if (id.startsWith('prop-')) return 'prop'
  if (id.startsWith('motor-')) return 'motor'
  if (id.startsWith('esc-')) return 'esc'
  if (id.startsWith('arm-')) return 'arm'
  return id
}

function ScanField({ color }) {
  const scan = useRef()
  const ringA = useRef()
  const ringB = useRef()
  const cage = useRef()
  const dots = useMemo(() => {
    const pts = []
    for (let i = 0; i < 220; i++) {
      const r = 0.4 + Math.random() * 1.7
      const a = Math.random() * Math.PI * 2
      const y = (Math.random() - 0.5) * 1.6
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r)
    }
    return new Float32Array(pts)
  }, [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (scan.current) scan.current.position.y = Math.sin(t * 1.35) * 0.7
    if (ringA.current) ringA.current.rotation.z = t * 0.45
    if (ringB.current) ringB.current.rotation.z = -t * 0.28
    if (cage.current) cage.current.rotation.y = t * 0.08
  })
  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dots, 3]} />
        </bufferGeometry>
        <pointsMaterial color={color} size={0.012} transparent opacity={0.35} />
      </points>
      <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 1.72, 80]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      {[0.22, 0.48, 0.78].map((y) => (
        <mesh key={y} rotation={[-Math.PI / 2, 0, 0]} position={[0, y - 0.35, 0]}>
          <ringGeometry args={[0.55, 0.58, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <group ref={cage}>
        <mesh>
          <sphereGeometry args={[1.85, 28, 18]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.1} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={ringA} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.98, 0]}>
        <ringGeometry args={[1.28, 1.38, 80]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringB} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0]}>
        <ringGeometry args={[1.5, 1.62, 80]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.45, 0]}>
        <cylinderGeometry args={[0.03, 0.28, 1.2, 20, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Harness({ parts, detached, absent, color }) {
  const segs = useMemo(() => {
    const out = []
    const at = (id) => parts.find((p) => p.id === id)?.rest
    const fc = at('fc')
    const pdb = at('pdb')
    if (fc && pdb) out.push([fc, pdb])
    parts.filter((p) => p.id.startsWith('esc-')).forEach((esc) => {
      if (pdb) out.push([pdb, esc.rest])
    })
    parts.filter((p) => p.id.startsWith('motor-')).forEach((m, i) => {
      const esc = at(`esc-${i}`)
      if (esc) out.push([esc, m.rest])
      if (fc) out.push([fc, m.rest])
    })
    return out
  }, [parts])
  return segs.map(([a, b], i) => (
    <DreiLine
      key={i}
      points={[v3(a), v3(b)]}
      color={color}
      transparent
      opacity={0.22}
      lineWidth={1}
      depthWrite={false}
    />
  ))
}

function DraggablePart({ spec, kind, color, selected, explode, detached, pulled, dragging, rigRef, onDragStart, onDrag, onDragEnd, onSelect }) {
  const group = useRef()
  const showTag = selected || detached || explode > 0.4 || dragging

  useFrame((_, dt) => {
    if (!group.current || dragging) return
    const factor = detached ? 1.35 : explode
    const dest = pulled || new THREE.Vector3(
      spec.rest[0] + spec.explode[0] * factor,
      spec.rest[1] + spec.explode[1] * factor,
      spec.rest[2] + spec.explode[2] * factor,
    )
    group.current.position.lerp(dest, 1 - Math.pow(0.0006, dt))
  })

  return (
    <group
      ref={group}
      position={spec.rest}
      userData={{ id: spec.id }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!dragging) document.body.style.cursor = 'default'
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.target.setPointerCapture?.(e.pointerId)
        onDragStart(spec.id, e, group.current, rigRef.current)
        onSelect(spec.id)
      }}
      onPointerMove={(e) => {
        if (!dragging) return
        e.stopPropagation()
        onDrag(e, group.current, rigRef.current)
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        onDragEnd(spec.id, group.current)
        document.body.style.cursor = 'default'
      }}
    >
      <mesh visible={false}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshBasicMaterial />
      </mesh>
      <PartBody id={spec.id} kind={kind} color={color} selected={selected || dragging} />
      {showTag ? (
        <Html center distanceFactor={7} style={{ pointerEvents: 'none' }}>
          <div className="craft-tag">{spec.label}</div>
        </Html>
      ) : null}
    </group>
  )
}

function GhostSlot({ spec, kind, color, hot, onInstall }) {
  return (
    <group
      position={spec.rest}
      onPointerDown={(e) => {
        e.stopPropagation()
        onInstall(spec.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'copy'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <mesh visible={false}>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshBasicMaterial />
      </mesh>
      <PartBody id={spec.id} kind={kind} color={hot ? GOLD : color} ghost />
      {hot ? (
        <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className="craft-tag">SLOT · {spec.label}</div>
        </Html>
      ) : null}
    </group>
  )
}

function CraftRig({ kind, explode, detached, absent, selected, pulled, draggingId, holding, spin, onSelect, onDragStart, onDrag, onDragEnd, onInstall }) {
  const rig = useRef()
  const parts = useMemo(() => [...catalog(kind), ...extrasCatalog()], [kind])
  const gestureLatest = useJarvisStore((s) => s.gestureLatest)
  const gestureOn = useJarvisStore((s) => s.gestureControlEnabled)
  const color = kind === 'hex' ? ORANGE : CYAN

  useFrame((_, dt) => {
    if (!rig.current || draggingId) return
    const yaw = gestureOn ? gestureLatest?.yaw || 0 : 0
    const pitch = gestureOn ? gestureLatest?.pitch || 0 : 0
    if (Math.abs(yaw) > 0.012 || Math.abs(pitch) > 0.012) {
      rig.current.rotation.y += yaw * dt * 2.4
      rig.current.rotation.x = Math.max(-0.8, Math.min(0.8, rig.current.rotation.x + pitch * dt * 2.0))
    } else if (spin) {
      rig.current.rotation.y += dt * 0.16
    }
    const zoom = gestureOn ? gestureLatest?.zoom || 0 : 0
    if (Math.abs(zoom) > 0.01) {
      const s = Math.max(0.7, Math.min(1.9, rig.current.scale.x + zoom * dt * 1.4))
      rig.current.scale.setScalar(s)
    }
  })

  return (
    <group ref={rig} rotation={[0.4, 0.32, 0]}>
      <ScanField color={color} />
      <Harness parts={parts} detached={detached} absent={absent} color={color} />
      {parts.map((p) => {
        const empty = detached.has(p.id) || absent.has(p.id) || explode > 0.35
        if (!empty) return null
        const hot = holding && familyOf(holding) === familyOf(p.id) && (detached.has(p.id) || absent.has(p.id))
        return (
          <GhostSlot
            key={`ghost-${p.id}`}
            spec={p}
            kind={kind}
            color={color}
            hot={!!hot || holding === p.id}
            onInstall={onInstall}
          />
        )
      })}
      {parts.map((p) => (
        absent.has(p.id) ? null : (
          <DraggablePart
            key={p.id}
            spec={p}
            kind={kind}
            color={color}
            selected={selected === p.id}
            explode={explode}
            detached={detached.has(p.id)}
            pulled={pulled[p.id]}
            dragging={draggingId === p.id}
            rigRef={rig}
            onDragStart={onDragStart}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
            onSelect={onSelect}
          />
        )
      ))}
    </group>
  )
}

export default function PlexusCraft({ kind = 'quad', height = 220, interactive = true }) {
  const extras = useMemo(() => extrasCatalog(), [])
  const core = useMemo(() => catalog(kind), [kind])
  const parts = useMemo(() => [...core, ...extras], [core, extras])
  const extraIds = useMemo(() => new Set(extras.map((p) => p.id)), [extras])
  const [explode, setExplode] = useState(0)
  const [detached, setDetached] = useState(() => new Set())
  const [absent, setAbsent] = useState(() => new Set(extras.map((p) => p.id)))
  const [selected, setSelected] = useState(null)
  const [holding, setHolding] = useState(null)
  const [spin, setSpin] = useState(true)
  const [orbitOn, setOrbitOn] = useState(true)
  const [pulled, setPulled] = useState({})
  const [draggingId, setDraggingId] = useState(null)
  const plane = useRef(new THREE.Plane())
  const grab = useRef(new THREE.Vector3())
  const hit = useRef(new THREE.Vector3())
  const craftCommand = useJarvisStore((s) => s.craftCommand)

  useEffect(() => {
    setDetached(new Set())
    setAbsent(new Set(extrasCatalog().map((p) => p.id)))
    setExplode(0)
    setSelected(null)
    setHolding(null)
    setPulled({})
  }, [kind])

  const installId = (id) => {
    setSpin(false)
    setSelected(id)
    setDetached((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setAbsent((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setPulled((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setHolding(null)
  }

  const installHeld = (slotId) => {
    if (holding && familyOf(holding) === familyOf(slotId)) {
      installId(slotId)
      return
    }
    if (detached.has(slotId) || absent.has(slotId)) installId(slotId)
  }

  const addFromBin = (id) => {
    if (extraIds.has(id) && absent.has(id)) {
      installId(id)
      return
    }
    if (detached.has(id)) {
      installId(id)
      return
    }
    const fam = familyOf(id)
    const empty = parts.find((p) => familyOf(p.id) === fam && (detached.has(p.id) || absent.has(p.id)))
    if (empty) installId(empty.id)
    else setHolding(id)
  }

  useEffect(() => {
    if (!craftCommand?.type) return
    if (craftCommand.type === 'explode') setExplode(1)
    if (craftCommand.type === 'assemble') {
      setExplode(0)
      setDetached(new Set())
      setPulled({})
    }
    if (craftCommand.type === 'strip' && craftCommand.id) {
      setDetached((prev) => {
        const next = new Set(prev)
        const hitPart = parts.find((p) => p.id === craftCommand.id || p.label.toLowerCase().includes(String(craftCommand.id).toLowerCase()))
        if (hitPart) next.add(hitPart.id)
        else if (craftCommand.id === 'props') parts.filter((p) => p.id.startsWith('prop-')).forEach((p) => next.add(p.id))
        else if (craftCommand.id === 'motors') parts.filter((p) => p.id.startsWith('motor-')).forEach((p) => next.add(p.id))
        else if (craftCommand.id === 'arms') parts.filter((p) => p.id.startsWith('arm-')).forEach((p) => next.add(p.id))
        return next
      })
      setExplode((e) => Math.max(e, 0.55))
    }
    if (craftCommand.type === 'install' && craftCommand.id) {
      const want = String(craftCommand.id)
      const hitPart = parts.find((p) => p.id === want || p.label.toLowerCase().includes(want.toLowerCase()) || familyOf(p.id) === want)
      if (hitPart) addFromBin(hitPart.id)
      else if (want === 'props') parts.filter((p) => p.id.startsWith('prop-')).forEach((p) => installId(p.id))
    }
    useJarvisStore.setState({ craftCommand: null })
  }, [craftCommand, parts])

  const onDragStart = (id, e, part, rig) => {
    if (!part || !rig) return
    setDraggingId(id)
    setHolding(id)
    setSpin(false)
    setOrbitOn(false)
    const camDir = e.camera.getWorldDirection(new THREE.Vector3())
    plane.current.setFromNormalAndCoplanarPoint(camDir.negate(), e.point)
    const localHit = rig.worldToLocal(e.point.clone())
    grab.current.copy(part.position).sub(localHit)
  }

  const onDrag = (e, part, rig) => {
    if (!part || !rig) return
    if (!e.ray.intersectPlane(plane.current, hit.current)) return
    const local = rig.worldToLocal(hit.current.clone())
    part.position.copy(local.add(grab.current))
  }

  const onDragEnd = (id, part) => {
    setDraggingId(null)
    setOrbitOn(true)
    if (!part) return
    const spec = parts.find((p) => p.id === id)
    if (!spec) return
    const rest = new THREE.Vector3(...spec.rest)
    const dist = part.position.distanceTo(rest)
    const nearOther = parts.find((p) => familyOf(p.id) === familyOf(id) && p.id !== id && (detached.has(p.id) || absent.has(p.id)) && part.position.distanceTo(new THREE.Vector3(...p.rest)) < 0.22)
    if (nearOther) {
      if (extraIds.has(id)) {
        setAbsent((prev) => new Set(prev).add(id))
        setDetached((prev) => {
          const n = new Set(prev)
          n.delete(id)
          return n
        })
      }
      installId(nearOther.id)
      return
    }
    if (dist > 0.18) {
      if (extraIds.has(id)) {
        setAbsent((prev) => new Set(prev).add(id))
        setDetached((prev) => {
          const n = new Set(prev)
          n.delete(id)
          return n
        })
        setPulled((prev) => {
          const n = { ...prev }
          delete n[id]
          return n
        })
      } else {
        setDetached((prev) => new Set(prev).add(id))
        setPulled((prev) => ({ ...prev, [id]: part.position.clone() }))
      }
    } else {
      installId(id)
    }
  }

  const snapPart = (id) => {
    if (detached.has(id) || absent.has(id)) {
      addFromBin(id)
      return
    }
    setSelected(id)
    setSpin(false)
    setDetached((prev) => new Set(prev).add(id))
    setExplode((e) => Math.max(e, 0.3))
  }

  const groups = ['airframe', 'avionics', 'power', 'lift']
  const binCore = core.filter((p) => detached.has(p.id))
  const binExtra = extras.filter((p) => absent.has(p.id))

  return (
    <div className="craft-bay" style={{ width: '100%', height }}>
      <aside className="craft-bay-rail">
        <div className="craft-bay-title">{kind === 'hex' ? 'F550 · NAZA-M LITE' : 'QUAD · KK2.1.5'}</div>
        <p className="craft-bay-help">Drag parts out. Pick a BIN part, then click a glowing slot to install.</p>
        <div className="craft-bay-actions">
          <button type="button" className="btn" onClick={() => setExplode(1)}>EXPLODE</button>
          <button type="button" className="btn" onClick={() => { setExplode(0); setDetached(new Set()); setPulled({}); setHolding(null) }}>ASSEMBLE</button>
        </div>
        {groups.map((g) => (
          <div key={g} className="craft-bay-group">
            <b>{g.toUpperCase()}</b>
            {core.filter((p) => p.group === g).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`craft-bay-part${detached.has(p.id) ? ' is-off' : ''}${selected === p.id ? ' is-on' : ''}`}
                onClick={() => snapPart(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <Canvas camera={{ position: [0, 0.9, 3.7], fov: 38 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={['#01050b']} />
        <fog attach="fog" args={['#01050b', 5.5, 13]} />
        <ambientLight intensity={0.28} />
        <pointLight position={[2.4, 2.6, 3]} intensity={2.4} color={CYAN} />
        <pointLight position={[-2.2, 1.4, 2]} intensity={1.2} color={ORANGE} />
        <spotLight position={[0, 4, 2]} intensity={1.6} color="#9ef6ff" angle={0.55} penumbra={0.6} />
        <gridHelper args={[10, 40, '#0d3a4e', '#071820']} position={[0, -1.05, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.04, 0]}>
          <circleGeometry args={[2.4, 64]} />
          <meshBasicMaterial color={kind === 'hex' ? ORANGE : CYAN} transparent opacity={0.07} />
        </mesh>
        <CraftRig
          kind={kind}
          explode={explode}
          detached={detached}
          absent={absent}
          selected={selected}
          pulled={pulled}
          draggingId={draggingId}
          holding={holding}
          spin={spin && !draggingId}
          onSelect={setSelected}
          onDragStart={onDragStart}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
          onInstall={installHeld}
        />
        {interactive ? (
          <OrbitControls enabled={orbitOn && !draggingId} enablePan={false} minDistance={2} maxDistance={8} />
        ) : null}
      </Canvas>
      <aside className="craft-bay-bin">
        <div className="craft-bay-title">BIN</div>
        <p className="craft-bay-help">{holding ? `HOLDING ${String(holding).toUpperCase()} · click a slot` : 'Add payload or reseat stripped parts.'}</p>
        <div className="craft-bay-group">
          <b>PAYLOAD</b>
          {binExtra.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`craft-bay-part is-add${holding === p.id ? ' is-on' : ''}`}
              onClick={() => addFromBin(p.id)}
            >
              + {p.label}
            </button>
          ))}
          {!binExtra.length ? <span className="craft-bay-empty">All payload seated.</span> : null}
        </div>
        <div className="craft-bay-group">
          <b>STRIPPED</b>
          {binCore.map((p) => (
            <button
              key={p.id}
              type="button"
              className="craft-bay-part is-add"
              onClick={() => addFromBin(p.id)}
            >
              + {p.label}
            </button>
          ))}
          {!binCore.length ? <span className="craft-bay-empty">Nothing stripped.</span> : null}
        </div>
      </aside>
    </div>
  )
}
