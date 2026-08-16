import { resolveApiBase, withAuth } from './api'

const api = () => resolveApiBase()


let activeAudio = null
let activeUrl = null
let speechToken = 0
let activeBackendController = null

export const FEMALE_AMERICAN_VOICE_MATCHERS = [
  'Aria',
  'Jenny',
  'Samantha',
  'Zira',
  'Hazel',
  'Ava',
  'Allison',
  'Emma',
  'Olivia',
  'Serena',
  'Nancy',
  'Female',
  'United States',
  'US English',
  'en-US',
]

export const AMERICAN_VOICE_MATCHERS = FEMALE_AMERICAN_VOICE_MATCHERS

const FEMALE_VOICE_HINTS = [
  'allison',
  'ana',
  'aria',
  'ava',
  'catherine',
  'emma',
  'eva',
  'female',
  'hazel',
  'jenny',
  'michelle',
  'nancy',
  'olivia',
  'samantha',
  'serena',
  'susan',
  'woman',
  'zira',
]

const MALE_VOICE_HINTS = [
  'david',
  'guy',
  'james',
  'male',
  'man',
  'mark',
]

const NON_US_ENGLISH_HINTS = [
  'australia',
  'australian',
  'british',
  'canada',
  'canadian',
  'india',
  'indian',
  'irish',
  'new zealand',
  'scotland',
  'uk',
  'united kingdom',
]

function voiceSignature(voice) {
  return `${voice.name} ${voice.voiceURI} ${voice.lang}`.toLowerCase()
}

function clearAudio(audio = activeAudio, url = activeUrl) {
  if (audio) {
    audio.pause()
    audio.currentTime = 0
    audio.onended = null
    audio.onerror = null
    if (audio === activeAudio) activeAudio = null
  }

  if (url) {
    URL.revokeObjectURL(url)
    if (url === activeUrl) activeUrl = null
  }
}

function cancelBackendRequest() {
  if (activeBackendController) {
    activeBackendController.abort()
    activeBackendController = null
  }
}

function beginPlaybackSession() {
  speechToken += 1
  cancelBackendRequest()
  clearAudio()

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }

  return speechToken
}

async function waitForVoices(timeoutMs = 120) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []

  const existing = window.speechSynthesis.getVoices()
  if (existing.length > 0) return existing

  return new Promise((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoices)
      resolve(window.speechSynthesis.getVoices())
    }

    const handleVoices = () => finish()

    window.speechSynthesis.addEventListener('voiceschanged', handleVoices)
    // Don't stall speech for 2s — speak with default voice if list is slow
    setTimeout(finish, timeoutMs)
  })
}

let cachedVoice = null
let cachedVoiceKey = ''

function pickVoiceCached(voices = [], voiceMatchers = []) {
  const key = `${voiceMatchers.join('|')}|${voices.length}`
  if (cachedVoice && cachedVoiceKey === key) return cachedVoice
  const voice = pickVoice(voices, voiceMatchers)
  cachedVoice = voice
  cachedVoiceKey = key
  return voice
}

/** Speakable clip — keeps more of the reply; trims ACTIONS JSON + markdown noise. */
export const DEFAULT_SPEECH_MAX_CHARS = 1600
export const DEFAULT_SPEECH_CHUNK_CHARS = 280

