'use client'
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useJarvisStore } from '../app/store'
import { enrichRepo, rankRelatedRepos, rankRelevantNews } from '../lib/knowledge'

const TYPE = {
  core: { color: '#00c8ff', emissive: '#004466', size: 0.55 },
  repo: { color: '#00ff9f', emissive: '#003322', size: 0.26 },
  code_file: { color: '#4ade80', emissive: '#002210', size: 0.14 },
  pattern: { color: '#f0b429', emissive: '#3a2a00', size: 0.2 },
  topic: { color: '#fb923c', emissive: '#3a1500', size: 0.18 },
  lang: { color: '#a78bfa', emissive: '#1e0f40', size: 0.17 },
  news: { color: '#f472b6', emissive: '#2d0818', size: 0.2 },
  local_text: { color: '#38bdf8', emissive: '#08283c', size: 0.23, idleIntensity: 0.62 },
  local_pdf: { color: '#ff8a3d', emissive: '#421300', size: 0.25, idleIntensity: 0.72 },
}

const FALLBACK_REPOS = [
  { name: 'lexprobe', language: 'Python', topics: ['ai', 'legal', 'rag'], description: 'Legal AI', patterns: ['REST API', 'RAG', 'Vector DB'] },
  { name: 'health-ai', language: 'Python', topics: ['health', 'ml'], description: 'Clinical AI', patterns: ['Database', 'Tests'] },
  { name: 'geoquant', language: 'Python', topics: ['finance', 'trading'], description: 'Finance AI', patterns: ['REST API'] },
  { name: 'drone-sim', language: 'Python', topics: ['physics', 'simulation'], description: 'Drone Sim', patterns: [] },
  { name: 'athera', language: 'TypeScript', topics: ['automation', 'ai'], description: 'Workflow AI', patterns: ['React/Next.js', 'Docker'] },
]

function hashString(input = '') {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRange(seed, min, max) {
  const unit = (hashString(seed) % 10000) / 10000
  return min + unit * (max - min)
}

function clipLabel(value = '', max = 24) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function SynapticEdge({ start, end, color, opacity = 0.2, animated = false }) {
  const ref = useRef()
  const pulseRef = useRef()

  const curve = useMemo(() => {
    const s = new THREE.Vector3(...start)
    const e = new THREE.Vector3(...end)
    const mid = s.clone().lerp(e, 0.5)
    mid.x += seededRange(`${start.join(',')}:${end.join(',')}:x`, -0.7, 0.7)
    mid.y += seededRange(`${start.join(',')}:${end.join(',')}:y`, -0.6, 0.6)
    mid.z += seededRange(`${start.join(',')}:${end.join(',')}:z`, -0.7, 0.7)
    return new THREE.CatmullRomCurve3([s, mid, e])
  }, [end, start])

  const points = useMemo(() => curve.getPoints(24), [curve])
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points])
  const pulsePos = useMemo(() => curve.getPoint(0), [curve])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ref.current) {
      ref.current.material.opacity = opacity + Math.sin(t * 1.2 + start[0] * 3) * 0.05
    }
    if (pulseRef.current && animated) {
      const pos = curve.getPoint((t * 0.4 + start[0]) % 1)
      pulseRef.current.position.copy(pos)
      pulseRef.current.material.opacity = 0.5 + Math.sin(t * 3) * 0.3
    }
  })

  return (
    <group>
      <line ref={ref} geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={opacity} />
      </line>
      {animated && (
        <mesh ref={pulseRef} position={pulsePos}>
          <sphereGeometry args={[0.03, 6, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  )
}

function NeuralDust({ count = 350 }) {
  const mesh = useRef()
  const { positions, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const ph = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 6 + Math.random() * 6
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.3
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.9
      pos[i * 3 + 2] = r * Math.cos(phi) * 1.1
      ph[i] = Math.random() * Math.PI * 2
    }

    return { positions: pos, phases: ph }
  }, [count])

  useFrame(({ clock }) => {
    if (!mesh.current) return
    const t = clock.elapsedTime
    const pos = mesh.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += Math.sin(t * 0.5 + phases[i]) * 0.002
    }
    mesh.current.geometry.attributes.position.needsUpdate = true
    mesh.current.rotation.y = t * 0.015
  })

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#00c8ff" transparent opacity={0.25} sizeAttenuation />
    </points>
  )
}

