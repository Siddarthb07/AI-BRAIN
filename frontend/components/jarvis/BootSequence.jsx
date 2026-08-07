'use client'

import { useEffect, useState } from 'react'
import ArcReactor from './ArcReactor'

const BOOT_LINES = [
  'INITIALIZING J.A.R.V.I.S. KERNEL',
  'MOUNTING NEURAL CORE',
  'CALIBRATING HOLOGRAPHIC INTERFACE',
  'LINKING KNOWLEDGE GRAPH',
  'ARMING VOICE / GESTURE / VISION',
  'SYSTEMS ONLINE',
]

/**
 * BootSequence — full-screen JARVIS boot overlay that plays once
 * on first mount, then fades away. Purely decorative.
 */
export default function BootSequence() {
  const [line, setLine] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('jarvis-booted') === '1') {
      setDone(true)
      return undefined
    }
    const t = setInterval(() => {
      setLine((l) => {
        if (l >= BOOT_LINES.length - 1) {
          clearInterval(t)
          return l
        }
        return l + 1
      })
    }, 420)
    const end = setTimeout(() => {
      sessionStorage.setItem('jarvis-booted', '1')
      setDone(true)
    }, 6800)
    return () => {
      clearInterval(t)
      clearTimeout(end)
    }
  }, [])

  if (done) return null

  return (
    <div className="jarvis-boot" aria-hidden>
      <div className="jarvis-boot-reactor">
        <ArcReactor size={220} core speed="slow" style={{ position: 'absolute', inset: 0 }} />
      </div>
      <div className="jarvis-boot-title glitch-text">J.A.R.V.I.S.</div>
      <div className="jarvis-boot-subtitle">Just A Rather Very Intelligent System</div>
      <div className="jarvis-boot-log">{BOOT_LINES[line] || BOOT_LINES[BOOT_LINES.length - 1]}</div>
      <div className="jarvis-boot-bar">
        <div className="jarvis-boot-bar-fill" />
      </div>
    </div>
  )
}
