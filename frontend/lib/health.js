export function llmOnline(health = {}) {
  const llm = health.llm || {}
  return Boolean(health.ollama || health.groq || llm.groq_configured)
}
