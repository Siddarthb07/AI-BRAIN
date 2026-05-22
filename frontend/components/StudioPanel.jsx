'use client'
import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { useJarvisStore } from '../app/store'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

const SUB_TABS = [
  { id: 'image', label: 'IMAGE STUDIO' },
  { id: 'model', label: '3D PREVIEW' },
]

const STYLE_PRESETS = [
  {
    id: 'clean-render',
    label: 'Clean Render',
    suffix: 'clean detailed digital render, high clarity, balanced lighting, no watermark, no text',
  },
  {
    id: 'photoreal',
    label: 'Photoreal',
    suffix: 'photorealistic image, natural lighting, realistic materials, crisp details, no watermark, no text',
  },
  {
    id: 'concept-art',
    label: 'Concept Art',
    suffix: 'stylized concept art, dramatic lighting, cinematic composition, rich detail, no watermark, no text',
  },
  {
    id: 'product',
    label: 'Product',
    suffix: 'studio product shot, centered subject, premium materials, soft shadows, no watermark, no text',
  },
]

const SIZE_OPTIONS = [
  { id: '512x512', label: '512 x 512' },
  { id: '640x832', label: '640 x 832' },
  { id: '768x768', label: '768 x 768' },
  { id: '832x640', label: '832 x 640' },
]

const STEP_PRESETS = [
  { id: '8', label: 'FAST' },
  { id: '12', label: 'BALANCED' },
  { id: '18', label: 'DETAIL' },
]

const MODEL_ACCEPT = '.glb,.gltf,.obj,.stl,.ply'

function combinePrompt(prompt, styleId) {
  const base = prompt.trim()
  const style = STYLE_PRESETS.find((item) => item.id === styleId)
  if (!style || !base) return base
  return `${base}. ${style.suffix}`
}

function fileExtension(name = '') {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() : ''
}

async function downloadRemoteFile(url, filename) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Download failed.')

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function disposeObject3D(object) {
  if (!object || typeof object.traverse !== 'function') return

  object.traverse((child) => {
    if (child.geometry?.dispose) {
      child.geometry.dispose()
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value && typeof value === 'object' && value.isTexture && value.dispose) {
          value.dispose()
        }
      })
      material.dispose?.()
    })
  })
}

function normalizeObject(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true

      if (child.geometry && !child.geometry.attributes.normal) {
        child.geometry.computeVertexNormals()
      }

      if (!child.material) {
        child.material = new THREE.MeshStandardMaterial({
          color: '#9edcff',
          metalness: 0.15,
          roughness: 0.72,
        })
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.filter(Boolean).forEach((material) => {
        material.side = THREE.DoubleSide
        if (material.color && material.color.getHexString() === 'ffffff') {
          material.color = new THREE.Color('#9edcff')
        }
        if ('metalness' in material) material.metalness = 0.18
        if ('roughness' in material) material.roughness = 0.72
      })
      return
    }

    if (child.isPoints && child.material) {
      child.material.size = child.material.size || 0.03
      if (child.material.color && child.material.color.getHexString() === 'ffffff') {
        child.material.color = new THREE.Color('#9edcff')
      }
    }
  })

  return object
}

function geometryToMesh(geometry) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({
    color: '#9edcff',
    metalness: 0.16,
    roughness: 0.7,
    vertexColors: Boolean(geometry.attributes.color),
    side: THREE.DoubleSide,
  })
  return new THREE.Mesh(geometry, material)
}

function geometryToRenderable(geometry, preferPoints = false) {
  const position = geometry.getAttribute('position')
  const looksLikePointCloud = preferPoints && position && !geometry.index && position.count % 3 !== 0

  if (looksLikePointCloud) {
    const material = new THREE.PointsMaterial({
      color: '#9edcff',
      size: 0.03,
      vertexColors: Boolean(geometry.attributes.color),
      sizeAttenuation: true,
    })
    return new THREE.Points(geometry, material)
  }

  return geometryToMesh(geometry)
}

