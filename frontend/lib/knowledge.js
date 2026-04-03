const STOPWORDS = new Set([
  'a', 'an', 'and', 'app', 'based', 'build', 'built', 'by', 'can', 'daily',
  'for', 'from', 'give', 'into', 'its', 'like', 'made', 'my', 'of', 'on',
  'or', 'personal', 'project', 'simple', 'small', 'software', 'system',
  'than', 'that', 'the', 'their', 'this', 'to', 'track', 'using', 'with',
  'your',
])

const TOPIC_RULES = [
  { label: 'AI', terms: ['ai', 'assistant', 'chatbot', 'jarvis', 'llm', 'model', 'prediction', 'rag'] },
  { label: 'Health', terms: ['health', 'medical', 'diabetes', 'cancer', 'cvd', 'lifestyle', 'risk'] },
  { label: 'Finance', terms: ['finance', 'quant', 'trading', 'market'] },
  { label: 'Simulation', terms: ['simulation', 'physics', 'propeller', 'drone', 'vortex'] },
  { label: 'Automation', terms: ['automation', 'workflow', 'n8n', 'whatsapp', 'sheet', 'lead'] },
  { label: 'Web', terms: ['web', 'website', 'html', 'css', 'frontend', 'portfolio'] },
  { label: 'Vision', terms: ['webcam', 'gesture', 'vision', 'cv2', 'opencv'] },
  { label: 'Tracking', terms: ['tracking', 'tracker', 'analytics'] },
  { label: 'Legal', terms: ['legal', 'law', 'citation'] },
]

const PATTERN_RULES = [
  { label: 'LLM Integration', terms: ['ai', 'assistant', 'chatbot', 'llm', 'rag', 'prediction'] },
  { label: 'Automation', terms: ['automation', 'workflow', 'n8n', 'whatsapp', 'sheet'] },
  { label: 'Simulation', terms: ['simulation', 'physics', 'propeller', 'drone', 'vortex'] },
  { label: 'Computer Vision', terms: ['webcam', 'gesture', 'vision', 'cv2', 'opencv'] },
  { label: 'Web UI', terms: ['web', 'website', 'html', 'css', 'frontend'] },
  { label: 'Analytics', terms: ['quant', 'tracking', 'tracker', 'risk', 'score'] },
]

function normalizeWord(word = '') {
  return word.toLowerCase().replace(/[^a-z0-9+]/g, '')
}

function toTitleCase(value = '') {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function unique(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function extractKeywords(text = '', limit = 8) {
  const counts = new Map()
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .map(normalizeWord)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token))

  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => toTitleCase(token))
}

function collectRuleLabels(text = '', rules = []) {
  const lower = text.toLowerCase()
  return rules
    .filter((rule) => rule.terms.some((term) => lower.includes(term)))
    .map((rule) => rule.label)
}

export function enrichRepo(repo = {}) {
  const language = repo.language && repo.language !== 'Unknown' ? repo.language : ''
  const sourceText = [
    repo.name || '',
    repo.description || '',
    language,
    ...(repo.topics || []),
    ...(repo.patterns || []),
  ].join(' ')

  const derivedKeywords = extractKeywords(sourceText, 8)
  const derivedTopics = unique([
    ...(repo.topics || []),
    ...collectRuleLabels(sourceText, TOPIC_RULES),
    ...derivedKeywords.slice(0, 3),
  ]).slice(0, 4)

  const languagePatterns = []
  if (language) {
    if (/python/i.test(language)) languagePatterns.push('Python')
    if (/html|css|javascript|typescript/i.test(language)) languagePatterns.push('Web UI')
  }

  const derivedPatterns = unique([
    ...(repo.patterns || []),
    ...languagePatterns,
    ...collectRuleLabels(sourceText, PATTERN_RULES),
  ]).slice(0, 4)

  return {
    ...repo,
    derivedKeywords,
    derivedTopics,
    derivedPatterns,
  }
}

function buildSignalSet(repo = {}) {
  const enriched = enrichRepo(repo)
  return new Set(
    unique([
      ...(enriched.derivedTopics || []),
      ...(enriched.derivedPatterns || []),
      enriched.language || '',
      ...(enriched.derivedKeywords || []).slice(0, 5),
    ]).map((item) => item.toLowerCase())
  )
}

function overlapScore(leftItems = [], rightItems = []) {
  const right = new Set(rightItems.map((item) => item.toLowerCase()))
  return leftItems.reduce((score, item) => score + (right.has(item.toLowerCase()) ? 1 : 0), 0)
}

export function scoreRepoSimilarity(baseRepo, candidateRepo) {
  const base = enrichRepo(baseRepo)
  const candidate = enrichRepo(candidateRepo)

  const baseSignals = [...buildSignalSet(base)]
  const candidateSignals = [...buildSignalSet(candidate)]
  const sharedSignals = overlapScore(baseSignals, candidateSignals)
  const sharedKeywords = overlapScore(base.derivedKeywords || [], candidate.derivedKeywords || [])
  const sameLanguage =
    base.language &&
    candidate.language &&
    base.language !== 'Unknown' &&
    base.language === candidate.language
      ? 2
      : 0

  return sharedSignals * 3 + sharedKeywords * 2 + sameLanguage
}

export function rankRelatedRepos(baseRepo, repos = [], limit = 4) {
  return repos
    .filter((repo) => repo?.name && repo.name !== baseRepo?.name)
    .map((repo) => ({ repo: enrichRepo(repo), score: scoreRepoSimilarity(baseRepo, repo) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.repo.name.localeCompare(b.repo.name))
    .slice(0, limit)
}

function storySignals(story = {}) {
  const text = `${story.title || ''} ${story.url || ''} ${story.by || ''}`
  return unique([
    ...collectRuleLabels(text, TOPIC_RULES),
    ...extractKeywords(text, 6),
  ]).map((item) => item.toLowerCase())
}

export function scoreNewsForRepo(repo, story) {
  const repoSignals = [...buildSignalSet(repo)]
  const newsSignals = storySignals(story)
  return overlapScore(repoSignals, newsSignals) * 3
}

export function rankRelevantNews(repo, stories = [], limit = 3) {
  const ranked = stories
    .map((story, index) => ({ story, score: scoreNewsForRepo(repo, story), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const nonZero = ranked.filter((item) => item.score > 0)
  if (nonZero.length > 0) return nonZero.slice(0, limit)
  return ranked.slice(0, limit)
}
