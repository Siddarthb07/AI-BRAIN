"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { GraphNode, GraphResponse, getGraph } from "../lib/api";

type NodeWithPosition = GraphNode & { position: [number, number, number] };

function brainPositions(count: number): [number, number, number][] {
  const positions: [number, number, number][] = [];
  const lobeOffset = 1.2;
  const radius = 2.4;
  for (let i = 0; i < count; i += 1) {
    const lobe = i % 2 === 0 ? -lobeOffset : lobeOffset;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = radius * (0.7 + Math.random() * 0.5);
    const x = Math.sin(phi) * Math.cos(theta) * r + lobe;
    const y = Math.cos(phi) * r * 0.8;
    const z = Math.sin(phi) * Math.sin(theta) * r;
    positions.push([x, y, z]);
  }
  return positions;
}

function buildPositions(nodes: GraphNode[]): NodeWithPosition[] {
  const positions = brainPositions(nodes.length);
  return nodes.map((node, idx) => ({ ...node, position: positions[idx] ?? [0, 0, 0] }));
}

function NodeSphere({
  node,
  onSelect
}: {
  node: NodeWithPosition;
  onSelect: (node: NodeWithPosition) => void;
}) {
  const colorMap: Record<string, string> = {
    project: "#f97316",
    github_repo: "#38bdf8",
    github_trending: "#22d3ee",
    topic: "#a78bfa",
    fallback: "#60a5fa",
    tech: "#34d399"
  };
  const baseColor = colorMap[node.kind] ?? "#38bdf8";
  const color = node.active ? "#facc15" : baseColor;
  const ref = useMemo(() => new THREE.Vector3(...node.position), [node.position]);
  const meshRef = useRef<THREE.Mesh | null>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    meshRef.current.position.y = ref.y + Math.sin(t + ref.x) * 0.15;
    meshRef.current.position.x = ref.x + Math.cos(t * 0.6 + ref.y) * 0.05;
  });

  return (
    <mesh ref={meshRef} position={node.position} onClick={() => onSelect(node)}>
      <sphereGeometry args={[node.active ? 0.34 : node.kind === "topic" ? 0.18 : 0.24, 24, 24]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
    </mesh>
  );
}

function GraphLines({ nodes, edges }: { nodes: NodeWithPosition[]; edges: GraphResponse["edges"] }) {
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
      <lineBasicMaterial color="#1f8cf9" opacity={0.4} transparent />
    </lineSegments>
  );
}

export function BrainGraph() {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [selected, setSelected] = useState<NodeWithPosition | null>(null);
  const [status, setStatus] = useState("Loading graph...");
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.1) * 0.2;
  });

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getGraph();
        if (!mounted) return;
        setGraph(data);
        setStatus("Graph ready.");
      } catch (err) {
        if (!mounted) return;
        const fallback = {
          nodes: [
            { id: "lexprobe", name: "LexProbe", kind: "fallback", tech: ["nlp", "search"], active: false },
            { id: "geoquant", name: "GeoQuant", kind: "fallback", tech: ["geo", "analytics"], active: false },
            { id: "health-ai", name: "Health AI", kind: "fallback", tech: ["health", "ml"], active: false },
            { id: "jarvis", name: "JARVIS", kind: "fallback", tech: ["fastapi", "rag"], active: true },
            { id: "fastapi", name: "FastAPI", kind: "tech", tech: ["python"], active: false },
            { id: "docker", name: "Docker", kind: "tech", tech: ["containers"], active: false },
            { id: "rag", name: "RAG", kind: "tech", tech: ["retrieval"], active: false },
            { id: "ml-models", name: "ML Models", kind: "tech", tech: ["models"], active: false }
          ],
          edges: [
            { source: "jarvis", target: "fastapi" },
            { source: "jarvis", target: "docker" },
            { source: "jarvis", target: "rag" },
            { source: "jarvis", target: "ml-models" }
          ]
        };
        setGraph(fallback);
        setStatus(`Graph fallback active. ${(err as Error).message}`);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const nodes = useMemo(() => (graph ? buildPositions(graph.nodes) : []), [graph]);
  const edges = graph?.edges ?? [];

  useEffect(() => {
    if (!selected && nodes.length) {
      setSelected(nodes[0]);
    }
  }, [nodes, selected]);

  return (
    <section className="panel">
      <h2>Brain Graph</h2>
      <div className="graph-layout">
          <div className="graph-canvas">
            <Canvas camera={{ position: [0, 0, 7], fov: 55 }}>
              <ambientLight intensity={0.7} />
              <pointLight position={[8, 6, 5]} intensity={1.2} />
              <group ref={groupRef}>
                <GraphLines nodes={nodes} edges={edges} />
                {nodes.map((node) => (
                  <NodeSphere key={node.id} node={node} onSelect={setSelected} />
                ))}
              </group>
              <OrbitControls enablePan={false} />
            </Canvas>
          </div>
        <aside className="graph-panel">
          <h3>{selected?.name ?? "Select a node"}</h3>
          <p className="muted">{selected?.kind ?? "graph node"}</p>
          <div>
            <strong>Related tech</strong>
            <ul>
              {(selected?.tech ?? ["rag", "fastapi", "docker"]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Best videos</strong>
            <ul>
              {(selected?.videos ?? []).slice(0, 5).map((link) => (
                <li key={link}>
                  <a href={link} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                </li>
              ))}
              {(!selected?.videos || selected.videos.length === 0) && (
                <li>Run ingestion to generate video links.</li>
              )}
            </ul>
          </div>
          <div>
            <strong>Latest news</strong>
            <ul>
              {(selected?.news ?? []).slice(0, 4).map((link) => (
                <li key={link}>
                  <a href={link} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                </li>
              ))}
              {(!selected?.news || selected.news.length === 0) && (
                <li>News links will appear after ingestion.</li>
              )}
            </ul>
          </div>
          <div>
            <strong>Problems</strong>
            <ul>
              <li>Integration bottlenecks</li>
              <li>Latency spikes</li>
              <li>Missing instrumentation</li>
            </ul>
          </div>
          <div>
            <strong>Suggested actions</strong>
            <ul>
              <li>Validate data pipeline end-to-end</li>
              <li>Document a deploy checklist</li>
              <li>Capture one reusable pattern</li>
            </ul>
          </div>
          <p className="status">{status}</p>
        </aside>
      </div>
    </section>
  );
}
