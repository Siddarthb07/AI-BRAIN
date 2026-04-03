'use client'
import { useEffect } from 'react'

import { useJarvisStore } from '../app/store'
import { AMERICAN_VOICE_MATCHERS, speakText } from '../lib/speech'
import { formatIstEventDateTime, formatIstEventWhen } from '../lib/time'

function ActionItem({ text, index }) {
  return (
    <div
      className="fade-in"
      style={{
        animationDelay: `${index * 0.07}s`,
        padding: '8px 10px',
        marginBottom: '6px',
        background: 'rgba(0, 200, 255, 0.03)',
        borderLeft: '2px solid rgba(0, 200, 255, 0.25)',
        borderRadius: '0 4px 4px 0',
        fontFamily: 'var(--font-body)',
        fontSize: '14px',
        color: 'var(--text-primary)',
        lineHeight: 1.6,
      }}
    >
      {text}
    </div>
  )
}

function InsightItem({ text, index }) {
  return (
    <div
      className="fade-in"
      style={{
        animationDelay: `${index * 0.09}s`,
        padding: '7px 10px',
        marginBottom: '5px',
        background: 'rgba(240, 180, 41, 0.03)',
        borderLeft: '2px solid rgba(240, 180, 41, 0.3)',
        borderRadius: '0 4px 4px 0',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        color: 'rgba(240, 180, 41, 0.9)',
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  )
}

function formatCalendarWhen(event) {
  if (!event?.start) return 'Time pending'

  if (event.all_day) {
    return formatIstEventWhen(event.start)
  }

  return formatIstEventDateTime(event.start)
}

export default function BriefPanel() {
  const brief = useJarvisStore((state) => state.brief)
  const fetchBrief = useJarvisStore((state) => state.fetchBrief)
  const isLoading = useJarvisStore((state) => state.isLoading)
  const setActivePanel = useJarvisStore((state) => state.setActivePanel)
  const setVoiceState = useJarvisStore((state) => state.setVoiceState)

  useEffect(() => {
    fetchBrief()
  }, [fetchBrief])

  const speakBrief = async () => {
    const text = brief?.voice_summary || 'No brief available.'
    setVoiceState('speaking')
    const started = await speakText(text, {
      preferBrowser: true,
      preferBackend: true,
      backendMaxChars: 800,
      browserMaxChars: 260,
      browserChunkSize: 220,
      lang: 'en-US',
      rate: 0.98,
      pitch: 1,
      voiceMatchers: AMERICAN_VOICE_MATCHERS,
      onEnd: () => setVoiceState('idle'),
    })

    if (!started) setVoiceState('idle')
  }

  if (isLoading && !brief) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--cyan-dim)', letterSpacing: '0.15em' }}>
          COMPILING BRIEF...
        </div>
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="voice-bar" style={{ animationDelay: `${index * 0.15}s`, height: '20px', background: 'var(--cyan)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!brief) return null

  const calendarEvents = brief.calendar_events || []

  return (
    <div className="scroll-area" style={{ padding: '18px', height: '100%', maxHeight: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: '4px' }}>
          {brief.date?.toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--cyan)', letterSpacing: '0.08em', lineHeight: 1.5 }}>
          {brief.greeting}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'PROJECT', value: brief.active_project || '-' },
          { label: 'REPOS', value: brief.repos_count || 0 },
          { label: 'CALENDAR', value: brief.calendar_connected ? `${calendarEvents.length} UPCOMING` : 'OFF' },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              minWidth: '90px',
              background: 'rgba(0,200,255,0.04)',
              border: '1px solid rgba(0,200,255,0.1)',
              borderRadius: '4px',
              padding: '6px 10px',
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.12em' }}>{stat.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--cyan)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="section-header">PRIORITY ACTIONS</div>
      {(brief.priority_actions || []).map((action, index) => (
        <ActionItem key={index} text={action} index={index} />
      ))}

      <div className="section-header" style={{ marginTop: '16px' }}>
        INSIGHTS
      </div>
      {(brief.insights || []).map((insight, index) => (
        <InsightItem key={index} text={insight} index={index} />
      ))}

      <div className="section-header" style={{ marginTop: '16px' }}>
        LEARN TODAY
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
        {(brief.learning_goals || []).map((goal, index) => (
          <span key={index} className="tag">
            {goal}
          </span>
        ))}
      </div>

      {brief.calendar_connected && (
        <>
          <div className="section-header">SCHEDULE</div>
          {calendarEvents.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
              Google Calendar is connected, but no upcoming events are scheduled right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {calendarEvents.slice(0, 3).map((event) => (
                <div
                  key={event.id}
                  style={{
                    padding: '8px 10px',
                    background: 'rgba(0,255,159,0.03)',
                    borderLeft: '2px solid rgba(0,255,159,0.3)',
                    borderRadius: '0 4px 4px 0',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--green)', letterSpacing: '0.05em' }}>
                    {event.summary}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', marginTop: '3px' }}>
                    {formatCalendarWhen(event)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(brief.hn_stories || []).length > 0 && (
        <>
          <div className="section-header">HN SIGNALS</div>
          {(brief.hn_stories || []).slice(0, 3).map((story, index) => (
            <div
              key={index}
              style={{
                padding: '6px 10px',
                marginBottom: '5px',
                background: 'rgba(255,107,157,0.03)',
                borderLeft: '2px solid rgba(255,107,157,0.25)',
                borderRadius: '0 4px 4px 0',
              }}
            >
              <a
                href={story.url || '#'}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'rgba(255,107,157,0.9)',
                  textDecoration: 'none',
                  lineHeight: 1.4,
                  display: 'block',
                }}
              >
                {story.title}
              </a>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-dim)', marginTop: '2px' }}>
                SCORE {story.score}
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '18px', flexWrap: 'wrap' }}>
        <button className="btn btn-gold" onClick={speakBrief}>
          READ ALOUD
        </button>
        <button className="btn" onClick={fetchBrief}>
          REFRESH
        </button>
        <button className="btn" onClick={() => setActivePanel('calendar')}>
          CALENDAR
        </button>
        <button className="btn" onClick={() => setActivePanel('chat')}>
          CHAT
        </button>
      </div>
    </div>
  )
}
