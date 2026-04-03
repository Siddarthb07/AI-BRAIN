'use client'
import { useEffect, useState } from 'react'

import { useJarvisStore } from '../app/store'
import { formatIstEventDateTime, formatIstEventWhen } from '../lib/time'

function formatEventWhen(event) {
  if (!event?.start) return 'Time pending'

  if (event.all_day) {
    return formatIstEventWhen(event.start)
  }

  return formatIstEventDateTime(event.start)
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: '120px',
        background: 'rgba(0,200,255,0.04)',
        border: '1px solid rgba(0,200,255,0.12)',
        borderRadius: '4px',
        padding: '8px 10px',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.12em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--cyan)', marginTop: '3px' }}>{value}</div>
    </div>
  )
}

export default function CalendarPanel() {
  const googleCalendar = useJarvisStore((state) => state.googleCalendar)
  const fetchGoogleCalendarStatus = useJarvisStore((state) => state.fetchGoogleCalendarStatus)
  const connectGoogleCalendar = useJarvisStore((state) => state.connectGoogleCalendar)
  const syncGoogleCalendar = useJarvisStore((state) => state.syncGoogleCalendar)
  const disconnectGoogleCalendar = useJarvisStore((state) => state.disconnectGoogleCalendar)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchGoogleCalendarStatus({ silent: true })
  }, [fetchGoogleCalendarStatus])

  const handleSync = async () => {
    setBusy(true)
    try {
      await syncGoogleCalendar()
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    try {
      await disconnectGoogleCalendar()
      await fetchGoogleCalendarStatus({ silent: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scroll-area" style={{ padding: '18px', height: '100%', maxHeight: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: '4px' }}>
          GOOGLE CALENDAR
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--cyan)', letterSpacing: '0.08em', lineHeight: 1.4 }}>
          Schedule-aware planning for your brief and chat
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.55, marginTop: '8px' }}>
          Connect your Google Calendar so JARVIS can surface upcoming events, factor your schedule into recommendations, and keep the brief grounded in your day.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <StatCard label="STATUS" value={googleCalendar.connected ? 'CONNECTED' : googleCalendar.configured ? 'READY TO CONNECT' : 'SETUP NEEDED'} />
        <StatCard label="CALENDAR" value={googleCalendar.calendar_label || 'Primary calendar'} />
        <StatCard label="UP NEXT" value={googleCalendar.upcoming_count || 0} />
      </div>

      {googleCalendar.last_error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 12px',
            border: '1px solid rgba(255,56,96,0.3)',
            background: 'rgba(255,56,96,0.06)',
            color: '#ffd5de',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            lineHeight: 1.5,
          }}
        >
          {googleCalendar.last_error}
        </div>
      )}

      {!googleCalendar.configured && (
        <>
          <div className="section-header">SETUP</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '12px' }}>
            Add these backend environment variables, then rebuild the containers:
          </div>
          {[
            `GOOGLE_CLIENT_ID=...`,
            `GOOGLE_CLIENT_SECRET=...`,
            `GOOGLE_REDIRECT_URI=${googleCalendar.redirect_uri || 'http://localhost:8001/calendar/google/callback'}`,
            `GOOGLE_FRONTEND_URL=${googleCalendar.frontend_url || 'http://localhost:5050'}`,
            `GOOGLE_CALENDAR_ID=primary`,
          ].map((item) => (
            <div
              key={item}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--cyan)',
                background: 'rgba(0,200,255,0.04)',
                border: '1px solid rgba(0,200,255,0.1)',
                borderRadius: '4px',
                padding: '10px 12px',
                marginBottom: '8px',
              }}
            >
              {item}
            </div>
          ))}
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            In Google Cloud, add the redirect URI shown above to your OAuth client before you try to connect.
          </div>
        </>
      )}

      {googleCalendar.configured && !googleCalendar.connected && (
        <>
          <div className="section-header">CONNECT</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '14px' }}>
            The backend is configured. Start the Google sign-in flow and approve read-only calendar access.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-gold" onClick={connectGoogleCalendar}>
              CONNECT GOOGLE CALENDAR
            </button>
            <button className="btn" onClick={() => fetchGoogleCalendarStatus({ silent: false })}>
              CHECK STATUS
            </button>
          </div>
        </>
      )}

      {googleCalendar.connected && (
        <>
          <div className="section-header">UPCOMING EVENTS</div>
          {googleCalendar.events.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
              The calendar is connected, but there are no upcoming events in the current sync window.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {googleCalendar.events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(0, 200, 255, 0.03)',
                    borderLeft: '2px solid rgba(0, 200, 255, 0.25)',
                    borderRadius: '0 4px 4px 0',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--cyan)', letterSpacing: '0.05em', lineHeight: 1.4 }}>
                    {event.summary || 'Untitled event'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', marginTop: '4px' }}>
                    {formatEventWhen(event)}
                  </div>
                  {event.location && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                      {event.location}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-gold" onClick={handleSync} disabled={busy}>
              {busy ? 'SYNCING...' : 'SYNC NOW'}
            </button>
            <button className="btn" onClick={() => fetchGoogleCalendarStatus({ silent: false })} disabled={busy}>
              REFRESH STATUS
            </button>
            <button className="btn btn-red" onClick={handleDisconnect} disabled={busy}>
              DISCONNECT
            </button>
          </div>
        </>
      )}
    </div>
  )
}
