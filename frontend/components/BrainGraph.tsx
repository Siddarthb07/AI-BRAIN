"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { GraphNode, GraphResponse, getGraph } from "../lib/api";

type NodeWithPosition = GraphNode & { position: [number, number, number] };

type Edge = { source: string; target: string };

function buildPositions(nodes: GraphNode[]): NodeWithPosition[] {
  const repoNodes = nodes.filter((n) => n.kind === "github_repo");
  const topicNodes = nodes.filter((n) => n.kind === "topic");
  const otherNodes = nodes.filter((n) => n.kind !== "topic" && n.kind !== "github_repo");

  const positions = new Map<string, [number, number, number]>();
  const lobeOffset = 3.0;
  const baseRadius = 4.8;

  repoNodes.forEach((node, idx) => {
    const lobe = idx % 2 === 0 ? -lobeOffset : lobeOffset;
    const angle = (idx / Math.max(1, repoNodes.length)) * Math.PI * 2;
    const r = baseRadius * (0.7 + Math.random() * 0.35);
    const x = Math.cos(angle) * r + lobe;
    const y = Math.sin(angle * 1.3) * 1.8;
    const z = Math.sin(angle) * r;
    positions.set(node.id, [x, y, z]);
  });

  topicNodes.forEach((node) => {
    const parentPos = positions.get(node.parent ?? "");
    if (parentPos) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 0.7 + Math.random() * 0.9;
      const x = parentPos[0] + Math.sin(phi) * Math.cos(theta) * r;
      const y = parentPos[1] + Math.cos(phi) * r * 0.8;
      const z = parentPos[2] + Math.sin(phi) * Math.sin(theta) * r;
      positions.set(node.id, [x, y, z]);
    }
  });

  otherNodes.forEach((node, idx) => {
    const angle = (idx / Math.max(1, otherNodes.length)) * Math.PI * 2;
    const r = 2.4 + Math.random() * 1.2;
    positions.set(node.id, [Math.cos(angle) * r, Math.sin(angle) * 1.1, Math.sin(angle) * r]);
  });

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? [0, 0, 0] }));
}

function NodeSphere({ node, onSelect }: { node: NodeWithPosition; onSelect: (node: NodeWithPosition) => void }) {
  const colorMap: Record<string, string> = {
    project: "#f97316",
    github_repo: "#38bdf8",
    topic: "#a78bfa",
    fallback: "#60a5fa",
    tech: "#34d399"
  };
  const baseColor = colorMap[node.kind] ?? "#38bdf8";
  const color = node.active ? "#facc15" : baseColor;
  const origin = useMemo(() => new THREE.Vector3(...node.position), [node.position]);
  const meshRef = useRef<THREE.Mesh | null>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    meshRef.current.position.y = origin.y + Math.sin(t + origin.x) * 0.12;
    meshRef.current.position.x = origin.x + Math.cos(t * 0.6 + origin.y) * 0.05;
  });

  return (
    <mesh ref={meshRef} position={node.position} onClick={() => onSelect(node)}>
      <sphereGeometry args={[node.active ? 0.4 : node.kind === "topic" ? 0.22 : 0.3, 24, 24]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} />
    </mesh>
  );
}

function GraphLines({ nodes, edges }: { nodes: NodeWithPosition[]; edges: Edge[] }) {
  const positions = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n.position]));
    const pts: number[] = [];
    edges.forEach((edge) => {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) return;
      pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    });
    return new Float32Array(pts);
  }, [nodes, edges]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          itemSize={3}
          count={positions.length / 3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#1f8cf9" opacity={0.35} transparent />
    </lineSegments>
  );
}

function GraphScene({
  nodes,
  edges,
  onSelect,
  showTopics
}: {
  nodes: NodeWithPosition[];
  edges: Edge[];
  onSelect: (node: NodeWithPosition) => void;
  showTopics: boolean;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.1) * 0.2;
  });

  return (
    <group ref={groupRef}>
      <GraphLines nodes={nodes} edges={edges} />
      {nodes.map((node) => (
        <NodeSphere key={node.id} node={node} onSelect={onSelect} />
      ))}
      {nodes
        .filter((node) => node.kind === "github_repo")
        .slice(0, 24)
        .map((node) => (
          <Text
            key={`label-${node.id}`}
            position={[node.position[0], node.position[1] + 0.42, node.position[2]]}
            fontSize={0.22}
            color="#e2e8f0"
            anchorX="center"
            anchorY="middle"
          >
            {node.name.split("/").pop() ?? node.name}
          </Text>
        ))}
      {showTopics &&
        nodes
          .filter((node) => node.kind === "topic")
          .slice(0, 16)
          .map((node) => (
            <Text
              key={`topic-${node.id}`}
              position={[node.position[0], node.position[1] + 0.28, node.position[2]]}
              fontSize={0.16}
              color="#94a3b8"
              anchorX="center"
              anchorY="middle"
            >
              {node.name}
            </Text>
          ))}
    </group>
  );
}

