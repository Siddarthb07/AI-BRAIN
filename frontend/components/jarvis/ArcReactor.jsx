'use client'

/**
 * ArcReactor — concentric rotating holo rings with a glowing core.
 * Purely presentational. Used as the HUD logo, loaders, and the
 * dashboard graph centerpiece frame.
 *
 * Props:
 *   size    px diameter (default 40)
 *   core    show the glowing center (default true)
 *   halo    show the outer bloom (default false)
 *   speed   'slow' | 'normal' (default 'normal')
 */
export default function ArcReactor({ size = 40, core = true, halo = false, speed = 'normal', style }) {
  const slow = speed === 'slow'
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    >
      {halo ? <div className="arc-reactor-halo" /> : null}
      <div className="arc-ring arc-ring--arcs" style={{ animationDuration: slow ? '40s' : '12s' }} />
      <div className="arc-ring arc-ring--ticks" style={{ inset: size * 0.12, animationDuration: slow ? '70s' : '36s' }} />
      <div className="arc-ring arc-ring--dashed" style={{ inset: size * 0.24, animationDuration: slow ? '50s' : '24s' }} />
      <div
        className="arc-ring"
        style={{
          inset: size * 0.34,
          border: '1px solid rgba(0,217,255,0.18)',
          borderRadius: '50%',
          animation: `arc-spin-rev ${slow ? '60s' : '30s'} linear infinite`,
        }}
      />
      {core ? (
        <div
          className="arc-core"
          style={{
            position: 'absolute',
            inset: size * 0.4,
          }}
        />
      ) : null}
    </div>
  )
}
