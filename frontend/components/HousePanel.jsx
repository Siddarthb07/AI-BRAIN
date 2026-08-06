'use client'

import { useEffect, useState } from 'react'
import { useJarvisStore } from '../app/store'

export default function HousePanel() {
  const houseStatus = useJarvisStore((s) => s.houseStatus)
  const houseEntities = useJarvisStore((s) => s.houseEntities)
  const fetchHouseStatus = useJarvisStore((s) => s.fetchHouseStatus)
  const fetchHouseEntities = useJarvisStore((s) => s.fetchHouseEntities)
  const proposeHouseService = useJarvisStore((s) => s.proposeHouseService)
  const confirmAction = useJarvisStore((s) => s.confirmAction)
  const statusMsg = useJarvisStore((s) => s.statusMsg)

  const [busyEntity, setBusyEntity] = useState(null)
  const [sceneBusy, setSceneBusy] = useState(false)

  useEffect(() => {
    fetchHouseStatus()
    fetchHouseEntities()
  }, [fetchHouseEntities, fetchHouseStatus])

  const writable = (houseEntities || []).filter((e) => {
    const id = String(e.id || e.entity_id || '')
    return id.startsWith('light.') || id.startsWith('switch.')
  })

  const handleToggle = async (ent, service) => {
    const id = ent.id || ent.entity_id
    setBusyEntity(`${id}:${service}`)
    try {
      const proposed = await proposeHouseService({
        entity_id: id,
        service,
        backend: houseStatus?.backend_default || 'sim',
      })
      if (proposed?.action?.id && proposed?.action?.confirm_token) {
        await confirmAction(proposed.action.id, proposed.action.confirm_token)
        await fetchHouseEntities()
      }
    } finally {
      setBusyEntity(null)
    }
  }

  const runEvening = async () => {
    setSceneBusy(true)
    try {
      const API = (await import('../lib/api')).resolveApiBase()
      await fetch(`${api()}/house/scene/evening`, { method: 'POST' })
      await fetchHouseEntities()
    } finally {
      setSceneBusy(false)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '18px 20px', gap: 14 }}>
      <div>
        <div className="section-header" style={{ marginBottom: 6 }}>
          HOUSE
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
          {(houseStatus?.backend_default || houseStatus?.backend || 'sim').toUpperCase()}
          {' · '}
          {(houseEntities || []).length} entities
          {houseStatus?.ha_configured ? ' · Home Assistant' : ' · Simulation'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" style={{ fontSize: 10 }} onClick={() => fetchHouseEntities()}>
          REFRESH
        </button>
        <button type="button" className="btn btn-gold" style={{ fontSize: 10 }} disabled={sceneBusy} onClick={runEvening}>
          EVENING SCENE
        </button>
      </div>

      <div className="scroll-area" style={{ flex: 1, minHeight: 0 }}>
        {writable.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
            No writable lights/switches. Connect HA or use sim backend.
          </div>
        ) : (
          writable.map((ent) => {
            const id = ent.id || ent.entity_id
            const on = String(ent.state || '').toLowerCase() === 'on'
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(255,170,60,0.12)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-primary)' }}>
                    {ent.name || id}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: on ? 'var(--amber)' : 'var(--text-dim)' }}>
                    {on ? 'ON' : 'OFF'} · {id}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 10, opacity: on ? 1 : 0.55 }}
                    disabled={busyEntity === `${id}:turn_on`}
                    onClick={() => handleToggle(ent, 'turn_on')}
                  >
                    ON
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 10, opacity: !on ? 1 : 0.55 }}
                    disabled={busyEntity === `${id}:turn_off`}
                    onClick={() => handleToggle(ent, 'turn_off')}
                  >
                    OFF
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{statusMsg}</div>
    </div>
  )
}
