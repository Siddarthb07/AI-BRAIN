'use client'

/**
 * Dual-hand MediaPipe GestureRecognizer for BrainGraph.
 *
 * 1 fist = rotate · 1 palm = reset · 2 palms apart = zoom · 2 fists = spin
 */

import { useEffect, useRef } from 'react'
import { useJarvisStore } from '../app/store'
import { resolveApiBase } from '../lib/api'

import { requestGestureCamera, streamHasLiveVideo } from '../lib/gestures'
import {
  CUSTOM_CONTROL_GESTURES,
  GESTURE_MODEL_URLS,
  MEDIAPIPE_CANNED_GESTURES,
  mapCannedToInternal,
} from '../lib/gesturesCatalog'

const WASM_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm',
]

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

const GESTURE_COLOR = {
  none: '#7a9bb8',
  palm: '#00c8ff',
  move: '#00c8ff',
  pinch: '#f0b429',
  spread: '#f0b429',
  point: '#c084fc',
  fist: '#ff6b6b',
  thumbs_up: '#5eead4',
  thumbs_down: '#ff6b6b',
  dual_zoom: '#f0b429',
  dual_spin: '#5eead4',
  pinch_orbit: '#f0b429',
  finger_zoom: '#f0b429',
}

const FALLBACK_REPOS = [
  'AI-BRAIN', 'Lexprobe', 'NeuralVortex', 'Health-AI', 'GeoQuant', 'Athera', 'Anima', 'text2sql-rag',
]

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function fingerUp(lm, tip, pip, mcp = null) {
  if (mcp != null) return lm[tip].y < lm[pip].y - 0.018 && lm[pip].y < lm[mcp].y + 0.025
  return lm[tip].y < lm[pip].y - 0.012
}

function fingerDown(lm, tip, pip) {
  return lm[tip].y > lm[pip].y - 0.008
}