function BrainLobe({ position, scale, color, distort = 0.35, speed = 1.5 }) {
  const mesh = useRef()

  useFrame(({ clock }) => {
    if (!mesh.current) return
    mesh.current.rotation.y = clock.elapsedTime * speed * 0.08
    mesh.current.rotation.x = Math.sin(clock.elapsedTime * speed * 0.05) * 0.1
  })

  return (
    <mesh ref={mesh} position={position} scale={scale}>
      <sphereGeometry args={[1, 48, 48]} />
      <MeshDistortMaterial
        color={color}
        distort={distort}
        speed={speed}
        transparent
        opacity={0.055}
        depthWrite={false}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  )
}

function BrainCore() {
  const outer = useRef()
  const inner = useRef()
  const ring1 = useRef()
  const ring2 = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (outer.current) outer.current.rotation.y = t * 0.09
    if (inner.current) {
      inner.current.rotation.y = -t * 0.13
      inner.current.rotation.z = t * 0.07
    }
    if (ring1.current) {
      ring1.current.rotation.z = t * 0.11
      ring1.current.rotation.x = t * 0.05
    }
    if (ring2.current) {
      ring2.current.rotation.x = t * 0.08
      ring2.current.rotation.y = -t * 0.09
    }
  })

  return (
    <group>
      <mesh ref={outer}>
        <sphereGeometry args={[0.95, 64, 64]} />
        <MeshDistortMaterial
          color="#001a2e"
          emissive="#00c8ff"
          emissiveIntensity={0.25}
          distort={0.22}
          speed={1.8}
          metalness={0.6}
          roughness={0.2}
          transparent
          opacity={0.75}
        />
      </mesh>

      <mesh ref={inner}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial
          color="#003050"
          emissive="#00c8ff"
          emissiveIntensity={0.8}
          transparent
          opacity={0.5}
        />
      </mesh>

      <mesh ref={ring1} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.45, 0.012, 8, 80]} />
        <meshBasicMaterial color="#00c8ff" transparent opacity={0.45} />
      </mesh>

      <mesh ref={ring2} rotation={[Math.PI / 4, Math.PI / 4, 0]}>
        <torusGeometry args={[1.6, 0.008, 8, 80]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.3} />
      </mesh>

      <mesh>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial color="#00c8ff" wireframe transparent opacity={0.06} />
      </mesh>
    </group>
  )
}

function NeuronNode({ node, onSelect, isSelected }) {
  const mesh = useRef()
  const [hovered, setHovered] = useState(false)
  const cfg = TYPE[node.type] || TYPE.repo

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!mesh.current) return
    mesh.current.position.y = node.position[1] + Math.sin(t * 0.7 + node.phase) * 0.18
    mesh.current.rotation.y = t * 0.3 + node.phase
    const base = isSelected ? 1.5 : hovered ? 1.25 : 1
    const pulse = 1 + Math.sin(t * 2.2 + node.phase) * 0.04
    mesh.current.scale.setScalar(base * pulse)
  })

  return (
    <group position={node.position}>
      <mesh
        ref={mesh}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(node)
        }}
        onPointerOver={() => {
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'default'
        }}
      >
        {node.type === 'local_pdf' ? (
          <boxGeometry args={[cfg.size * 1.35, cfg.size * 1.35, cfg.size]} />
        ) : node.type === 'local_text' ? (
          <dodecahedronGeometry args={[cfg.size, 0]} />
        ) : node.type === 'pattern' || node.type === 'lang' ? (
          <octahedronGeometry args={[cfg.size, 0]} />
        ) : node.type === 'news' ? (
          <icosahedronGeometry args={[cfg.size, 0]} />
        ) : node.type === 'topic' ? (
          <tetrahedronGeometry args={[cfg.size, 0]} />
        ) : (
          <sphereGeometry args={[cfg.size, 20, 20]} />
        )}
        <meshStandardMaterial
          color={hovered || isSelected ? cfg.color : cfg.emissive}
          emissive={cfg.color}
          emissiveIntensity={isSelected ? 1.2 : hovered ? 0.9 : cfg.idleIntensity || 0.35}
          metalness={0.4}
          roughness={0.35}
          transparent
          opacity={0.96}
        />
      </mesh>

      {(hovered || isSelected) && (
        <Text
          position={[0, cfg.size + 0.28, 0]}
          fontSize={node.type === 'code_file' ? 0.1 : 0.14}
          color={cfg.color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.012}
          outlineColor="#000408"
          maxWidth={2.5}
        >
          {node.label}
        </Text>
      )}
    </group>
  )
}

