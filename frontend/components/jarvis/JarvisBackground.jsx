'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * JarvisBackground — fixed, full-screen animated backdrop:
 * drifting cyan motes, expanding energy waves, and a faint
 * vertical data-rain. Purely decorative (pointer-events: none).
 */
export default function JarvisBackground() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const motes = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        dx: (Math.random() - 0.5) * 120,
        dy: -60 - Math.random() * 120,
        dur: 8 + Math.random() * 10,
        delay: Math.random() * 8,
      })),
    [],
  )

  const rainCols = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: (i / 22) * 100 + Math.random() * 2,
        dur: 9 + Math.random() * 12,
        delay: Math.random() * 10,
        chars: Array.from({ length: 18 }, () =>
          String.fromCharCode(0x30a0 + Math.floor(Math.random() * 60)),
        ).join(''),
      })),
    [],
  )

  const waves = useMemo(
    () => [
      { id: 0, delay: 0, dur: 6 },
      { id: 1, delay: 2, dur: 6 },
      { id: 2, delay: 4, dur: 6 },
    ],
    [],
  )

  if (!mounted) return null

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Energy waves from center */}
      {waves.map((w) => (
        <div
          key={w.id}
          className="jarvis-energy-wave"
          style={{ animationDelay: `${w.delay}s`, animationDuration: `${w.dur}s` }}
        />
      ))}

      {/* Data rain columns */}
      <div className="jarvis-data-rain">
        {rainCols.map((c) => (
          <div
            key={c.id}
            className="jarvis-data-rain-col"
            style={{
              left: `${c.left}%`,
              animationDuration: `${c.dur}s`,
              animationDelay: `${c.delay}s`,
            }}
          >
            {c.chars}
          </div>
        ))}
      </div>

      {/* Drifting motes */}
      <div className="jarvis-motes">
        {motes.map((m) => (
          <div
            key={m.id}
            className="jarvis-mote"
            style={{
              left: `${m.left}%`,
              top: `${m.top}%`,
              ['--dx']: `${m.dx}px`,
              ['--dy']: `${m.dy}px`,
              animationDuration: `${m.dur}s`,
              animationDelay: `${m.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
