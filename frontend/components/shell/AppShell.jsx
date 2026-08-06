'use client'

export default function AppShell({ children, sidebar, rightPanel, miniMap }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {sidebar ? (
          <aside
            style={{
              width: 268,
              flexShrink: 0,
              borderRight: '1px solid rgba(255,170,80,0.12)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'rgba(12, 10, 18, 0.55)',
            }}
          >
            {sidebar}
          </aside>
        ) : null}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{children}</main>
        {rightPanel ? (
          <aside
            style={{
              width: 280,
              flexShrink: 0,
              borderLeft: '1px solid rgba(0,200,255,0.12)',
              overflow: 'auto',
            }}
          >
            {rightPanel}
          </aside>
        ) : null}
      </div>
      {miniMap ? (
        <div
          style={{
            height: 240,
            flexShrink: 0,
            borderTop: '1px solid rgba(0,200,255,0.12)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {miniMap}
        </div>
      ) : null}
    </div>
  )
}