function loadModelAsset(file) {
  return new Promise((resolve, reject) => {
    const extension = fileExtension(file.name)
    const objectUrl = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    const finish = (object) => resolve({ object: normalizeObject(object), cleanup, name: file.name, extension })
    const fail = (error) => {
      cleanup()
      reject(error)
    }

    if (extension === 'glb' || extension === 'gltf') {
      const loader = new GLTFLoader()
      loader.load(objectUrl, (gltf) => finish(gltf.scene), undefined, fail)
      return
    }

    if (extension === 'obj') {
      const loader = new OBJLoader()
      loader.load(objectUrl, finish, undefined, fail)
      return
    }

    if (extension === 'stl') {
      const loader = new STLLoader()
      loader.load(objectUrl, (geometry) => finish(geometryToRenderable(geometry)), undefined, fail)
      return
    }

    if (extension === 'ply') {
      const loader = new PLYLoader()
      loader.load(objectUrl, (geometry) => finish(geometryToRenderable(geometry, true)), undefined, fail)
      return
    }

    fail(new Error(`Unsupported file format: .${extension || 'unknown'}`))
  })
}

function ModelViewport({ asset }) {
  return (
    <Canvas camera={{ position: [3, 2.4, 3], fov: 45 }} shadows>
      <color attach="background" args={['#020a11']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 7, 3]} intensity={1.5} castShadow />
      <directionalLight position={[-3, 4, -5]} intensity={0.8} />
      <Grid
        args={[12, 12]}
        position={[0, -1.5, 0]}
        cellColor="#0f6e92"
        sectionColor="#00c8ff"
        fadeDistance={18}
        fadeStrength={1.4}
      />
      <Bounds fit clip observe margin={1.15}>
        <primitive object={asset.object} />
      </Bounds>
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  )
}

