const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

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

async function waitForVoices(timeoutMs = 2000) {
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
    setTimeout(finish, timeoutMs)
  })
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
  const preferred = pickVoice(voices, options.voiceMatchers || AMERICAN_VOICE_MATCHERS)
  const chunks = splitIntoChunks(text, options.browserChunkSize ?? 220)
  if (chunks.length === 0) return false

  return new Promise((resolve) => {
    let finished = false

    const complete = (started) => {
      if (finished) return
      finished = true
      if (started) options.onEnd?.()
      resolve(started)
    }

    const speakChunk = (index) => {
      if (token !== speechToken) {
        complete(false)
        return
      }

      if (index >= chunks.length) {
        complete(true)
        return
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index])
      utterance.lang = options.lang ?? preferred?.lang ?? 'en-US'
      utterance.rate = options.rate ?? 0.98
      utterance.pitch = options.pitch ?? 1
      utterance.volume = options.volume ?? 1
      if (preferred) utterance.voice = preferred

      utterance.onend = () => speakChunk(index + 1)
      utterance.onerror = () => complete(false)

      window.speechSynthesis.speak(utterance)
    }

    speakChunk(0)
  })
}

export function stopSpeechPlayback() {
  beginPlaybackSession()
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
    const res = await fetch(`${API}/voice/output`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, options.backendMaxChars ?? 500) }),
      signal: controller.signal,
    })

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

  const tryBrowserFirst = options.preferBrowser !== false
  if (tryBrowserFirst) {
    const browserStarted = await speakInBrowser(content, options, token)
    if (browserStarted) return true
  }

  if (token !== speechToken) return false

  if (options.preferBackend !== false) {
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