export function clipForSpeech(text = '', maxChars = DEFAULT_SPEECH_MAX_CHARS) {
  let cleaned = String(text)
    .replace(/\n?ACTIONS:\s*\[[\s\S]*$/i, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  if (cleaned.length <= maxChars) return cleaned
  const cut = cleaned.slice(0, maxChars)
  // Prefer ending on a sentence near the limit
  const sentences = cut.match(/[\s\S]+?[.!?]+(?=\s|$)/g)
  if (sentences) {
    let acc = ''
    for (const s of sentences) {
      if ((acc + s).length > maxChars) break
      acc += s
    }
    if (acc.length > 120) return acc.trim()
  }
  const space = cut.lastIndexOf(' ')
  return `${(space > 160 ? cut.slice(0, space) : cut).trim()}…`
}

function scoreVoice(voice) {
  const name = voiceSignature(voice)
  const lang = (voice.lang || '').toLowerCase()
  let score = 0

  if (lang.startsWith('en-us')) score += 40
  else if (lang.startsWith('en')) score += 8

  if (name.includes('united states') || name.includes('us english')) score += 24
  if (name.includes('natural')) score += 12
  if (name.includes('neural')) score += 10
  if (FEMALE_VOICE_HINTS.some((hint) => name.includes(hint))) score += 18
  if (MALE_VOICE_HINTS.some((hint) => name.includes(hint))) score -= 18
  if (voice.localService) score += 1
  if (NON_US_ENGLISH_HINTS.some((hint) => name.includes(hint))) score -= 18
  if (/(en-gb|en-in|en-au|en-ca|en-ie|en-nz)/.test(lang)) score -= 18

  return score
}

function pickVoice(voices = [], voiceMatchers = []) {
  const loweredMatchers = voiceMatchers.map((item) => item.toLowerCase())

  const matchedVoices = loweredMatchers.length > 0
    ? voices.filter((voice) => loweredMatchers.some((matcher) => voiceSignature(voice).includes(matcher)))
    : []

  const americanEnglishVoices = voices.filter((voice) => {
    const lang = (voice.lang || '').toLowerCase()
    const signature = voiceSignature(voice)
    return lang.startsWith('en-us') || signature.includes('united states') || signature.includes('us english')
  })

  if (matchedVoices.length > 0) {
    return [...matchedVoices].sort((left, right) => scoreVoice(right) - scoreVoice(left))[0]
  }

  if (americanEnglishVoices.length > 0) {
    return [...americanEnglishVoices].sort((left, right) => scoreVoice(right) - scoreVoice(left))[0]
  }

  const englishVoices = voices.filter((voice) => (voice.lang || '').toLowerCase().startsWith('en'))
  if (englishVoices.length > 0) {
    return [...englishVoices].sort((left, right) => scoreVoice(right) - scoreVoice(left))[0]
  }

  return [...voices].sort((left, right) => scoreVoice(right) - scoreVoice(left))[0] || null
}

function splitIntoChunks(text, maxChars = 220) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []

  const sentences = cleaned.split(/(?<=[.!?])\s+/)
  const chunks = []
  let current = ''

  for (const sentence of sentences) {
    if ((`${current} ${sentence}`).trim().length <= maxChars) {
      current = `${current} ${sentence}`.trim()
      continue
    }

    if (current) chunks.push(current)
    if (sentence.length <= maxChars) {
      current = sentence
      continue
    }

    const words = sentence.split(' ')
    let fragment = ''
    for (const word of words) {
      if ((`${fragment} ${word}`).trim().length <= maxChars) {
        fragment = `${fragment} ${word}`.trim()
      } else {
        if (fragment) chunks.push(fragment)
        fragment = word
      }
    }
    current = fragment
  }

  if (current) chunks.push(current)
  return chunks
}

async function speakInBrowser(text, options = {}, token = speechToken) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false
  }

  if (token !== speechToken) return false

  const voices = await waitForVoices()
  if (token !== speechToken) return false
  const preferred = pickVoiceCached(voices, options.voiceMatchers || AMERICAN_VOICE_MATCHERS)
  const hardCap = options.browserMaxChars ?? DEFAULT_SPEECH_MAX_CHARS
  const maxChunk = options.browserChunkSize ?? DEFAULT_SPEECH_CHUNK_CHARS
  const clipped = text.length > hardCap ? text.slice(0, hardCap) : text
  const chunks = splitIntoChunks(clipped, maxChunk)
  if (chunks.length === 0) return false

  // Chrome often silently pauses long TTS — nudge resume while this session is live
  const keepAlive = setInterval(() => {
    if (token !== speechToken) return
    try {
      window.speechSynthesis.resume()
    } catch {}
  }, 3500)

  const speakOne = (chunk, attempt = 0) =>
    new Promise((resolve) => {
      if (token !== speechToken) {
        resolve(false)
        return
      }
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = options.lang ?? preferred?.lang ?? 'en-US'
      utterance.rate = options.rate ?? 1.32
      utterance.pitch = options.pitch ?? 1
      utterance.volume = options.volume ?? 1
      if (preferred) utterance.voice = preferred

      let settled = false
      const finish = (ok) => {
        if (settled) return
        settled = true
        resolve(ok)
      }

      utterance.onend = () => finish(true)
      utterance.onerror = (event) => {
        const err = event?.error || ''
        // Chrome flakiness between chunks — retry once
        if (token === speechToken && attempt < 1 && (err === 'canceled' || err === 'interrupted' || err === 'network')) {
          try {
            window.speechSynthesis.cancel()
            window.speechSynthesis.resume()
          } catch {}
          setTimeout(() => {
            speakOne(chunk, attempt + 1).then(finish)
          }, 120)
          return
        }
        // User barge-in / new speak session
        if (err === 'interrupted' || err === 'canceled') {
          finish(token === speechToken)
          return
        }
        finish(false)
      }

      try {
        window.speechSynthesis.resume()
      } catch {}
      window.speechSynthesis.speak(utterance)
    })

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (token !== speechToken) return false
      const ok = await speakOne(chunks[i])
      if (!ok) return false
      // Tiny gap + resume helps Chrome not drop the next utterance
      if (i < chunks.length - 1 && token === speechToken) {
        try {
          window.speechSynthesis.resume()
        } catch {}
        await new Promise((r) => setTimeout(r, 40))
      }
    }
    if (token === speechToken) options.onEnd?.()
    return true
  } finally {
    clearInterval(keepAlive)
  }
}

