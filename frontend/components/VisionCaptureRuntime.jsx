'use client'

/**
 * Always-mounted vision capture — voice / store can trigger camera without
 * requiring the Vision lab panel to be open.
 */

import { useEffect, useRef } from 'react'
import { useJarvisStore } from '../app/store'
import { requestGestureCamera, streamHasLiveVideo } from '../lib/gestures'

async function waitForVideo(video, timeoutMs = 2500) {
  if (!video) return false
  if (video.videoWidth > 0 && video.readyState >= 2) return true
  return new Promise((resolve) => {
    const done = (ok) => {
      video.removeEventListener('loadeddata', onReady)
      resolve(ok)
    }
    const onReady = () => done(video.videoWidth > 0)
    video.addEventListener('loadeddata', onReady)
    setTimeout(() => done(video.videoWidth > 0), timeoutMs)
  })
}

export default function VisionCaptureRuntime() {
  const request = useJarvisStore((s) => s.visionCaptureRequest)
  const analyzeVision = useJarvisStore((s) => s.analyzeVision)
  const finishVisionCapture = useJarvisStore((s) => s.finishVisionCapture)
  const setVisionCameraActive = useJarvisStore((s) => s.setVisionCameraActive)
  const setStatusMsg = useJarvisStore((s) => s.setStatusMsg)
  const setGesturePreviewVisible = useJarvisStore((s) => s.setGesturePreviewVisible)

  const videoRef = useRef(null)
  const busyRef = useRef(false)
  const lastIdRef = useRef(null)

  useEffect(() => {
    if (!request?.id || request.id === lastIdRef.current) return undefined
    if (busyRef.current) return undefined
    lastIdRef.current = request.id
    busyRef.current = true

    let ownedStream = null
    let cancelled = false

    const run = async () => {
      const prompt =
        (request.prompt || '').trim() ||
        'Describe clearly what is visible in this camera frame. Be concrete and brief.'

      setStatusMsg('VISION — OPENING CAMERA…')
      setGesturePreviewVisible(false)

      try {
        const video = videoRef.current
        if (!video) throw new Error('Vision video element missing')

        const boot = useJarvisStore.getState().gestureBootStream
        let stream = streamHasLiveVideo(boot) ? boot : null
        if (!stream) {
          stream = await requestGestureCamera()
          ownedStream = stream
        }

        if (cancelled) return

        setVisionCameraActive(true)
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        try {
          await video.play()
        } catch {
          // Retry with a fresh stream if reuse failed
          if (!ownedStream) {
            stream = await requestGestureCamera()
            ownedStream = stream
            video.srcObject = stream
            await video.play()
          } else {
            throw new Error('Camera play failed')
          }
        }

        const ready = await waitForVideo(video)
        if (!ready) throw new Error('Camera not ready')
        await new Promise((r) => setTimeout(r, 280))
        if (cancelled) return

        setStatusMsg('VISION — CAPTURING FRAME…')
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
        if (!blob) throw new Error('Frame capture failed')

        setStatusMsg('VISION — ANALYZING…')
        const result = await analyzeVision(blob, prompt)
        const analysis = (result?.analysis || '').trim()
        const degraded = result?.provider === 'text_fallback' || Boolean(result?.error)

        finishVisionCapture({
          id: request.id,
          ok: Boolean(analysis),
          analysis,
          error: result?.error || (!analysis ? 'No analysis returned' : null),
          degraded,
          provider: result?.provider,
          model: result?.model,
          previewUrl: URL.createObjectURL(blob),
        })
        setStatusMsg(analysis ? 'VISION — CAPTURE READY' : 'VISION — CAPTURE FAILED')
      } catch (e) {
        const msg = String(e?.message || e)
        finishVisionCapture({
          id: request.id,
          ok: false,
          analysis: '',
          error: msg,
          degraded: true,
        })
        setStatusMsg(`VISION FAILED — ${msg.slice(0, 50)}`)
      } finally {
        try {
          if (videoRef.current) videoRef.current.srcObject = null
        } catch {}
        if (ownedStream) {
          try {
            ownedStream.getTracks().forEach((t) => t.stop())
          } catch {}
        }
        setVisionCameraActive(false)
        // Restore hand cam if gestures still on
        if (useJarvisStore.getState().gestureControlEnabled) {
          setGesturePreviewVisible(true)
        }
        busyRef.current = false
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [
    request,
    analyzeVision,
    finishVisionCapture,
    setVisionCameraActive,
    setStatusMsg,
    setGesturePreviewVisible,
  ])

  return (
    <video
      ref={videoRef}
      playsInline
      muted
      autoPlay
      style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: -9999 }}
    />
  )
}
