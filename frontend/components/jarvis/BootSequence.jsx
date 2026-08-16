'use client'

import { useEffect, useState } from 'react'
import ArcReactor from './ArcReactor'
import { useJarvisStore } from '../../app/store'

const BOOT_LINES = [
  'INITIALIZING J.A.R.V.I.S. KERNEL',
  'MOUNTING NEURAL CORE',
  'CALIBRATING HOLOGRAPHIC INTERFACE',
  'LINKING KNOWLEDGE GRAPH',
  'ARMING VOICE / GESTURE / VISION',
  'SYSTEMS ONLINE',
]

export default function BootSequence() {
  const [line, setLine] = useState(0)
  const [done, setDone] = useState(false)
  const [recap, setRecap] = useState(false)
  const bootRecap = useJarvisStore((s) => s.bootRecap)
  const fetchArmory = useJarvisStore((s) => s.fetchArmory)

  useEffect(() => {
    if (sessionStorage.getItem('jarvis-booted') === '1') {
      setDone(true)
      return undefined
    }
    fetchArmory()
    const t = setInterval(() => {
      setLine((l) => {
        if (l >= BOOT_LINES.length - 1) {
          clearInterval(t)
          return l
        }
        return l + 1
      })
    }, 420)
    const recapT = setTimeout(() => setRecap(true), 5200)
    const end = setTimeout(() => {
      sessionStorage.setItem('jarvis-booted', '1')
      setDone(true)
    }, 9800)
    return () => {
      clearInterval(t)
      clearTimeout(end)
      clearTimeout(recapT)
    }
  }, [fetchArmory])

  if (done) return null

  const recapLine = bootRecap?.line || `${bootRecap?.armed ?? '—'} keys armed · ${bootRecap?.repos ?? '—'} repos`

  return (
    <div className="jarvis-boot" aria-hidden>
      <div className="jarvis-boot-reactor">
        <ArcReactor size={220} core speed="slow" style={{ position: 'absolute', inset: 0 }} />
      </div>
      <div className="jarvis-boot-title glitch-text">J.A.R.V.I.S.</div>
      <div className="jarvis-boot-subtitle">Just A Rather Very Intelligent System</div>
      <div className="jarvis-boot-log">
        {recap ? recapLine.toUpperCase() : BOOT_LINES[line] || BOOT_LINES[BOOT_LINES.length - 1]}
      </div>
      {recap ? <div className="boot-recap-pulse">LINK CONFIRMED</div> : null}
      <div className="jarvis-boot-bar">
        <div className="jarvis-boot-bar-fill" />
      </div>
    </div>
  )
}