function Lights() {
  const light1 = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (light1.current) {
      light1.current.position.x = Math.sin(t * 0.3) * 5
      light1.current.position.z = Math.cos(t * 0.3) * 5
    }
  })

  return (
    <>
      <ambientLight intensity={0.08} />
      <pointLight position={[0, 0, 0]} color="#00c8ff" intensity={3} distance={12} />
      <pointLight ref={light1} position={[6, 4, 4]} color="#a78bfa" intensity={1.2} distance={18} />
      <pointLight position={[-6, -3, -4]} color="#00ff9f" intensity={0.7} distance={15} />
      <pointLight position={[0, 8, 0]} color="#f0b429" intensity={0.4} distance={20} />
    </>
  )
}

function buildNeuralGraph(repos, hnStories, localDocs = []) {
  const nodes = []
  const edges = []
  const nodeSet = new Set()

  const addNode = (node) => {
    if (!nodeSet.has(node.id)) {
      nodeSet.add(node.id)
      nodes.push(node)
    }
  }

  addNode({ id: 'core', label: 'JARVIS', type: 'core', position: [0, 0, 0], phase: 0, data: {} })

  const repoList = (repos.length > 0 ? repos : FALLBACK_REPOS).map(enrichRepo)
  const maxReposPerRing = 8
  const maxPatternNodes = repoList.length > 10 ? 2 : 3
  const maxTopicNodes = repoList.length > 12 ? 2 : 3
  const maxFileNodes = repoList.length > 10 ? 2 : 4

  repoList.forEach((repo, index) => {
    const ringIndex = Math.floor(index / maxReposPerRing)
    const slotInRing = index % maxReposPerRing
    const itemsInRing = Math.min(maxReposPerRing, repoList.length - ringIndex * maxReposPerRing)
    const angle = (slotInRing / Math.max(itemsInRing, 1)) * Math.PI * 2 + ringIndex * 0.35
    const radius = 3.2 + ringIndex * 1.15 + seededRange(`${repo.name}:radius`, -0.18, 0.22)
    const yBand = ((ringIndex % 3) - 1) * 0.95
    const yPos =
      yBand +
      Math.sin(angle * 2 + seededRange(`${repo.name}:phase`, 0, Math.PI * 2)) * 0.65 +
      seededRange(`${repo.name}:y`, -0.2, 0.2)

    const repoId = `repo-${repo.name}`
    addNode({
      id: repoId,
      label: repo.name,
      type: 'repo',
      position: [
        Math.cos(angle) * radius * 1.2,
        yPos,
        Math.sin(angle) * radius * 0.95,
      ],
      phase: index * 0.93,
      data: repo,
    })
    edges.push({ from: 'core', to: repoId, color: TYPE.repo.color, animated: index < 3 })

    const patterns = repo.derivedPatterns || repo.patterns || []
    patterns.slice(0, maxPatternNodes).forEach((pattern, patternIndex) => {
      const patternId = `pat-${pattern}`
      if (!nodeSet.has(patternId)) {
        const patternAngle = angle + (patternIndex - (Math.min(patterns.length, maxPatternNodes) - 1) / 2) * 0.42
        addNode({
          id: patternId,
          label: pattern,
          type: 'pattern',
          position: [
            Math.cos(patternAngle) * (radius + 1.45) * 1.2,
            yPos + (patternIndex - 0.5) * 0.5,
            Math.sin(patternAngle) * (radius + 1.45) * 0.95,
          ],
          phase: index * 0.7 + patternIndex,
          data: { name: pattern },
        })
      }
      edges.push({ from: repoId, to: patternId, color: TYPE.pattern.color, animated: false })
    })

    const topics = (repo.derivedTopics || repo.topics || []).slice(0, maxTopicNodes)
    topics.forEach((topic, topicIndex) => {
      const topicId = `topic-${topic}`
      if (!nodeSet.has(topicId)) {
        const topicAngle = angle + (topicIndex - (topics.length - 1) / 2) * 0.55
        const topicRadius = radius + 1.95 + seededRange(`${repo.name}:${topic}:radius`, 0.05, 0.35)
        addNode({
          id: topicId,
          label: topic,
          type: 'topic',
          position: [
            Math.cos(topicAngle) * topicRadius * 1.2,
            yPos + (topicIndex - 0.5) * 0.85,
            Math.sin(topicAngle) * topicRadius * 0.95,
          ],
          phase: index * 0.8 + topicIndex + 2,
          data: { name: topic },
        })
      }
      edges.push({ from: repoId, to: topicId, color: TYPE.topic.color, animated: false })
    })

    if (repo.language) {
      const languageId = `lang-${repo.language}`
      if (!nodeSet.has(languageId)) {
        addNode({
          id: languageId,
          label: repo.language,
          type: 'lang',
          position: [
            Math.cos(angle + 0.42) * (radius + 2.4) * 1.2,
            yPos * 0.25 + seededRange(`${repo.language}:y`, -0.2, 0.2),
            Math.sin(angle + 0.42) * (radius + 2.4) * 0.95,
          ],
          phase: index + 10,
          data: { name: repo.language },
        })
      }
      edges.push({ from: repoId, to: languageId, color: TYPE.lang.color, animated: false })
    }

    if (repo.file_count > 0) {
      const fileCount = Math.min(repo.file_count || 0, maxFileNodes)
      for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
        const fileId = `file-${repo.name}-${fileIndex + 1}`
        const fileAngle = angle + (fileIndex - (fileCount - 1) / 2) * 0.24
        const fileRadius = radius + 1.0
        addNode({
          id: fileId,
          label: `...${repo.name}[${fileIndex + 1}]`,
          type: 'code_file',
          position: [
            Math.cos(fileAngle) * fileRadius * 1.2,
            yPos + (fileIndex - (fileCount - 1) / 2) * 0.24 + 0.42,
            Math.sin(fileAngle) * fileRadius * 0.95,
          ],
          phase: index * 0.5 + fileIndex + 5,
          data: { path: repo.name },
        })
        edges.push({ from: repoId, to: fileId, color: TYPE.code_file.color, animated: false })
      }
    }
  })

  const relatedEdgeSet = new Set()
  repoList.forEach((repo) => {
    rankRelatedRepos(repo, repoList, 2).forEach(({ repo: relatedRepo, score }) => {
      if (score <= 0) return
      const key = [repo.name, relatedRepo.name].sort().join('::')
      if (relatedEdgeSet.has(key)) return
      relatedEdgeSet.add(key)
      edges.push({
        from: `repo-${repo.name}`,
        to: `repo-${relatedRepo.name}`,
        color: '#5eead4',
        animated: false,
      })
    })
  })

  const visibleStories = hnStories.slice(0, 6)
  visibleStories.forEach((story, index) => {
    const angle = (index / Math.max(visibleStories.length, 1)) * Math.PI * 2 + Math.PI / 6
    const id = `hn-${index}`
    addNode({
      id,
      label: `${(story.title || '').slice(0, 20)}...`,
      type: 'news',
      position: [
        Math.cos(angle) * 7.4,
        seededRange(story.title || String(index), -1.4, 1.6),
        Math.sin(angle) * 6.8,
      ],
      phase: index * 1.7,
      data: story,
    })
    edges.push({ from: 'core', to: id, color: TYPE.news.color, animated: index < 2 })
  })

  repoList.forEach((repo) => {
    rankRelevantNews(repo, visibleStories, 2).forEach(({ story, score, index }) => {
      if (score <= 0) return
      edges.push({
        from: `repo-${repo.name}`,
        to: `hn-${index}`,
        color: TYPE.news.color,
        animated: false,
      })
    })
  })

  const visibleLocalDocs = localDocs.slice(0, 10)
  visibleLocalDocs.forEach((doc, index) => {
    const docType = doc.kind === 'local_pdf' ? 'local_pdf' : 'local_text'
    const angle = (index / Math.max(visibleLocalDocs.length, 1)) * Math.PI * 2 - Math.PI / 8
    const radius = 8.8 + seededRange(`${doc.id}:radius`, -0.22, 0.35) + (docType === 'local_pdf' ? 0.2 : 0)
    const yPos = -1.6 + ((index % 4) - 1.5) * 0.7 + seededRange(`${doc.id}:y`, -0.18, 0.18)
    const docId = `local-${hashString(doc.id || doc.title || String(index))}`

    addNode({
      id: docId,
      label: clipLabel(doc.title || 'Local document', 24),
      type: docType,
      position: [
        Math.cos(angle) * radius * 1.1,
        yPos,
        Math.sin(angle) * radius * 0.9,
      ],
      phase: 50 + index * 1.11,
      data: doc,
    })
    edges.push({ from: 'core', to: docId, color: TYPE[docType].color, animated: index < 3 })
  })

  return { nodes, edges }
}