function HistoryTile({ item, active, onSelect }) {
  return (
    <button
      className="btn"
      onClick={() => onSelect(item)}
      style={{
        width: '100%',
        padding: '0',
        overflow: 'hidden',
        borderColor: active ? 'var(--gold)' : 'rgba(0,200,255,0.16)',
        background: active ? 'rgba(240,180,41,0.08)' : 'rgba(0,10,20,0.45)',
      }}
    >
      <div style={{ aspectRatio: '1 / 1', background: 'rgba(0,10,20,0.8)' }}>
        <img
          src={item.url}
          alt={item.prompt}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      <div style={{ padding: '8px 10px', textAlign: 'left' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {item.prompt}
        </div>
      </div>
    </button>
  )
}

function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const readFiles = (fileList) => {
    const file = Array.from(fileList || [])[0]
    if (file) onFiles(file)
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        readFiles(event.dataTransfer.files)
      }}
      style={{
        border: `2px dashed ${dragging ? 'var(--cyan)' : 'rgba(0,200,255,0.2)'}`,
        borderRadius: '8px',
        padding: '22px 16px',
        cursor: 'pointer',
        textAlign: 'center',
        background: dragging ? 'rgba(0,200,255,0.08)' : 'rgba(0,10,20,0.42)',
        transition: 'all 0.18s ease',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', color: dragging ? 'var(--cyan)' : 'var(--cyan-dim)', marginBottom: '8px' }}>
        3D MODEL DROP
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        Drop a model or click to browse
        <br />
        GLB, GLTF, OBJ, STL, PLY
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={MODEL_ACCEPT}
        style={{ display: 'none' }}
        onChange={(event) => readFiles(event.target.files)}
      />
    </div>
  )
}

export default function StudioPanel() {
  const [activeTab, setActiveTab] = useState('image')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('blurry, distorted, low quality, watermark, text')
  const [stylePreset, setStylePreset] = useState('clean-render')
  const [sizePreset, setSizePreset] = useState('512x512')
  const [stepPreset, setStepPreset] = useState('12')
  const [seed, setSeed] = useState('')
  const [generating, setGenerating] = useState(false)
  const [imageError, setImageError] = useState('')
  const [imageStatus, setImageStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [activeImage, setActiveImage] = useState(null)

  const [modelAsset, setModelAsset] = useState(null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState('')
  const [modelInfo, setModelInfo] = useState(null)

  const setStatusMsg = useJarvisStore((state) => state.setStatusMsg)

  useEffect(() => {
    fetchImageStatus()
    fetchImageHistory()
  }, [])

  useEffect(() => {
    return () => {
      if (modelAsset) {
        modelAsset.cleanup?.()
        disposeObject3D(modelAsset.object)
      }
    }
  }, [modelAsset])

  const fetchImageStatus = async () => {
    try {
      const res = await fetch(`${API}/media/image/status`)
      const data = await res.json()
      setImageStatus(data)
    } catch {
      setImageStatus(null)
    }
  }

  const fetchImageHistory = async () => {
    try {
      const res = await fetch(`${API}/media/image/history?limit=8`)
      const data = await res.json()
      const items = data.items || []
      setHistory(items)
      setActiveImage((current) => current || items[0] || null)
    } catch {
      setHistory([])
    }
  }

  const handleGenerateImage = async () => {
    const basePrompt = prompt.trim()
    if (!basePrompt || generating) return

    const [width, height] = sizePreset.split('x').map(Number)
    const payload = {
      prompt: combinePrompt(basePrompt, stylePreset),
      negative_prompt: negativePrompt.trim(),
      width,
      height,
      steps: Number(stepPreset),
      guidance_scale: 7,
      seed: seed.trim() ? Number(seed) : null,
    }

    setGenerating(true)
    setImageError('')
    setStatusMsg('GENERATING IMAGE...')

    try {
      const res = await fetch(`${API}/media/image/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Image generation failed.')
      }

      setActiveImage(data)
      setHistory((current) => {
        const next = [data, ...current.filter((item) => item.filename !== data.filename)]
        return next.slice(0, 8)
      })
      setStatusMsg('IMAGE READY')
      if (!seed.trim() && data.seed) setSeed(String(data.seed))
    } catch (error) {
      setImageError(error.message || 'Image generation failed.')
      setStatusMsg('IMAGE GENERATION FAILED')
    } finally {
      setGenerating(false)
    }
  }

  const handleModelFile = async (file) => {
    if (!file) return

    setModelLoading(true)
    setModelError('')
    setStatusMsg(`LOADING ${file.name.toUpperCase()}...`)

    try {
      const asset = await loadModelAsset(file)
      setModelAsset((current) => {
        if (current) {
          current.cleanup?.()
          disposeObject3D(current.object)
        }
        return asset
      })
      setModelInfo({
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        extension: fileExtension(file.name),
      })
      setStatusMsg('3D MODEL READY')
    } catch (error) {
      setModelError(error.message || 'Unable to load this model.')
      setStatusMsg('3D PREVIEW FAILED')
    } finally {
      setModelLoading(false)
    }
  }

  const clearModelPreview = () => {
    setModelAsset((current) => {
      if (current) {
        current.cleanup?.()
        disposeObject3D(current.object)
      }
      return null
    })
    setModelInfo(null)
    setModelError('')
  }

  const handleDownloadImage = async () => {
    if (!activeImage?.url || !activeImage?.filename) return

    try {
      await downloadRemoteFile(activeImage.url, activeImage.filename)
    } catch (error) {
      setImageError(error.message || 'Download failed.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,200,255,0.08)', flexShrink: 0 }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '10px 6px',
              background: activeTab === tab.id ? 'rgba(0,200,255,0.08)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--cyan)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--cyan)' : 'var(--text-dim)',
              fontFamily: 'var(--font-display)',
              fontSize: '9px',
              letterSpacing: '0.12em',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="scroll-area" style={{ flex: 1, padding: '18px', minHeight: 0 }}>
        {activeTab === 'image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-header">OPEN IMAGE GENERATION</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Generates images locally with open-source Diffusers models only. No paid API is required. First run can take longer while the model downloads into the backend cache.
            </div>

            {imageStatus && (
              <div
                style={{
                  background: 'rgba(0,10,20,0.45)',
                  border: '1px solid rgba(0,200,255,0.12)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                  lineHeight: 1.8,
                }}
              >
                MODEL: {imageStatus.model_id}
                <br />
                DEVICE: {imageStatus.device}
                <br />
                PIPELINE: {imageStatus.pipeline_loaded ? 'WARM' : 'COLD'}
              </div>
            )}

            {imageStatus && imageStatus.enabled === false && (
              <div
                style={{
                  background: 'rgba(255,56,96,0.05)',
                  border: '1px solid rgba(255,56,96,0.2)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--red)',
                }}
              >
                IMAGE GENERATION IS DISABLED IN THE BACKEND ENVIRONMENT.
              </div>
            )}

            <textarea
              className="input-cyber"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the image you want JARVIS to generate..."
              rows={4}
              style={{ resize: 'vertical', lineHeight: 1.6 }}
            />

            <input
              className="input-cyber"
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder="Negative prompt"
            />

            <div>
              <div className="section-header" style={{ marginBottom: '10px' }}>STYLE</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="btn"
                    onClick={() => setStylePreset(preset.id)}
                    style={{
                      borderColor: stylePreset === preset.id ? 'var(--gold)' : 'rgba(0,200,255,0.18)',
                      color: stylePreset === preset.id ? 'var(--gold)' : 'var(--cyan)',
                      background: stylePreset === preset.id ? 'rgba(240,180,41,0.08)' : 'rgba(0,200,255,0.05)',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <div className="section-header" style={{ marginBottom: '8px' }}>SIZE</div>
                <select
                  value={sizePreset}
                  onChange={(event) => setSizePreset(event.target.value)}
                  className="input-cyber"
                  style={{ fontSize: '13px', paddingRight: '36px' }}
                >
                  {SIZE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id} style={{ background: '#001020' }}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '140px' }}>
                <div className="section-header" style={{ marginBottom: '8px' }}>DETAIL</div>
                <select
                  value={stepPreset}
                  onChange={(event) => setStepPreset(event.target.value)}
                  className="input-cyber"
                  style={{ fontSize: '13px', paddingRight: '36px' }}
                >
                  {STEP_PRESETS.map((option) => (
                    <option key={option.id} value={option.id} style={{ background: '#001020' }}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '140px' }}>
                <div className="section-header" style={{ marginBottom: '8px' }}>SEED</div>
                <input
                  className="input-cyber"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Random"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-gold"
                onClick={handleGenerateImage}
                disabled={generating || !prompt.trim() || imageStatus?.enabled === false}
              >
                {generating ? 'GENERATING...' : 'GENERATE IMAGE'}
              </button>
              <button className="btn" onClick={fetchImageHistory}>
                REFRESH HISTORY
              </button>
            </div>

            {imageError && (
              <div
                style={{
                  background: 'rgba(255,56,96,0.05)',
                  border: '1px solid rgba(255,56,96,0.2)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--red)',
                }}
              >
                {imageError}
              </div>
            )}

            {activeImage && (
              <div
                style={{
                  background: 'rgba(0,10,20,0.45)',
                  border: '1px solid rgba(0,200,255,0.12)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ aspectRatio: `${activeImage.width || 1} / ${activeImage.height || 1}`, background: '#04121d' }}>
                  <img
                    src={activeImage.url}
                    alt={activeImage.prompt}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    {activeImage.prompt}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
                    {activeImage.width} x {activeImage.height} | {activeImage.steps} steps | seed {activeImage.seed} | {activeImage.elapsed_seconds}s
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-gold" onClick={handleDownloadImage}>
                      DOWNLOAD PNG
                    </button>
                    <a className="btn" href={activeImage.url} target="_blank" rel="noreferrer">
                      OPEN FULL SIZE
                    </a>
                  </div>
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div>
                <div className="section-header">RECENT IMAGES</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                  {history.map((item) => (
                    <HistoryTile
                      key={item.filename}
                      item={item}
                      active={activeImage?.filename === item.filename}
                      onSelect={setActiveImage}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'model' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
            <div className="section-header">LOCAL 3D MODEL PREVIEW</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Preview local models directly in the browser. GLB is the most reliable option for textured assets. GLTF files that depend on external textures may need to be packed into a GLB first.
            </div>

            <DropZone onFiles={handleModelFile} />

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn" onClick={clearModelPreview}>
                CLEAR PREVIEW
              </button>
            </div>

            {modelLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="voice-bar" style={{ height: '14px', animationDelay: `${index * 0.15}s` }} />
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--cyan)' }}>
                  LOADING MODEL...
                </div>
              </div>
            )}

            {modelError && (
              <div
                style={{
                  background: 'rgba(255,56,96,0.05)',
                  border: '1px solid rgba(255,56,96,0.2)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--red)',
                }}
              >
                {modelError}
              </div>
            )}

            {modelInfo && (
              <div
                style={{
                  background: 'rgba(0,10,20,0.45)',
                  border: '1px solid rgba(0,200,255,0.12)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-dim)',
                  lineHeight: 1.8,
                }}
              >
                FILE: {modelInfo.name}
                <br />
                FORMAT: .{modelInfo.extension}
                <br />
                SIZE: {modelInfo.sizeKb} KB
              </div>
            )}

            <div
              style={{
                flex: 1,
                minHeight: '340px',
                background: 'rgba(0,10,20,0.5)',
                border: '1px solid rgba(0,200,255,0.12)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {modelAsset ? (
                <ModelViewport asset={modelAsset} />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '28px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-dim)',
                    lineHeight: 2,
                  }}
                >
                  Drop a 3D model to preview it here.
                  <br />
                  Orbit with the mouse and zoom with the wheel.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