export function stopSpeechPlayback() {
  beginPlaybackSession()
}

/**
 * Low-latency streaming TTS: speaks each completed word via browser
 * SpeechSynthesis as LLM tokens arrive (no wait for full reply).
 */
export function createStreamingSpeaker(options = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return {
      push: async () => {},
      end: async () => {
        options.onEnd?.()
        return false
      },
      cancel: () => {},
      get active() {
        return false
      },
    }
  }

  const token = beginPlaybackSession()
  let preferred = null
  let rawBuf = ''
  let spokenLen = 0
  let ended = false
  let started = false
  let pending = 0
  let idleWaiters = []
  let keepAlive = null
  let actionsHit = false

  const notifyIdle = () => {
    if (pending > 0) return
    const waiters = idleWaiters
    idleWaiters = []
    waiters.forEach((resolve) => resolve())
    if (ended && token === speechToken) options.onEnd?.()
  }

  const waitIdle = () =>
    new Promise((resolve) => {
      if (pending === 0) {
        resolve()
        return
      }
      idleWaiters.push(resolve)
    })

  const ensureVoice = async () => {
    if (preferred || token !== speechToken) return preferred
    const voices = await waitForVoices(80)
    if (token !== speechToken) return null
    preferred = pickVoiceCached(voices, options.voiceMatchers || AMERICAN_VOICE_MATCHERS)
    return preferred
  }

  // Warm voice list immediately so the first word isn't delayed
  const voiceReady = ensureVoice()

  const enqueueUtterance = (phrase) => {
    const text = String(phrase || '').trim()
    if (!text || token !== speechToken) return

    if (!started) {
      started = true
      options.onStart?.()
      keepAlive = setInterval(() => {
        if (token !== speechToken) return
        try {
          window.speechSynthesis.resume()
        } catch {}
      }, 2500)
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.lang ?? preferred?.lang ?? 'en-US'
    utterance.rate = options.rate ?? 1.32
    utterance.pitch = options.pitch ?? 1
    utterance.volume = options.volume ?? 1
    if (preferred) utterance.voice = preferred

    pending += 1
    utterance.onend = () => {
      pending = Math.max(0, pending - 1)
      notifyIdle()
    }
    utterance.onerror = () => {
      pending = Math.max(0, pending - 1)
      notifyIdle()
    }

    try {
      window.speechSynthesis.resume()
    } catch {}
    window.speechSynthesis.speak(utterance)
  }

  const cleanedSpeechText = () => {
    let text = rawBuf
    const act = text.search(/\n?ACTIONS:\s*/i)
    if (act >= 0) {
      text = text.slice(0, act)
      actionsHit = true
    }
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/```[\s\S]*$/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_~]+/g, ' ')
      .replace(/\s+/g, ' ')
  }

  const flushNewWords = (force = false) => {
    if (token !== speechToken) return
    const cleaned = cleanedSpeechText()
    if (!cleaned.trim()) return

    const rest = cleaned.slice(spokenLen).trimStart()
    if (!rest) return

    const takePhrase = () => {
      if (force) return rest
      const punct = rest.match(/^([\s\S]{8,160}?[\.!\?;:])(?:\s|$)/)
      if (punct) return punct[1]
      const words = rest.split(/\s+/).filter(Boolean)
      if (words.length >= 8) return words.slice(0, 10).join(' ')
      return ''
    }

    let phrase = takePhrase()
    while (phrase) {
      enqueueUtterance(phrase)
      spokenLen = cleaned.indexOf(phrase, spokenLen)
      if (spokenLen < 0) spokenLen = cleaned.length
      else spokenLen += phrase.length
      const next = cleaned.slice(spokenLen).trimStart()
      if (!force && next.split(/\s+/).filter(Boolean).length < 8 && !/[.!\?;:]/.test(next)) break
      const punct = next.match(/^([\s\S]{8,160}?[\.!\?;:])(?:\s|$)/)
      phrase = force
        ? next
        : punct
          ? punct[1]
          : next.split(/\s+/).filter(Boolean).length >= 8
            ? next.split(/\s+/).slice(0, 10).join(' ')
            : ''
    }
  }

  return {
    get active() {
      return token === speechToken
    },
    push: async (delta) => {
      if (token !== speechToken || !delta || actionsHit) return
      await voiceReady
      if (token !== speechToken) return
      rawBuf += delta
      flushNewWords(false)
    },
    end: async () => {
      if (token !== speechToken) {
        if (keepAlive) clearInterval(keepAlive)
        return false
      }
      ended = true
      flushNewWords(true)
      await waitIdle()
      if (keepAlive) clearInterval(keepAlive)
      keepAlive = null
      return started && token === speechToken
    },
    cancel: () => {
      if (keepAlive) clearInterval(keepAlive)
      keepAlive = null
      beginPlaybackSession()
    },
  }
}

async function speakWithBackend(text, options = {}, token = speechToken) {
  if (token !== speechToken) return false

  cancelBackendRequest()
  const controller = new AbortController()
  activeBackendController = controller
  const releaseController = () => {
    if (activeBackendController === controller) activeBackendController = null
  }

  try {
    const res = await fetch(
      `${api()}/voice/output`,
      withAuth({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, options.backendMaxChars ?? DEFAULT_SPEECH_MAX_CHARS) }),
        signal: controller.signal,
      }),
    )

    if (token !== speechToken || activeBackendController !== controller) {
      releaseController()
      return false
    }
    if (!res.ok) {
      releaseController()
      return false
    }

    const blob = await res.blob()
    if (token !== speechToken || activeBackendController !== controller) {
      releaseController()
      return false
    }
    if (blob.size === 0) {
      releaseController()
      return false
    }

    const url = URL.createObjectURL(blob)
    if (token !== speechToken || activeBackendController !== controller) {
      releaseController()
      URL.revokeObjectURL(url)
      return false
    }

    const audio = new Audio(url)

    activeAudio = audio
    activeUrl = url

    return await new Promise((resolve) => {
      const finish = (started) => {
        releaseController()
        resolve(started)
      }

      audio.onended = () => {
        clearAudio(audio, url)
        if (token === speechToken) options.onEnd?.()
        finish(true)
      }

      audio.onerror = () => {
        clearAudio(audio, url)
        finish(false)
      }

      if (token !== speechToken || activeBackendController !== controller) {
        clearAudio(audio, url)
        finish(false)
        return
      }

      audio.play().catch(() => {
        clearAudio(audio, url)
        finish(false)
      })
    })
  } catch (error) {
    releaseController()
    if (error?.name !== 'AbortError' && token === speechToken) clearAudio()
    return false
  }
}

export async function speakText(text, options = {}) {
  const content = text?.trim()
  if (!content) {
    options.onEnd?.()
    return false
  }

  const token = beginPlaybackSession()
  const browserOnly = options.browserOnly === true || options.preferBackend === false

  const tryBrowserFirst = options.preferBrowser !== false
  if (tryBrowserFirst) {
    const browserStarted = await speakInBrowser(content, options, token)
    if (browserStarted) return true
  }

  if (token !== speechToken) return false

  if (!browserOnly && options.preferBackend !== false) {
    const backendStarted = await speakWithBackend(content, options, token)
    if (backendStarted) return true
  }

  if (token !== speechToken) return false

  if (!tryBrowserFirst) {
    return speakInBrowser(content, options, token)
  }

  options.onEnd?.()
  return false
}
