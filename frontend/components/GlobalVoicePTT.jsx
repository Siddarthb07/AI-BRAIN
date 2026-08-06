'use client'

/**
 * Global Spacebar PTT — works on Dashboard / Work / Lab (not only Voice panel).
 * Hold Space → listen → voice command router → optional chat stream.
 */

import { useEffect, useRef } from 'react'
import { useJarvisStore } from '../app/store'
import {
  AMERICAN_VOICE_MATCHERS,
  createStreamingSpeaker,
  speakText as playSpeech,
  stopSpeechPlayback,
} from '../lib/speech'
import { routeVoiceCommand, VOICE_COMMAND_HELP } from '../lib/voiceCommands'

export default function GlobalVoicePTT() {
  const busyRef = useRef(false)
  const recognitionRef = useRef(null)
  const setStatusMsg = useJarvisStore((s) => s.setStatusMsg)
  const setVoiceState = useJarvisStore((s) => s.setVoiceState)
  const sendChat = useJarvisStore((s) => s.sendChat)
  const activePanel = useJarvisStore((s) => s.activePanel)
  const shellMode = useJarvisStore((s) => s.shellMode)
  const wakeEnabled = useJarvisStore((s) => s.wakeEnabled)

  useEffect(() => {
    const isTypingTarget = (el) => {
      const tag = (el?.tagName || '').toLowerCase()
      return tag === 'input' || tag === 'textarea' || el?.isContentEditable
    }

    // Voice panel owns Space; wake mic already listens continuously
    const skipGlobalPtt = () => wakeEnabled || (shellMode === 'work' && activePanel === 'voice')

    const processText = async (text) => {
      if (!text || busyRef.current) return
      busyRef.current = true
      setVoiceState('processing')
      setStatusMsg(`PTT → ${text.slice(0, 40)}…`)
      try {
        if (/\b(help|what can (?:i|you) say|voice commands)\b/i.test(text)) {
          setVoiceState('speaking')
          await playSpeech(VOICE_COMMAND_HELP, {
            preferBrowser: true,
            browserOnly: true,
            lang: 'en-US',
            rate: 1.05,
            voiceMatchers: AMERICAN_VOICE_MATCHERS,
          })
          return
        }

        const routed = await routeVoiceCommand(text, () => useJarvisStore.getState())
        if (routed.handled) {
          if (routed.speak) {
            setVoiceState('speaking')
            await playSpeech(routed.speak, {
              preferBrowser: true,
              browserOnly: true,
              lang: 'en-US',
              rate: 1.08,
              voiceMatchers: AMERICAN_VOICE_MATCHERS,
            })
          }
          if (routed.streamChat && routed.chat) {
            const speaker = createStreamingSpeaker({
              lang: 'en-US',
              rate: 1.08,
              voiceMatchers: AMERICAN_VOICE_MATCHERS,
              onStart: () => setVoiceState('speaking'),
              onEnd: () => setVoiceState('idle'),
            })
            await sendChat(routed.chat, {
              onToken: (d) => {
                void speaker.push(d)
              },
            })
            await speaker.end()
          }
          return
        }

        const speaker = createStreamingSpeaker({
          lang: 'en-US',
          rate: 1.08,
          voiceMatchers: AMERICAN_VOICE_MATCHERS,
          onStart: () => setVoiceState('speaking'),
          onEnd: () => setVoiceState('idle'),
        })
        await sendChat(text, {
          onToken: (d) => {
            void speaker.push(d)
          },
        })
        await speaker.end()
      } catch {
        setStatusMsg('PTT FAILED')
      } finally {
        busyRef.current = false
        setVoiceState('idle')
        setStatusMsg('JARVIS ONLINE')
      }
    }

    const start = () => {
      if (busyRef.current || skipGlobalPtt()) return
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) {
        setStatusMsg('PTT NEEDS CHROME/EDGE SPEECH')
        return
      }
      stopSpeechPlayback()
      const rec = new SR()
      recognitionRef.current = rec
      rec.continuous = false
      rec.interimResults = false
      rec.lang = 'en-US'
      rec.onstart = () => {
        setVoiceState('recording')
        setStatusMsg('PTT · LISTENING (release Space)')
      }
      rec.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript || ''
        void processText(text)
      }
      rec.onerror = () => {
        setVoiceState('idle')
        setStatusMsg('PTT · NO SPEECH')
      }
      rec.onend = () => {
        if (useJarvisStore.getState().voiceState === 'recording') {
          setVoiceState('idle')
        }
      }
      try {
        rec.start()
      } catch {
        setStatusMsg('PTT BUSY')
      }
    }

    const stop = () => {
      try {
        recognitionRef.current?.stop?.()
      } catch {}
    }

    const down = (e) => {
      if (e.code !== 'Space' || e.repeat) return
      if (isTypingTarget(e.target)) return
      if (skipGlobalPtt()) return
      e.preventDefault()
      start()
    }
    const up = (e) => {
      if (e.code !== 'Space') return
      if (skipGlobalPtt()) return
      stop()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      try {
        recognitionRef.current?.abort?.()
      } catch {}
    }
  }, [activePanel, sendChat, setStatusMsg, setVoiceState, shellMode, wakeEnabled])

  return null
}