function GraphScene({ repos, hnStories, localDocs, onNodeSelect, selectedId }) {
  const { nodes, edges } = useMemo(() => buildNeuralGraph(repos, hnStories, localDocs), [hnStories, localDocs, repos])
  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((node) => [node.id, node])), [nodes])

  return (
    <>
      <Lights />
      <NeuralDust count={350} />

      <BrainLobe position={[2.5, 0.8, 0.5]} scale={[2.8, 2.0, 2.2]} color="#00c8ff" distort={0.3} speed={1.2} />
      <BrainLobe position={[-2.2, -0.5, 0.8]} scale={[2.5, 1.8, 2.0]} color="#a78bfa" distort={0.4} speed={0.9} />
      <BrainLobe position={[0.5, 1.8, -1.0]} scale={[2.0, 1.5, 2.2]} color="#00ff9f" distort={0.35} speed={1.4} />
      <BrainLobe position={[-0.8, -1.5, 1.5]} scale={[1.8, 1.4, 1.6]} color="#f0b429" distort={0.45} speed={1.1} />

      <BrainCore />

      {edges.map((edge, index) => {
        const from = nodeMap[edge.from]
        const to = nodeMap[edge.to]
        if (!from || !to) return null
        const isActive = selectedId && (edge.from === selectedId || edge.to === selectedId)
        return (
          <SynapticEdge
            key={index}
            start={from.position}
            end={to.position}
            color={edge.color || '#00c8ff'}
            opacity={isActive ? 0.65 : 0.15}
            animated={edge.animated || isActive}
          />
        )
      })}

      {nodes
        .filter((node) => node.type !== 'core')
        .map((node) => (
          <NeuronNode
            key={node.id}
            node={node}
            onSelect={onNodeSelect}
            isSelected={node.id === selectedId}
          />
        ))}
    </>
  )
}

export default function BrainGraph() {
  const repos = useJarvisStore((state) => state.repos)
  const hnStories = useJarvisStore((state) => state.hnStories)
  const localDocs = useJarvisStore((state) => state.localDocs)
  const selectedNode = useJarvisStore((state) => state.selectedNode)
  const setSelectedNode = useJarvisStore((state) => state.setSelectedNode)

  return (
    <Canvas
      camera={{ position: [0, 3, 11], fov: 58, near: 0.1, far: 120 }}
      gl={{ antialias: true, alpha: true, logarithmicDepthBuffer: true }}
      style={{ background: 'transparent' }}
    >
      <GraphScene
        repos={repos}
        hnStories={hnStories}
        localDocs={localDocs}
        onNodeSelect={setSelectedNode}
        selectedId={selectedNode?.id}
      />
      <OrbitControls
        enablePan={false}
        minDistance={4.5}
        maxDistance={20}
        autoRotate
        autoRotateSpeed={0.35}
        enableDamping
        dampingFactor={0.04}
        maxPolarAngle={Math.PI * 0.8}
        minPolarAngle={Math.PI * 0.2}
      />
    </Canvas>
  )
}