function classify(lm) {
  const thumbUp = lm[17].x < lm[5].x ? lm[4].x < lm[3].x - 0.012 : lm[4].x > lm[3].x + 0.012
  const indexUp = fingerUp(lm, 8, 6, 5)
  const middleUp = fingerUp(lm, 12, 10, 9)
  const ringUp = fingerUp(lm, 16, 14, 13)
  const pinkyUp = fingerUp(lm, 20, 18, 17)
  const indexDown = fingerDown(lm, 8, 6)
  const middleDown = fingerDown(lm, 12, 10)
  const ringDown = fingerDown(lm, 16, 14)
  const pinkyDown = fingerDown(lm, 20, 18)
  const fingers = [thumbUp, indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length
  const pinchDist = dist(lm[4], lm[8])
  const curled = [indexDown, middleDown, ringDown, pinkyDown].filter(Boolean).length

  // Strict pinch only — do not steal open palm / fist
  if (middleDown && ringDown && pinkyDown && pinchDist < 0.055 && indexUp) {
    return { gesture: 'pinch', fingers: 2, pinchDist, pinchPair: true }
  }

  // Clear point
  if (indexUp && middleDown && ringDown && pinkyDown && pinchDist > 0.1) {
    return { gesture: 'point', fingers: 1, pinchDist, pinchPair: false }
  }

  // Fist
  if (curled >= 3 && fingers <= 1) {
    return { gesture: 'fist', fingers: 0, pinchDist, pinchPair: false }
  }

  // Open palm
  if (fingers >= 4 || (fingers >= 3 && curled <= 1)) {
    return { gesture: 'palm', fingers, pinchDist, pinchPair: false }
  }

  return { gesture: 'move', fingers, pinchDist, pinchPair: false }
}

function stabilizeSlot(slot, raw) {
  if (raw === slot.raw) slot.count += 1
  else {
    slot.raw = raw
    slot.count = 1
  }
  const need =
    raw === slot.stable ? 1 : raw === 'point' || raw === 'pinch' ? 2 : raw === 'fist' || raw === 'palm' ? 3 : 3
  if (slot.count >= need) slot.stable = raw
  return slot.stable || raw
}

function isOpenHand(m) {
  if (m.gesture === 'palm') return true
  if (m.canned === 'Open_Palm' && m.score >= 0.4) return true
  if (m.gesture === 'move' && m.fingers >= 3) return true
  return m.fingers >= 4
}

function isFistHand(m) {
  if (m.gesture === 'fist') return true
  if (m.canned === 'Closed_Fist' && m.score >= 0.4) return true
  return m.fingers === 0
}

function repoAimList() {
  const repos = useJarvisStore.getState().repos || []
  const names = repos.map((r) => r.name).filter(Boolean)
  return names.length ? names.slice(0, 24) : FALLBACK_REPOS
}

function aimRepoIndex(tipX, listLen, prev) {
  if (listLen <= 0) return 0
  const raw = Math.round(tipX * (listLen - 1))
  const clamped = Math.max(0, Math.min(listLen - 1, raw))
  if (prev.aimIndex == null) {
    prev.aimIndex = clamped
    return clamped
  }
  const center = prev.aimIndex / Math.max(1, listLen - 1)
  const band = 0.55 / listLen
  if (Math.abs(tipX - center) > band + 0.04) prev.aimIndex = clamped
  return prev.aimIndex
}

function palmCenter(lm) {
  return { x: lm[9].x, y: lm[9].y }
}

function tipPoint(lm) {
  return { x: lm[8].x, y: lm[8].y }
}

/** Mirror X for natural selfie aiming/control. */
function mir(x) {
  return 1 - x
}

async function postEvent(payload) {
  try {
    await fetch(`${resolveApiBase()}/gestures/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    /* offline */
  }
}

async function createGestureRecognizer(fileset, delegate, modelUrl) {
  const { GestureRecognizer } = await import('@mediapipe/tasks-vision')
  return GestureRecognizer.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.35,
    minHandPresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
  })
}

async function loadGestureRecognizer(fileset) {
  let lastErr
  for (const modelUrl of GESTURE_MODEL_URLS) {
    try {
      try {
        return await createGestureRecognizer(fileset, 'GPU', modelUrl)
      } catch {
        return await createGestureRecognizer(fileset, 'CPU', modelUrl)
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('GestureRecognizer model failed to load')
}

async function loadFileset() {
  const { FilesetResolver } = await import('@mediapipe/tasks-vision')
  let lastErr
  for (const base of WASM_CANDIDATES) {
    try {
      return await FilesetResolver.forVisionTasks(base)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('MediaPipe wasm failed to load')
}

function topGesture(gesturesForHand) {
  const cat = gesturesForHand?.[0]
  if (!cat) return { name: 'None', score: 0 }
  return {
    name: cat.categoryName || cat.displayName || 'None',
    score: typeof cat.score === 'number' ? cat.score : 0,
  }
}

/** Prefer MediaPipe canned labels; landmark only for pinch / fallback. */
function resolveHandGesture(landmarks, cannedName, score, slot) {
  const raw = classify(landmarks)
  let chosen = raw.gesture

  // Landmark pinch wins when clearly pinched
  if (raw.gesture === 'pinch' && raw.pinchDist < 0.06) {
    chosen = 'pinch'
  } else if (score >= 0.45 && cannedName && cannedName !== 'None') {
    const mapped = mapCannedToInternal(cannedName)
    if (mapped !== 'none') chosen = mapped
  } else if (raw.gesture === 'palm' || raw.gesture === 'fist' || raw.gesture === 'point') {
    chosen = raw.gesture
  }

  return {
    ...raw,
    gesture: stabilizeSlot(slot, chosen),
    canned: cannedName,
    score,
  }
}

function drawHand(ctx, landmarks, w, h, color) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a]
    const pb = landmarks[b]
    if (!pa || !pb) continue
    ctx.beginPath()
    ctx.moveTo(pa.x * w, pa.y * h)
    ctx.lineTo(pb.x * w, pb.y * h)
    ctx.stroke()
  }
  for (const p of landmarks) {
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Combine hands into one control intent.
 * 1 fist = rotate · 1 palm = reset · 2 palms apart = zoom · 2 fists = spin
 */
function planDualHand(handPacks, prev, repos, nowMs) {
  const actionGap = nowMs - (prev.lastActionAt || 0)
  const empty = {
    mode: 'idle',
    yaw: 0,
    pitch: 0,
    zoom: 0,
    select: 0,
    selectTarget: null,
    hoverIndex: null,
    message: '1 fist rotate · 1 palm reset · 2 palms zoom',
    gesture: 'none',
    hands: [],
  }

  if (!handPacks.length) {
    prev.dualDist = null
    prev.cx = null
    prev.cy = null
    prev.fingerDist = null
    prev.pointSince = 0
    prev.dwellIndex = null
    prev.fistSince = 0
    prev.palmSince = 0
    prev.dualFistSince = 0
    prev.stillX = null
    prev.stillY = null
    prev.smoothZoom = 0
    return empty
  }

  const meta = handPacks.map((pack, i) => {
    const slot = prev.slots[i] || (prev.slots[i] = { raw: 'none', stable: 'none', count: 0 })
    const resolved = resolveHandGesture(pack.landmarks, pack.canned, pack.score, slot)
    const palm = palmCenter(pack.landmarks)
    const tip = tipPoint(pack.landmarks)
    return {
      gesture: resolved.gesture,
      fingers: resolved.fingers,
      pinchDist: resolved.pinchDist,
      pinchPair: resolved.pinchPair,
      canned: pack.canned,
      score: pack.score,
      palmX: mir(palm.x),
      palmY: palm.y,
      tipX: mir(tip.x),
      tipY: tip.y,
      landmarks: pack.landmarks,
    }
  })
  if (handPacks.length < 2) prev.slots.length = handPacks.length

  const pointer = meta.find((m) => m.gesture === 'point' || (m.canned === 'Pointing_Up' && m.score >= 0.45))
  const thumbUp = meta.find((m) => m.gesture === 'thumbs_up')
  const thumbDown = meta.find((m) => m.gesture === 'thumbs_down')
  const grabber = meta.find((m) => m.gesture === 'pinch')
  const fistHands = meta.filter((m) => isFistHand(m))
  const openHands = meta.filter((m) => isOpenHand(m))
  const dual = meta.length >= 2

  if (thumbDown && !grabber && actionGap > 600) {
    prev.lastActionAt = nowMs
    return {
      mode: 'cancel',
      yaw: 0,
      pitch: 0,
      zoom: 0,
      select: -2,
      selectTarget: null,
      hoverIndex: null,
      message: 'Thumb down · clear selection',
      gesture: 'thumbs_down',
      hands: meta,
    }
  }

  if (thumbUp && !grabber) {
    const aimIndex = prev.aimIndex != null ? prev.aimIndex : aimRepoIndex(0.5, repos.length, prev)
    const aimName = repos[aimIndex] || null
    if (aimName && actionGap > 500) {
      prev.lastActionAt = nowMs
      prev.firedPointIndex = aimIndex
      return {
        mode: 'confirm',
        yaw: 0,
        pitch: 0,
        zoom: 0,
        select: 1,
        selectTarget: aimName,
        hoverIndex: aimIndex,
        message: `Thumb up · selected ${aimName}`,
        gesture: 'thumbs_up',
        hands: meta,
      }
    }
  }

  if (pointer && !grabber) {
    prev.fingerDist = null
    prev.dualDist = null
    prev.palmSince = 0
    prev.dualFistSince = 0
    prev.smoothZoom = 0
    const aimIndex = aimRepoIndex(pointer.tipX, repos.length, prev)
    const aimName = repos[aimIndex] || null
    if (prev.dwellIndex !== aimIndex) {
      prev.dwellIndex = aimIndex
      prev.pointSince = nowMs
    }
    const dwell = nowMs - (prev.pointSince || nowMs)
    let select = 0
    let message = aimName ? `Pointing · ${aimName}` : 'Pointing · slide L/R'
    if (aimName && dwell >= 420 && prev.firedPointIndex !== aimIndex && actionGap > 350) {
      select = 1
      prev.firedPointIndex = aimIndex
      prev.lastActionAt = nowMs
      message = `Selected ${aimName}`
    } else if (aimName && prev.firedPointIndex === aimIndex) {
      message = `Selected ${aimName}`
    } else if (aimName) {
      const left = Math.max(0, 420 - dwell)
      message = left > 30 ? `Aim ${aimName} · ${Math.ceil(left / 100) / 10}s` : `Selecting ${aimName}…`
    }
    prev.cx = pointer.tipX
    prev.cy = pointer.tipY
    return {
      mode: 'select',
      yaw: 0,
      pitch: 0,
      zoom: 0,
      select,
      selectTarget: aimName,
      hoverIndex: aimIndex,
      message,
      gesture: 'point',
      hands: meta,
      cursor: { x: pointer.tipX, y: pointer.tipY },
    }
  }

  if (dual && fistHands.length >= 2 && !grabber) {
    prev.dualDist = null
    prev.fingerDist = null
    prev.palmSince = 0
    prev.smoothZoom = 0
    if (!prev.dualFistSince) prev.dualFistSince = nowMs
    if (nowMs - prev.dualFistSince >= 420 && actionGap > 650) {
      prev.lastActionAt = nowMs
      prev.dualFistSince = nowMs + 9999
      return {
        mode: 'spin',
        yaw: 0,
        pitch: 0,
        zoom: 0,
        select: 2,
        selectTarget: null,
        hoverIndex: null,
        message: '2 fists · toggle spin',
        gesture: 'dual_spin',
        hands: meta,
      }
    }
    return {
      mode: 'spin_hold',
      yaw: 0,
      pitch: 0,
      zoom: 0,
      select: 0,
      selectTarget: null,
      hoverIndex: null,
      message: '2 fists · hold for spin…',
      gesture: 'dual_spin',
      hands: meta,
    }
  }
  prev.dualFistSince = 0

  if (dual && openHands.length >= 2 && fistHands.length === 0 && !grabber) {
    prev.pointSince = 0
    prev.palmSince = 0
    prev.fingerDist = null
    const a = openHands[0]
    const b = openHands[1]
    const separation = Math.hypot(a.palmX - b.palmX, a.palmY - b.palmY)
    let zoomRaw = 0
    if (prev.dualDist != null) {
      const delta = separation - prev.dualDist
      zoomRaw = Math.abs(delta) < 0.003 ? 0 : delta * 14
    }
    prev.dualDist = separation
    prev.smoothZoom = (prev.smoothZoom || 0) * 0.35 + zoomRaw * 0.65
    const zoom = Math.abs(prev.smoothZoom) < 0.012 ? 0 : prev.smoothZoom
    prev.cx = null
    prev.cy = null
    return {
      mode: 'dual_zoom',
      yaw: 0,
      pitch: 0,
      zoom,
      select: 0,
      selectTarget: null,
      hoverIndex: null,
      message:
        zoom > 0.02 ? '2 palms · zoom out' : zoom < -0.02 ? '2 palms · zoom in' : '2 palms · pull apart / together',
      gesture: 'dual_zoom',
      hands: meta,
      dualDist: separation,
    }
  }

  if (dual && fistHands.length === 0 && !pointer && !grabber && meta.every((m) => m.fingers >= 2)) {
    prev.pointSince = 0
    prev.palmSince = 0
    const a = meta[0]
    const b = meta[1]
    const separation = Math.hypot(a.palmX - b.palmX, a.palmY - b.palmY)
    let zoomRaw = 0
    if (prev.dualDist != null) {
      const delta = separation - prev.dualDist
      zoomRaw = Math.abs(delta) < 0.003 ? 0 : delta * 12
    }
    prev.dualDist = separation
    prev.smoothZoom = (prev.smoothZoom || 0) * 0.4 + zoomRaw * 0.6
    const zoom = Math.abs(prev.smoothZoom) < 0.012 ? 0 : prev.smoothZoom
    prev.cx = null
    prev.cy = null
    return {
      mode: 'dual_zoom',
      yaw: 0,
      pitch: 0,
      zoom,
      select: 0,
      selectTarget: null,
      hoverIndex: null,
      message: zoom ? '2 hands · zoom' : '2 hands · pull apart',
      gesture: 'dual_zoom',
      hands: meta,
      dualDist: separation,
    }
  }

  prev.dualDist = null
  prev.smoothZoom = 0

  if (grabber) {
    prev.pointSince = 0
    prev.palmSince = 0
    let yaw = 0
    let pitch = 0
    if (prev.cx != null) {
      const rawYaw = (grabber.palmX - prev.cx) * 5.5
      const rawPitch = (grabber.palmY - prev.cy) * 4.2
      const dy = Math.abs(rawYaw) < 0.008 ? 0 : rawYaw
      const dp = Math.abs(rawPitch) < 0.008 ? 0 : rawPitch
      prev.yaw = (prev.yaw || 0) * 0.5 + dy * 0.5
      prev.pitch = (prev.pitch || 0) * 0.5 + dp * 0.5
      yaw = prev.yaw
      pitch = prev.pitch
    }
    prev.cx = grabber.palmX
    prev.cy = grabber.palmY
    return {
      mode: 'pinch_orbit',
      yaw,
      pitch,
      zoom: 0,
      select: 0,
      selectTarget: null,
      hoverIndex: null,
      message: 'Pinch-drag rotate',
      gesture: 'pinch',
      hands: meta,
    }
  }

  prev.fingerDist = null

  if (!dual && openHands.length === 1 && fistHands.length === 0) {
    const hand = openHands[0]
    const moved =
      prev.stillX != null &&
      Math.hypot(hand.palmX - prev.stillX, hand.palmY - prev.stillY) > 0.028
    if (moved) {
      prev.palmSince = 0
      prev.stillX = hand.palmX
      prev.stillY = hand.palmY
      return {
        mode: 'idle',
        yaw: 0,
        pitch: 0,
        zoom: 0,
        select: 0,
        selectTarget: null,
        hoverIndex: null,
        message: 'Palm · hold still to reset',
        gesture: 'palm',
        hands: meta,
      }
    }
    if (prev.stillX == null) {
      prev.stillX = hand.palmX
      prev.stillY = hand.palmY
    }
    if (!prev.palmSince) prev.palmSince = nowMs
    if (nowMs - prev.palmSince >= 700 && actionGap > 800) {
      prev.lastActionAt = nowMs
      prev.palmSince = nowMs + 9999
      prev.stillX = null
      return {
        mode: 'reset',
        yaw: 0,
        pitch: 0,
        zoom: 0,
        select: -1,
        selectTarget: null,
        hoverIndex: null,
        message: 'Palm · reset view',
        gesture: 'palm',
        hands: meta,
      }
    }
    return {
      mode: 'reset_hold',
      yaw: 0,
      pitch: 0,
      zoom: 0,
      select: 0,
      selectTarget: null,
      hoverIndex: null,
      message: 'Palm · hold still to reset…',
      gesture: 'palm',
      hands: meta,
    }
  }
  prev.palmSince = 0
  prev.stillX = null
  prev.stillY = null

  const rotator = !dual && fistHands.length === 1 ? fistHands[0] : null
  if (rotator) {
    prev.firedPointIndex = null
    let yaw = 0
    let pitch = 0
    if (prev.cx != null) {
      const rawYaw = (rotator.palmX - prev.cx) * 6.2
      const rawPitch = (rotator.palmY - prev.cy) * 4.8
      const dy = Math.abs(rawYaw) < 0.008 ? 0 : rawYaw
      const dp = Math.abs(rawPitch) < 0.008 ? 0 : rawPitch
      prev.yaw = (prev.yaw || 0) * 0.45 + dy * 0.55
      prev.pitch = (prev.pitch || 0) * 0.45 + dp * 0.55
      yaw = prev.yaw
      pitch = prev.pitch
    }
    prev.cx = rotator.palmX
    prev.cy = rotator.palmY
    return {
      mode: 'rotate',
      yaw,
      pitch,
      zoom: 0,
      select: 0,
      selectTarget: null,
      hoverIndex: null,
      message: 'Fist · rotate',
      gesture: 'fist',
      hands: meta,
    }
  }

  prev.cx = null
  prev.cy = null
  return { ...empty, hands: meta }
}

export default function GestureRuntime() {
  const enabled = useJarvisStore((s) => s.gestureControlEnabled)
  const previewVisible = useJarvisStore((s) => s.gesturePreviewVisible)
  const visionCameraActive = useJarvisStore((s) => s.visionCameraActive)
  const gestureLatest = useJarvisStore((s) => s.gestureLatest)
  const setGestureLatest = useJarvisStore((s) => s.setGestureLatest)
  const setGestureBootStream = useJarvisStore((s) => s.setGestureBootStream)
  const setGesturePreviewVisible = useJarvisStore((s) => s.setGesturePreviewVisible)
  const setStatusMsg = useJarvisStore((s) => s.setStatusMsg)
  const setGestureSession = useJarvisStore((s) => s.setGestureSession)
  const toggleGestures = useJarvisStore((s) => s.toggleGestures)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const ownsStreamRef = useRef(false) // only stop tracks we opened ourselves
  const landmarkerRef = useRef(null) // holds GestureRecognizer instance
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)
  const prevRef = useRef({
    slots: [],
    cx: null,
    cy: null,
    fingerDist: null,
    dualDist: null,
    yaw: 0,
    pitch: 0,
    aimIndex: null,
    pointSince: 0,
    dwellIndex: null,
    expandSince: 0,
    minimizeSince: 0,
    fistSince: 0,
    palmSince: 0,
    dualFistSince: 0,
    stillX: null,
    stillY: null,
    smoothZoom: 0,
    firedPointIndex: null,
    lastActionAt: 0,
  })
  const runGestures = enabled && !visionCameraActive

  useEffect(() => {
    if (!runGestures) {
      cancelAnimationFrame(rafRef.current)
      landmarkerRef.current?.close?.()
      landmarkerRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      if (!enabled) {
        if (ownsStreamRef.current) {
          streamRef.current?.getTracks?.().forEach((t) => t.stop())
        }
        streamRef.current = null
        ownsStreamRef.current = false
        setGestureSession?.({ running: false, pid: null, source: null })
        setGestureLatest({
          active: false,
          gesture: 'none',
          yaw: 0,
          pitch: 0,
          zoom: 0,
          select: 0,
          hands: 0,
          message: 'Gestures off',
          source: 'browser',
          ts: Date.now() / 1000,
        })
      } else if (visionCameraActive) {
        if (videoRef.current) videoRef.current.srcObject = null
        setGestureLatest({
          active: false,
          gesture: 'none',
          message: 'Paused — Vision using camera',
          source: 'browser',
          ts: Date.now() / 1000,
        })
        setStatusMsg('GESTURES PAUSED — VISION CAMERA')
      }
      return undefined
    }

    let cancelled = false

    const boot = async () => {
      try {
        // Wait for hidden <video> to mount (Strict Mode / first paint)
        let video = videoRef.current
        for (let i = 0; i < 20 && !video; i++) {
          await new Promise((r) => setTimeout(r, 50))
          if (cancelled) return
          video = videoRef.current
        }
        if (!video) {
          setStatusMsg('GESTURE FAILED — video element missing')
          return
        }

        setStatusMsg('GESTURES — STARTING CAMERA…')
        let stream = useJarvisStore.getState().gestureBootStream
        let createdHere = false
        if (!streamHasLiveVideo(stream)) {
          stream = await requestGestureCamera()
          createdHere = true
          setGestureBootStream(stream)
        }
        if (cancelled) {
          // Never kill the click-granted boot stream on Strict Mode remount
          if (createdHere) stream.getTracks().forEach((t) => t.stop())
          return
        }
        ownsStreamRef.current = createdHere
        streamRef.current = stream
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        try {
          await video.play()
        } catch (playErr) {
          console.warn('[GestureRuntime] video.play', playErr)
          // Retry once with a fresh stream from this path
          if (!cancelled) {
            stream = await requestGestureCamera()
            createdHere = true
            ownsStreamRef.current = true
            streamRef.current = stream
            setGestureBootStream(stream)
            video.srcObject = stream
            await video.play()
          }
        }

        await new Promise((resolve) => {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            resolve()
            return
          }
          const onReady = () => {
            video.removeEventListener('loadeddata', onReady)
            resolve()
          }
          video.addEventListener('loadeddata', onReady)
          setTimeout(resolve, 2500)
        })
        if (cancelled) return

        setStatusMsg('GESTURES — LOADING MEDIAPIPE LIST…')
        const fileset = await loadFileset()
        const recognizer = await loadGestureRecognizer(fileset)
        if (cancelled) {
          recognizer.close()
          return
        }
        landmarkerRef.current = recognizer
        setGestureSession?.({ running: true, pid: null, source: 'browser' })
        setGesturePreviewVisible(true)
        setStatusMsg('GESTURES ON — CAMERA LIVE')

        const tick = () => {
          if (cancelled || !landmarkerRef.current) return
          const v = videoRef.current
          const canvas = canvasRef.current
          if (!v || v.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick)
            return
          }

          let now = performance.now()
          if (now <= lastTsRef.current) now = lastTsRef.current + 1
          lastTsRef.current = now

          let result
          try {
            result = landmarkerRef.current.recognizeForVideo(v, now)
          } catch (err) {
            console.warn('[GestureRuntime] recognize', err)
            rafRef.current = requestAnimationFrame(tick)
            return
          }

          const landmarksList = result?.landmarks || []
          const gesturesList = result?.gestures || []
          const handPacks = landmarksList.map((lm, i) => {
            const top = topGesture(gesturesList[i])
            return { landmarks: lm, canned: top.name, score: top.score }
          })

          const prev = prevRef.current
          const repos = repoAimList()
          const plan = planDualHand(handPacks, prev, repos, Date.now())
          const accent = GESTURE_COLOR[plan.gesture] || GESTURE_COLOR.none

          if (canvas) {
            const w = canvas.width
            const h = canvas.height
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.save()
              ctx.clearRect(0, 0, w, h)
              ctx.translate(w, 0)
              ctx.scale(-1, 1)
              ctx.drawImage(v, 0, 0, w, h)

              landmarksList.forEach((lm, i) => {
                const g = plan.hands[i]?.gesture || 'move'
                drawHand(ctx, lm, w, h, GESTURE_COLOR[g] || accent)
              })

              if (landmarksList.length >= 2) {
                const p0 = landmarksList[0][9]
                const p1 = landmarksList[1][9]
                ctx.strokeStyle = 'rgba(0,217,255,0.85)'
                ctx.lineWidth = 2
                ctx.setLineDash([6, 4])
                ctx.beginPath()
                ctx.moveTo(p0.x * w, p0.y * h)
                ctx.lineTo(p1.x * w, p1.y * h)
                ctx.stroke()
                ctx.setLineDash([])
              }

              const pointer = plan.hands.find((h) => h.gesture === 'point')
              if (pointer) {
                const tip = landmarksList[plan.hands.indexOf(pointer)]?.[8]
                if (tip) {
                  ctx.strokeStyle = '#ffffff'
                  ctx.lineWidth = 1.5
                  const tx = tip.x * w
                  const ty = tip.y * h
                  ctx.beginPath()
                  ctx.moveTo(tx - 10, ty)
                  ctx.lineTo(tx + 10, ty)
                  ctx.moveTo(tx, ty - 10)
                  ctx.lineTo(tx, ty + 10)
                  ctx.stroke()
                }
              }
              ctx.restore()

              ctx.fillStyle = 'rgba(0,8,16,0.8)'
              ctx.fillRect(0, h - 44, w, 44)
              ctx.fillStyle = accent
              ctx.font = '600 11px ui-monospace, monospace'
              const n = landmarksList.length
              const cannedBits = (plan.hands || [])
                .map((h) => (h.canned && h.canned !== 'None' ? h.canned : h.gesture))
                .join(' · ')
              ctx.fillText(n ? `${n}H · ${cannedBits || plan.gesture}` : 'NO HAND', 8, h - 26)
              ctx.fillStyle = '#9fb3c8'
              ctx.font = '10px ui-monospace, monospace'
              ctx.fillText(plan.message || '', 8, h - 10)
            }
          }

          const payload = {
            active: landmarksList.length > 0,
            source: 'browser',
            gesture: plan.gesture,
            mode: plan.mode,
            yaw: plan.yaw || 0,
            pitch: plan.pitch || 0,
            zoom: plan.zoom || 0,
            select: plan.select || 0,
            selectTarget: plan.selectTarget,
            hoverIndex: plan.hoverIndex,
            hands: landmarksList.length,
            handGestures: (plan.hands || []).map((h) => h.gesture),
            cannedGestures: (plan.hands || []).map((h) => h.canned || 'None'),
            dualDist: plan.dualDist,
            fingers: plan.hands?.[0]?.fingers || 0,
            cursor: plan.cursor || { x: 0.5, y: 0.5 },
            message: plan.message,
            ts: Date.now() / 1000,
          }

          setGestureLatest(payload)
          if (payload.active && (payload.gesture !== 'none' || payload.select || payload.zoom)) {
            postEvent(payload)
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch (e) {
        console.error('[GestureRuntime]', e)
        setStatusMsg(`GESTURE FAILED — ${String(e?.message || e).slice(0, 50)}`)
        // Keep gestureControlEnabled — user can retry; only clear if camera hard-failed
        setGestureSession?.({ running: false, pid: null, source: null })
        setGestureLatest({
          active: false,
          gesture: 'none',
          message: String(e?.message || e),
          source: 'browser',
          ts: Date.now() / 1000,
        })
      }
    }

    boot()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      landmarkerRef.current?.close?.()
      landmarkerRef.current = null
      // Do NOT stop MediaStream here — Strict Mode remount would kill the click-granted camera
    }
  }, [
    runGestures,
    enabled,
    visionCameraActive,
    setGestureLatest,
    setGestureBootStream,
    setGesturePreviewVisible,
    setStatusMsg,
    setGestureSession,
  ])

  const showPanel = enabled
  const showPreview = enabled && previewVisible && !visionCameraActive
  const tracking = Boolean(gestureLatest?.active)
  const handCount = gestureLatest?.hands || 0
  const label = (gestureLatest?.gesture || 'none').toUpperCase()

  return (
    <>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: -9999 }}
      />

      {showPanel ? (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 120,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'stretch',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              width: 300,
              background: 'rgba(0, 8, 16, 0.92)',
              border: `1px solid ${tracking ? 'rgba(0,200,255,0.55)' : 'rgba(0,200,255,0.2)'}`,
              borderRadius: 6,
              boxShadow: tracking ? '0 0 24px rgba(0,200,255,0.25)' : '0 8px 28px rgba(0,0,0,0.45)',
              overflow: 'hidden',
              display: showPreview ? 'block' : 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderBottom: '1px solid rgba(0,200,255,0.12)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.12em',
                color: tracking ? 'var(--cyan)' : 'var(--text-dim)',
              }}
            >
              <span>
                HAND CAM · {handCount}/2 · {tracking ? label : 'SEEKING'}
              </span>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 9, padding: '3px 8px' }}
                onClick={() => setGesturePreviewVisible(false)}
              >
                HIDE
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={300}
              height={220}
              style={{ display: 'block', width: 300, height: 220, background: '#050a0f' }}
            />
            <div
              style={{
                padding: '6px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-dim)',
                lineHeight: 1.45,
                maxHeight: 110,
                overflowY: 'auto',
              }}
            >
              <div style={{ color: 'var(--cyan)', marginBottom: 4 }}>MEDIAPIPE LIST</div>
              {MEDIAPIPE_CANNED_GESTURES.map((g) => (
                <div key={g.id}>{g.hint}</div>
              ))}
              <div style={{ color: 'var(--amber)', margin: '6px 0 4px' }}>CUSTOM</div>
              {CUSTOM_CONTROL_GESTURES.map((g) => (
                <div key={g.id}>{g.hint}</div>
              ))}
            </div>
          </div>

          {!showPreview ? (
            <button
              type="button"
              className="btn btn-gold"
              style={{ fontSize: 11, padding: '8px 12px' }}
              onClick={() => setGesturePreviewVisible(true)}
            >
              SHOW HAND CAM
            </button>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              style={{
                flex: 1,
                fontSize: 11,
                padding: '8px 10px',
                borderColor: previewVisible ? 'var(--cyan)' : undefined,
                color: previewVisible ? 'var(--cyan)' : undefined,
              }}
              onClick={() => setGesturePreviewVisible(!previewVisible)}
            >
              {previewVisible ? 'PREVIEW ON' : 'PREVIEW OFF'}
            </button>
            <button
              type="button"
              className="btn"
              style={{
                flex: 1,
                fontSize: 11,
                padding: '8px 10px',
                borderColor: 'var(--amber)',
                color: 'var(--amber)',
              }}
              onClick={() => void toggleGestures()}
            >
              STOP
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