const FALLBACK_GRAPH: GraphResponse = {
  nodes: [
    { id: "jarvis", name: "JARVIS", kind: "github_repo", tech: ["ai", "rag"], active: true },
    { id: "lexprobe", name: "LexProbe", kind: "github_repo", tech: ["nlp"], active: false },
    { id: "geoquant", name: "GeoQuant", kind: "github_repo", tech: ["geo"], active: false },
    { id: "health", name: "Health AI", kind: "github_repo", tech: ["health"], active: false },
    { id: "topic1", name: "Vector DB", kind: "topic", parent: "jarvis" },
    { id: "topic2", name: "FastAPI", kind: "topic", parent: "jarvis" },
    { id: "topic3", name: "LLM Ops", kind: "topic", parent: "jarvis" },
    { id: "topic4", name: "RAG", kind: "topic", parent: "jarvis" }
  ],
  edges: [
    { source: "jarvis", target: "lexprobe" },
    { source: "jarvis", target: "geoquant" },
    { source: "jarvis", target: "health" },
    { source: "jarvis", target: "topic1" },
    { source: "jarvis", target: "topic2" },
    { source: "jarvis", target: "topic3" },
    { source: "jarvis", target: "topic4" }
  ]
};

export function BrainGraph() {
  const [graph, setGraph] = useState<GraphResponse>(FALLBACK_GRAPH);
  const [selected, setSelected] = useState<NodeWithPosition | null>(null);
  const [status, setStatus] = useState("Loading graph...");
  const [showTopics, setShowTopics] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getGraph();
        if (!mounted) return;
        setGraph(data);
        setStatus("Graph synced.");
      } catch (err) {
        if (!mounted) return;
        setStatus(`Graph fallback active. ${(err as Error).message}`);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const nodes = useMemo(() => buildPositions(graph.nodes), [graph]);
  const edges = graph.edges ?? [];
  const connectedTopics = useMemo(() => {
    if (!selected) return [];
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return edges
      .filter((edge) => edge.source === selected.id)
      .map((edge) => nodeMap.get(edge.target))
      .filter((node): node is NodeWithPosition => Boolean(node && node.kind === "topic"))
      .map((node) => node.name);
  }, [edges, nodes, selected]);

  useEffect(() => {
    if (!selected && nodes.length) {
      setSelected(nodes[0]);
    }
  }, [nodes, selected]);

  return (
    <section className="panel">
      <h2>Brain Graph</h2>
      <div className="split">
        <div className="brain-wrap">
          <Canvas camera={{ position: [0, 0, 8.5], fov: 55 }}>
            <ambientLight intensity={0.8} />
            <pointLight position={[8, 6, 5]} intensity={1.2} />
            <GraphScene nodes={nodes} edges={edges} onSelect={setSelected} showTopics={showTopics} />
            <OrbitControls enablePan={false} />
          </Canvas>
          <div className="brain-overlay" />
          <div className="scanlines" />
        </div>
        <aside className="side-panel">
          <div className="panel">
            <div className="panel-header">
              <h2>Node Intel</h2>
              <span className="pill">{selected?.kind ?? "graph node"}</span>
            </div>
            <div className="brief-item">
              <strong>{selected?.name ?? "Select a node"}</strong>
              <span className="muted">Status: {selected?.active ? "Active" : "Monitoring"}</span>
            </div>
            <div className="list compact">
              <span>Signal load: {nodes.length}</span>
              <span>Scan depth: 97%</span>
            </div>
            <div className="list compact">
              {(selected?.tech ?? ["rag", "fastapi", "docker"]).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <details className="details">
              <summary>Topics</summary>
              <div className="list compact">
                {connectedTopics.length ? (
                  connectedTopics.slice(0, 12).map((topic) => <span key={topic}>{topic}</span>)
                ) : (
                  <span className="muted">Select a repo to see topics.</span>
                )}
              </div>
            </details>
            <details className="details">
              <summary>Best videos</summary>
              <div className="list compact">
                {(selected?.videos ?? [])
                  .slice(0, 4)
                  .map((item) => (typeof item === "string" ? { title: item, url: item } : item))
                  .map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                      {link.title}
                    </a>
                  ))}
                {(!selected?.videos || selected.videos.length === 0) && (
                  <span className="muted">Run ingestion to generate video links.</span>
                )}
              </div>
            </details>
            <details className="details">
              <summary>Latest news</summary>
              <div className="list compact">
                {(selected?.news ?? [])
                  .slice(0, 4)
                  .map((item) => (typeof item === "string" ? { title: item, url: item } : item))
                  .map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                      {link.title}
                    </a>
                  ))}
                {(!selected?.news || selected.news.length === 0) && (
                  <a
                    href={`https://hn.algolia.com/?q=${encodeURIComponent(selected?.name || "ai")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Search Hacker News for {selected?.name || "topic"}
                  </a>
                )}
              </div>
            </details>
            <div className="row">
              <button type="button" onClick={() => setShowTopics((prev) => !prev)}>
                {showTopics ? "Hide topic labels" : "Show topic labels"}
              </button>
            </div>
            <div className="status">{status}</div>
          </div>
        </aside>
      </div>
    </section>
  );
}
