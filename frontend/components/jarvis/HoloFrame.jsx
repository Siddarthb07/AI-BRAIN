'use client'

/**
 * HoloFrame — JARVIS holographic panel wrapper.
 * Clipped-corner glass panel with corner brackets, an optional
 * title strip, and a boot-in animation on mount.
 *
 * Props:
 *   title     optional uppercase strip label
 *   right     optional node rendered on the right of the title strip
 *   pad       inner padding (default 14)
 *   style     extra styles for the outer shell
 *   bodyStyle extra styles for the content area
 */
export default function HoloFrame({ title, right, pad = 14, style, bodyStyle, children }) {
  return (
    <div className="holo-panel holo-corners boot-in" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, ...style }}>
      {title ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 14px 7px',
            borderBottom: '1px solid rgba(0,217,255,0.14)',
            background: 'linear-gradient(90deg, rgba(0,217,255,0.08), transparent 70%)',
            flexShrink: 0,
          }}
        >
          <span
            className="decode-text"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: 'var(--cyan)',
              textShadow: '0 0 8px rgba(0,217,255,0.45)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          {right ? <span style={{ flexShrink: 0 }}>{right}</span> : null}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: pad, ...bodyStyle }}>{children}</div>
    </div>
  )
}
