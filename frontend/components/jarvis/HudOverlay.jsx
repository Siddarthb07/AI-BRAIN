'use client'

import { useEffect, useState } from 'react'
import { useJarvisStore } from '../../app/store'

function useClock() {
  // Starts null so SSR and first client render match; ticks after mount.
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/**
 * HudOverlay — fixed full-screen JARVIS decorations.
 * Edge tick rulers, bottom-corner readouts (time / shell mode / sys state).
 * pointer-events: none everywhere; purely decorative.
 */
export default function HudOverlay() {
  const shellMode = useJarvisStore((s) => s.shellMode)
  const healthState = useJarvisStore((s) => s.healthState)
  const now = useClock()

  const hh = now ? String(now.getHours()).padStart(2, '0') : '--'
  const mm = now ? String(now.getMinutes()).padStart(2, '0') : '--'
  const ss = now ? String(now.getSeconds()).padStart(2, '0') : '--'
  const online = healthState?.ollama || healthState?.groq

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9000 }}>
      {/* Edge tick rulers */}
      <div className="hud-tick" style={{ position: 'absolute', bottom: 4, left: 120, right: 120 }} />
      <div className="hud-tick hud-tick--v" style={{ position: 'absolute', right: 4, top: 120, bottom: 120 }} />

      {/* Bottom-left readout */}
      <div style={{ position: 'absolute', left: 12, bottom: 10, display: 'flex', gap: 18, alignItems: 'baseline' }}>
        <span className="readout-label">SYS</span>
        <span className="readout-value" style={{ color: online ? 'var(--cyan)' : 'var(--red)' }}>
          {online ? 'ONLINE' : 'OFFLINE'}
        </span>
        <span className="readout-label">MODE</span>
        <span className="readout-value">{(shellMode || 'dashboard').toUpperCase()}</span>
      </div>

      {/* Bottom-right clock */}
      <div style={{ position: 'absolute', right: 14, bottom: 10, display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span className="readout-label">LOCAL</span>
        <span className="readout-value">
          {hh}:{mm}:{ss}
        </span>
      </div>
    </div>
  )
}
