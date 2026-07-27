'use client'

import { useEffect } from 'react'
import { useJarvisStore } from '../../app/store'

export default function VaultPanel() {
  const vaultNotes = useJarvisStore((s) => s.vaultNotes)
  const vaultStatus = useJarvisStore((s) => s.vaultStatus)
  const fetchVaultNotes = useJarvisStore((s) => s.fetchVaultNotes)
  const fetchVaultStatus = useJarvisStore((s) => s.fetchVaultStatus)
  const syncVault = useJarvisStore((s) => s.syncVault)
  const lastSaveToast = useJarvisStore((s) => s.lastSaveToast)

  useEffect(() => {
    fetchVaultStatus()
    fetchVaultNotes()
  }, [fetchVaultNotes, fetchVaultStatus])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', gap: '10px' }}>
      <div className="section-header">VAULT</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        {vaultStatus?.vault_path || 'Loading vault...'}
        <br />
        {vaultStatus?.note_count ?? 0} notes
      </div>
      <button type="button" className="btn" onClick={() => syncVault()} style={{ fontSize: '10px' }}>
        SYNC VAULT to RAG
      </button>
      {lastSaveToast ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--green)' }}>Saved: {lastSaveToast}</div>
      ) : null}
      <div className="scroll-area" style={{ flex: 1, minHeight: 0 }}>
        {vaultNotes.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', padding: '12px 0' }}>
            No notes yet. Save from chat or generate a brief.
          </div>
        ) : (
          vaultNotes.map((note) => (
            <div
              key={note.relative_path}
              style={{
                padding: '8px 0',
                borderBottom: '1px solid rgba(0,200,255,0.06)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ color: 'var(--cyan)', marginBottom: '2px' }}>{note.title || note.relative_path}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '9px' }}>{note.relative_path?.replace(/\\/g, '/')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
