/**
 * Client-side voice command router.
 * Maps spoken phrases → shell/panel/store actions before falling through to chat.
 */

import { resolveApiBase } from './api'

const api = () => resolveApiBase()

function normalize(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripFillers(text = '') {
  return text
    .replace(/^(hey |ok |okay |please |jarvis[, ]*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @typedef {{
 *   type: string,
 *   ack?: string,
 *   panel?: string,
 *   shell?: string,
 *   project?: string,
 *   topic?: string,
 *   note?: string,
 *   demoQuery?: string,
 *   chat?: string,
 *   spin?: boolean,
 *   value?: boolean,
 * }} VoiceCommand
 */

/**
 * Parse a spoken utterance into a UI command, or null for free-form chat.
 * @returns {VoiceCommand | null}
 */
export function parseVoiceCommand(raw = '') {
  const text = stripFillers(normalize(raw))
  if (!text || text.length < 2) return null

  // --- Shell / navigation ---
  if (/\b(is|are)\b.*\b(my |the )?(site|deployment|github pages?)\b.*\b(down|online|up|working)\b/.test(text)) {
    return { type: 'infra_status', ack: null }
  }
  if (
    /\b(open |go to |show |switch to )?(the )?(infrastructure|infra|deployments?|containers?|docker)( command center| panel| status)?\b/.test(text)
  ) {
    return { type: 'navigate', shell: 'lab', panel: 'infra', ack: 'Opening infrastructure command center.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?(dashboard|dash|home|memory map)\b/.test(text)) {
    return { type: 'navigate', shell: 'dashboard', ack: 'Opening dashboard.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?work( mode| space)?\b/.test(text) && !/\b(work on|workout)\b/.test(text)) {
    return { type: 'navigate', shell: 'work', panel: 'chat', ack: 'Opening work.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?intel\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'intel', ack: 'Opening intel theater.' }
  }
  if (/\b(go )?home\b/.test(text) || /\bclose (the )?(map|overlay|stage)\b/.test(text)) {
    return { type: 'ui_home', ack: 'Home.' }
  }
  if (/\bzoom in\b/.test(text) || /\bcloser\b/.test(text) && /\bmap\b/.test(text)) {
    return { type: 'ui_map_scale', dir: 1, ack: 'Zooming in.' }
  }
  if (/\bzoom out\b/.test(text) || /\b(pull back|wider)\b/.test(text) && /\bmap\b/.test(text)) {
    return { type: 'ui_map_scale', dir: -1, ack: 'Zooming out.' }
  }
  if (/\b(show |open )?(the )?(weather|bangalore weather|blr weather)\b/.test(text)) {
    return { type: 'ui_weather', ack: 'Bangalore weather.' }
  }
  if (/\b(show |open )?(live )?news\b/.test(text) || /\bheadlines\b/.test(text)) {
    return { type: 'ui_map', region: 'world', ack: 'Opening the map. Click a lock for the brief.' }
  }
  if (/\b(indian map|india map|map of india|zoom (in )?india|open india)\b/.test(text)) {
    return { type: 'ui_map', region: 'india', ack: 'Focusing India.' }
  }
  if (/\b(world map|show the globe|open (the )?map)\b/.test(text)) {
    return { type: 'ui_map', region: 'world', ack: 'World grid.' }
  }
  if (/\b(hex|naza|f550|hexcopter|hexacopter)\b/.test(text) && /\b(show|open|hologram|model)\b/.test(text)) {
    return { type: 'ui_hw', id: 'hex', ack: 'Hexcopter hologram. NAZA-M Lite.' }
  }
  if (/\b(quad|kk2|quadcopter)\b/.test(text) && /\b(show|open|hologram|model)\b/.test(text)) {
    return { type: 'ui_hw', id: 'quad', ack: 'Quad hologram. KK2.1.5.' }
  }
  if (/\b(explode|disassemble|pull apart|take apart)\b/.test(text)) {
    return { type: 'ui_craft', action: 'explode', ack: 'Exploding the airframe.' }
  }
  if (/\b(assemble|put it back|rebuild|reassemble)\b/.test(text)) {
    return { type: 'ui_craft', action: 'assemble', ack: 'Assembling.' }
  }
  if (/\b(add|install|fit|put on|seat)\b/.test(text) && /\b(cam|camera|vtx|led|buzzer|antenna|sonar|prop|motor|gps|battery)\b/.test(text)) {
    const id = /\bcam|camera/.test(text)
      ? 'cam'
      : /\bvtx/.test(text)
        ? 'vtx'
        : /\bled/.test(text)
          ? 'led'
          : /\bbuzzer/.test(text)
            ? 'buzzer'
            : /\bantenna/.test(text)
              ? 'antenna'
              : /\bsonar/.test(text)
                ? 'sonar'
                : /\bprop/.test(text)
                  ? 'props'
                  : /\bmotor/.test(text)
                    ? 'motors'
                    : /\bgps/.test(text)
                      ? 'gps'
                      : 'battery'
    return { type: 'ui_craft', action: 'install', id, ack: `Installing ${id}.` }
  }
  if (/\b(remove|strip|pull off|take off)\b/.test(text) && /\b(batter|prop|motor|naza|kk2|gps|arm|flight|cam|vtx|led)\b/.test(text)) {
    const id = /\bbatter/.test(text)
      ? 'battery'
      : /\bprop/.test(text)
        ? 'props'
        : /\bmotor/.test(text)
          ? 'motors'
          : /\bnaza|kk2|flight/.test(text)
            ? 'fc'
            : /\bgps/.test(text)
              ? 'gps'
              : 'arms'
    return { type: 'ui_craft', action: 'strip', id, ack: `Removing ${id}.` }
  }
  if (/\b(open|show|blueprint|project)\b/.test(text) && /\banima\b/.test(text)) {
    return { type: 'ui_project', name: 'Anima', ack: 'Project Anima.' }
  }
  if (/\b(clear|dismiss|close panels?)\b/.test(text) && !/\bcalendar\b/.test(text)) {
    return { type: 'hud_clear', ack: 'Clearing the HUD.' }
  }
  if (/\b(scan|sweep|lock)\b/.test(text) && /\b(for|on)?\s*([a-z0-9_.-]{2,})\b/.test(text)) {
    const m = text.match(/\b(?:scan|sweep|lock)(?:\s+(?:for|on))?\s+([a-z0-9_.-]+)/i)
    const topic = (m && m[1]) || ''
    if (topic && !['the', 'my', 'a'].includes(topic)) {
      return { type: 'intel_scan', topic, ack: `Scanning for ${topic}.` }
    }
  }

  if (/\b(open |go to |show |switch to )?(the )?lab\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'intel', ack: 'Opening lab intel.' }
  }

  // Work panels
  if (/\b(open |go to |show |switch to )?(the )?(work )?chat\b/.test(text) || /\b(open )?messages\b/.test(text)) {
    return { type: 'navigate', shell: 'work', panel: 'chat', ack: 'Opening chat.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?brief\b/.test(text) && !/\bread\b/.test(text)) {
    return { type: 'navigate', shell: 'work', panel: 'brief', ack: 'Opening brief.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?vault\b/.test(text)) {
    return { type: 'navigate', shell: 'work', panel: 'vault', ack: 'Opening vault.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?(calendar|schedule|cal)\b/.test(text)) {
    return { type: 'navigate', shell: 'work', panel: 'calendar', ack: 'Opening calendar.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?voice( panel| mode)?\b/.test(text) || /\bpush to talk\b/.test(text) || /\bptt\b/.test(text)) {
    return { type: 'navigate', shell: 'work', panel: 'voice', ack: 'Opening voice.' }
  }

  // Lab panels
  if (/\b(open |go to |show |switch to )?(the )?demos?\b/.test(text) && !/\bbuild\b/.test(text) && !/\bdemo (called|named|for)\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'demos', ack: 'Opening demos.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?studio\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'studio', ack: 'Opening studio.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?(ingest|github ingest|local ingest)\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'ingest', ack: 'Opening ingest.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?(graph|brain graph|memory map|memory)\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'graph', ack: 'Opening graph.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?vision( panel)?\b/.test(text) && !/\bcapture|camera|seeing|looking\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'vision', ack: 'Opening vision.' }
  }
  if (/\b(open |go to |show |switch to )?(the )?wake( lab| panel)?\b/.test(text)) {
    return { type: 'navigate', shell: 'lab', panel: 'wake', ack: 'Opening wake lab.' }
  }

  // Wake / always listen
  if (/\b(enable|turn on|start|activate)\b.*\bwake\b/.test(text) || /\bwake (on|up|mode)\b/.test(text)) {
    return { type: 'wake', value: true, ack: 'Wake enabled. Say Jarvis when you need me.' }
  }
  if (/\b(disable|turn off|stop|deactivate)\b.*\bwake\b/.test(text) || /\bwake off\b/.test(text)) {
    return { type: 'wake', value: false, ack: 'Wake disabled.' }
  }
  if (/\b(keep listening|stay listening|always listen(?:ing)?|continuous listen(?:ing)?)\b/.test(text)) {
    return { type: 'keep_listening', value: true, ack: 'Always listening.' }
  }
  if (/\b(stop listening|go to sleep|goodbye jarvis|cancel listening|stop always listen(?:ing)?)\b/.test(text)) {
    return { type: 'keep_listening', value: false, ack: 'Okay. Say Jarvis when you need me.' }
  }

  // Gestures
  if (/\b(enable|turn on|start|activate)\b.*\bgestures?\b/.test(text) || /\bgestures? on\b/.test(text)) {
    return { type: 'gestures', value: true, ack: 'Enabling gestures. Allow camera if prompted.' }
  }
  if (/\b(disable|turn off|stop)\b.*\bgestures?\b/.test(text) || /\bgestures? off\b/.test(text)) {
    return { type: 'gestures', value: false, ack: 'Gestures off.' }
  }
  if (/\btoggle gestures?\b/.test(text)) {
    return { type: 'gestures', value: 'toggle', ack: 'Toggling gestures.' }
  }
  if (/\b(show|hide) (hand )?cam(era)?\b/.test(text) || /\b(show|hide) hand preview\b/.test(text)) {
    const show = /\bshow\b/.test(text)
    return { type: 'hand_cam', value: show, ack: show ? 'Showing hand camera.' : 'Hiding hand camera.' }
  }

  // Brief
  if (/\b(read|speak|say|narrate) (my |the )?brief\b/.test(text) || /\bread (it )?aloud\b/.test(text)) {
    return { type: 'read_brief', ack: 'Reading your brief.' }
  }

  // Graph spin
  if (/\b(start |enable |turn on )?spin(ning)?( the )?(graph|brain)?\b/.test(text) || /\bspin on\b/.test(text)) {
    return { type: 'spin', value: true, ack: 'Graph spin on.' }
  }
  if (/\b(stop |disable |turn off )?spin(ning)?( the )?(graph|brain)?\b/.test(text) || /\bspin off\b/.test(text)) {
    if (/\bspin\b/.test(text)) return { type: 'spin', value: false, ack: 'Graph spin off.' }
  }

  // Focus / project
  let m =
    text.match(/\b(?:set )?(?:focus|project|active project)(?:\s+to|\s+on)?\s+(.+)$/) ||
    text.match(/\bfocus on\s+(.+)$/) ||
    text.match(/\bwork on\s+(.+)$/)
  if (m) {
    const project = m[1].replace(/\b(please|now|for me)\b/g, '').trim()
    if (project && project.length > 1) {
      return { type: 'focus', project, ack: `Focus set to ${project}.` }
    }
  }

  // Vault capture
  m =
    text.match(/\b(?:save|capture|remember|note)(?:\s+(?:this|that|to vault|a note))?(?:\s*[:=-]|\s+)\s*(.+)$/) ||
    text.match(/\bvault\s+(.+)$/)
  if (m && !/\bopen (the )?vault\b/.test(text)) {
    const note = m[1].trim()
    if (note && note.length > 2) {
      return { type: 'capture', note, ack: 'Saved to vault.' }
    }
  }

  // Open specific demo
  m =
    text.match(/\b(?:open|show|launch|preview)\s+(?:the\s+)?demo(?:\s+(?:called|named|for))?\s+(.+)$/) ||
    text.match(/\bdemo\s+(?:called|named)\s+(.+)$/)
  if (m) {
    const demoQuery = m[1].replace(/\b(please|now)\b/g, '').trim()
    if (demoQuery) return { type: 'open_demo', demoQuery, ack: `Opening demo ${demoQuery}.` }
  }

  // Research (route to chat with clear prompt + open dash-friendly ack)
  m =
    text.match(/\b(?:research|investigate|deep dive(?:\s+on)?|generate(?:\s+a)?\s+report(?:\s+on)?|write(?:\s+a)?\s+report(?:\s+on)?)\s+(.+)$/) ||
    text.match(/\b(?:look up|search(?:\s+the)?(?:\s+web)?(?:\s+for)?|what(?:'s| is) the latest on)\s+(.+)$/)
  if (m) {
    const topic = m[1].replace(/\b(please|now|for me)\b/g, '').trim()
    if (topic && topic.length > 2) {
      return {
        type: 'research',
        topic,
        chat: `Research ${topic} and generate a report`,
        ack: `Researching ${topic}.`,
      }
    }
  }

  // Build demo / website — leave to chat but jump to demos panel
  if (/\b(build|make|create)\b.*\b(website|site|landing|demo)\b/.test(text)) {
    return {
      type: 'build_demo',
      chat: text,
      ack: 'Building a demo. Opening the demos lab.',
    }
  }

  // Vision capture phrasing (also handled in WakePanel — duplicate safe)
  if (
    /\b(capture what i(?:'?m| am) seeing|what(?:'?s| is) (?:on|in) (?:my |the )?(?:camera|screen|view)|take a (?:photo|picture|snapshot)|vision capture|analyze (?:this|the|my) (?:view|frame|camera|scene))\b/.test(
      text,
    )
  ) {
    const prompt = text
      .replace(
        /\b(capture what i(?:'?m| am) seeing(?: now)?|what(?:'?s| is) (?:on|in) (?:my |the )?(?:camera|screen|desk|view)|take a (?:photo|picture|snapshot|capture)|analyze (?:this|the|my) (?:view|frame|camera|scene)|vision capture|open (?:the )?camera|use (?:the )?camera)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim()
    return {
      type: 'vision_capture',
      topic: prompt || 'Describe clearly what is visible in this camera frame. Be concrete and brief.',
      ack: 'Opening the camera.',
    }
  }

  // System status
  if (/\b(system status|health check|are you online|status report)\b/.test(text)) {
    return { type: 'status', ack: null }
  }

  // Help
  if (/\b(help|what can (?:i|you) say|list (?:voice )?commands|voice commands)\b/.test(text)) {
    return { type: 'help', ack: null }
  }

  return null
}

async function fetchDemos() {
  try {
    const res = await fetch(`${api()}/demos`, { cache: 'no-store' })
    const data = await res.json()
    return data.demos || []
  } catch {
    return []
  }
}

async function fetchBriefVoice() {
  try {
    const res = await fetch(`${api()}/brief/voice`, { cache: 'no-store' })
    if (!res.ok) throw new Error('brief voice failed')
    const data = await res.json()
    return data.text || data.voice_summary || data.summary || ''
  } catch {
    return ''
  }
}

function goShell(store, shell, panel) {
  if (shell === 'dashboard') {
    store.applyUiCommand({ type: 'ui_go_home' })
    return
  }
  if (shell === 'work') {
    store.setShellMode('work')
    store.setLayoutMode('work')
    store.setActivePanel(panel || 'chat')
    store.setStatusMsg(`WORK · ${String(panel || 'chat').toUpperCase()}`)
    return
  }
  if (shell === 'lab') {
    store.setShellMode('lab')
    store.setLayoutMode(panel === 'graph' ? 'graph' : 'lab')
    store.setActivePanel(panel || 'demos')
    store.setStatusMsg(`LAB · ${String(panel || 'demos').toUpperCase()}`)
  }
}

/**
 * Apply a parsed command against the Zustand store.
 * @returns {Promise<{ handled: boolean, speak?: string, chat?: string, streamChat?: boolean }>}
 */
export async function applyVoiceCommand(cmd, getStore) {
  if (!cmd) return { handled: false }
  const store = getStore()

  switch (cmd.type) {
    case 'navigate': {
      goShell(store, cmd.shell, cmd.panel)
      return { handled: true, speak: cmd.ack }
    }
    case 'ui_map': {
      store.applyUiCommand({ type: 'ui_zoom_map', params: { region: cmd.region } })
      return { handled: true, speak: cmd.ack }
    }
    case 'ui_map_scale': {
      store.applyUiCommand({ type: 'ui_map_scale', params: { dir: cmd.dir } })
      return { handled: true, speak: cmd.ack }
    }
    case 'ui_weather': {
      store.applyUiCommand({ type: 'ui_show_weather' })
      return { handled: true, speak: cmd.ack }
    }
    case 'ui_home': {
      store.applyUiCommand({ type: 'ui_go_home' })
      return { handled: true, speak: cmd.ack }
    }
    case 'ui_craft': {
      if (!store.stageHardware) {
        store.applyUiCommand({ type: 'ui_show_hardware', params: { id: 'quad' } })
      }
      store.applyUiCommand({ type: 'ui_craft', params: { action: cmd.action, id: cmd.id } })
      return { handled: true, speak: cmd.ack }
    }
    case 'ui_hw': {
      store.applyUiCommand({ type: 'ui_show_hardware', params: { id: cmd.id } })
      return { handled: true, speak: cmd.ack }
    }
    case 'ui_project': {
      store.applyUiCommand({ type: 'ui_open_project', params: { name: cmd.name } })
      return { handled: true, speak: cmd.ack }
    }
    case 'hud_clear': {
      store.clearHud()
      return { handled: true, speak: cmd.ack }
    }
    case 'intel_scan': {
      await store.runLibraryScan(cmd.topic)
      const n = (getStore().scanSweep?.hits || []).length
      return { handled: true, speak: n ? `Locked ${n} repositories for ${cmd.topic}.` : `No lock for ${cmd.topic}.` }
    }
    case 'infra_status': {
      await store.fetchInfraStatus({ silent: true })
      const infra = getStore().infraStatus || {}
      const sites = infra.sites || {}
      const docker = infra.docker || {}
      goShell(store, 'lab', 'infra')
      const siteLine = sites.total
        ? `${sites.up || 0} of ${sites.total} sites are online${sites.down ? `, with ${sites.down} active incident${sites.down === 1 ? '' : 's'}` : ''}`
        : 'No GitHub Pages deployments have been discovered yet'
      const dockerLine = docker.total
        ? `${docker.running || 0} of ${docker.total} containers are running`
        : 'Docker telemetry is unavailable'
      return { handled: true, speak: `${siteLine}. ${dockerLine}.` }
    }
    case 'wake': {
      store.setWakeEnabled(Boolean(cmd.value))
      if (!cmd.value) store.setKeepListening(false)
      return { handled: true, speak: cmd.ack }
    }
    case 'keep_listening': {
      if (cmd.value) {
        store.setWakeEnabled(true)
        store.setKeepListening(true)
      } else {
        store.setKeepListening(false)
      }
      return { handled: true, speak: cmd.ack }
    }
    case 'gestures': {
      if (cmd.value === 'toggle') await store.toggleGestures()
      else if (cmd.value) await store.enableGestures()
      else store.disableGestures()
      return { handled: true, speak: cmd.ack }
    }
    case 'hand_cam': {
      store.setGesturePreviewVisible(Boolean(cmd.value))
      if (cmd.value && !store.gestureControlEnabled) await store.enableGestures()
      return { handled: true, speak: cmd.ack }
    }
    case 'spin': {
      store.setGraphSpinEnabled(Boolean(cmd.value))
      return { handled: true, speak: cmd.ack }
    }
    case 'focus': {
      await store.setActiveProject(cmd.project, [
        `Advance ${cmd.project}`,
        'Clear the top blocker',
        'Ship one measurable win',
      ])
      return { handled: true, speak: cmd.ack }
    }
    case 'capture': {
      await store.saveToVault(cmd.note, 'Voice capture')
      return { handled: true, speak: cmd.ack }
    }
    case 'open_demo': {
      const demos = await fetchDemos()
      const q = normalize(cmd.demoQuery)
      const hit =
        demos.find((d) => normalize(d.title || '').includes(q) || normalize(d.slug || '').includes(q) || normalize(d.id || '').includes(q)) ||
        demos.find((d) => q.includes(normalize(d.title || '')) || q.includes(normalize(d.slug || '')))
      if (hit) {
        store.openDemo(hit.id)
        return { handled: true, speak: `Opening ${hit.title || hit.slug || 'demo'}.` }
      }
      goShell(store, 'lab', 'demos')
      return { handled: true, speak: demos.length ? `I could not find demo ${cmd.demoQuery}. Opening demos.` : 'No demos yet. Say build me a website to create one.' }
    }
    case 'research': {
      goShell(store, 'dashboard')
      return { handled: true, speak: cmd.ack, chat: cmd.chat, streamChat: true }
    }
    case 'build_demo': {
      goShell(store, 'lab', 'demos')
      return { handled: true, speak: cmd.ack, chat: cmd.chat, streamChat: true }
    }
    case 'vision_capture': {
      store.setStatusMsg('VISION — OPENING CAMERA…')
      const result = await store.runVoiceVisionCapture(cmd.topic)
      if (result?.ok && result.analysis) {
        return { handled: true, speak: result.analysis }
      }
      return {
        handled: true,
        speak:
          result?.error ||
          'I could not capture the camera frame. Grant camera access and try again.',
      }
    }
    case 'read_brief': {
      goShell(store, 'work', 'brief')
      await store.fetchBrief()
      const voice = await fetchBriefVoice()
      const brief = store.brief
      const priorities = (brief?.priority_actions || []).slice(0, 3)
      const fallback =
        priorities.length > 0
          ? `Your top priorities: ${priorities
              .map((p, i) => `${i + 1}. ${typeof p === 'string' ? p : p?.text || p?.title || ''}`)
              .join(' ')}`
          : 'No priorities on the brief yet.'
      return { handled: true, speak: voice || brief?.voice_summary || fallback }
    }
    case 'status': {
      await store.checkBackendHealth({ silent: true })
      const h = getStore().healthState || {}
      const llm = h.llm || {}
      const speak = [
        h.groq ? 'Groq online' : 'Groq offline',
        h.qdrant ? 'Qdrant online' : 'Qdrant offline',
        h.vault_configured ? 'Vault ready' : 'Vault offline',
        `Primary ${String(llm.primary || 'unknown')}`,
        llm.groq_model ? `Chat model ${llm.groq_model}` : null,
      ]
        .filter(Boolean)
        .join('. ')
      return { handled: true, speak: speak + '.' }
    }
    case 'help': {
      return { handled: true, speak: VOICE_COMMAND_HELP }
    }
    default:
      return { handled: false }
  }
}

/**
 * Convenience: parse + apply. Returns null-result if not a command (caller should chat).
 */
export async function routeVoiceCommand(raw, getStore) {
  const cmd = parseVoiceCommand(raw)
  if (!cmd) return { handled: false, command: null }
  const result = await applyVoiceCommand(cmd, getStore)
  return { ...result, command: cmd }
}

/** Short help spoken on demand */
export const VOICE_COMMAND_HELP =
  'You can say: open intel, scan for fastapi, open dashboard, open chat, research a topic, or just ask a question.'
