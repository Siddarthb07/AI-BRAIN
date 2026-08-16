export const HASH_ROUTES = {
  home: { shellMode: 'dashboard', layoutMode: 'dashboard', activePanel: 'dashboard' },
  dash: { shellMode: 'dashboard', layoutMode: 'dashboard', activePanel: 'dashboard' },
  dashboard: { shellMode: 'dashboard', layoutMode: 'dashboard', activePanel: 'dashboard' },
  graph: { shellMode: 'lab', layoutMode: 'graph', activePanel: 'graph' },
  neural: { shellMode: 'lab', layoutMode: 'graph', activePanel: 'graph' },
  intel: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'intel' },
  analytics: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'intel' },
  vision: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'vision' },
  infra: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'infra' },
  monitor: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'infra' },
  demos: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'demos' },
  ingest: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'ingest' },
  studio: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'studio' },
  wake: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'wake' },
  work: { shellMode: 'work', layoutMode: 'work', activePanel: 'chat' },
  chat: { shellMode: 'work', layoutMode: 'work', activePanel: 'chat' },
  brief: { shellMode: 'work', layoutMode: 'work', activePanel: 'brief' },
  vault: { shellMode: 'work', layoutMode: 'work', activePanel: 'vault' },
  security: { shellMode: 'work', layoutMode: 'work', activePanel: 'vault' },
  calendar: { shellMode: 'work', layoutMode: 'work', activePanel: 'calendar' },
  cal: { shellMode: 'work', layoutMode: 'work', activePanel: 'calendar' },
  voice: { shellMode: 'work', layoutMode: 'work', activePanel: 'voice' },
  lab: { shellMode: 'lab', layoutMode: 'lab', activePanel: 'intel' },
}

export function nodeSlug(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function parseHash(hash = '') {
  const raw = String(hash || '')
    .replace(/^#/, '')
    .trim()
  if (!raw) return { kind: 'panel', ...HASH_ROUTES.home }
  const key = raw.split(/[/?&]/)[0].toLowerCase()
  if (key === 'map' || raw === 'n/map') {
    return { kind: 'map', shellMode: 'dashboard', layoutMode: 'dashboard', activePanel: 'dashboard' }
  }
  if (HASH_ROUTES[key]) return { kind: 'panel', ...HASH_ROUTES[key] }
  const node = key === 'n' ? raw.split(/[/?]/).slice(1).join('/') : raw
  const slug = nodeSlug(node)
  if (!slug) return { kind: 'panel', ...HASH_ROUTES.home }
  return {
    kind: 'node',
    slug,
    shellMode: 'dashboard',
    layoutMode: 'dashboard',
    activePanel: 'dashboard',
  }
}

export function hashForSnapshot(state = {}) {
  if (state.mapOpen) return '#map'
  if (state.stageHardware) return `#n/${state.stageHardware}`
  const proj = state.stageProject?.name || (state.selectedNode?.type === 'repo' ? state.selectedNode.data?.name || state.selectedNode.label : '')
  if (state.selectedNode?.type === 'weather') return '#n/weather'
  if (state.selectedNode?.type === 'map') return '#map'
  if (state.selectedNode?.type === 'hardware') {
    return `#n/${state.selectedNode.data?.id || 'quad'}`
  }
  if (proj) return `#n/${nodeSlug(proj)}`
  if (state.selectedNode?.type === 'site' || state.selectedNode?.type === 'container') {
    return `#n/${nodeSlug(state.selectedNode.label || state.selectedNode.id)}`
  }
  if (state.shellMode === 'dashboard') return '#home'
  if (state.shellMode === 'work') return `#${state.activePanel || 'chat'}`
  if (state.activePanel === 'graph') return '#graph'
  return `#${state.activePanel || 'intel'}`
}
