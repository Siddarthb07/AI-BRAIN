'use client'
import { useMemo } from 'react'
import { useJarvisStore } from '../app/store'
import { enrichRepo, rankRelatedRepos, rankRelevantNews, scoreNewsForRepo } from '../lib/knowledge'

const TYPE_COLORS = {
  repo: 'var(--green)',
  topic: 'var(--gold)',
  lang: '#a78bfa',
  news: '#ff6b9d',
  core: 'var(--cyan)',
  local_text: '#38bdf8',
  local_pdf: '#ff8a3d',
}

const TYPE_LABELS = {
  local_text: 'LOCAL TEXT NODE',
  local_pdf: 'LOCAL PDF NODE',
}

function Section({ title, children }) {
  if (!children) return null
  return (
    <div style={{ marginTop: '16px' }}>
      <div className="section-header">{title}</div>
      {children}
    </div>
  )
}

function JumpButton({ label, onClick, color = 'var(--cyan)' }) {
  return (
    <button
      className="btn"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        marginBottom: '8px',
        borderColor: `${color}55`,
        color,
        background: `${color}12`,
      }}
    >
      {label}
    </button>
  )
}

export default function NodePanel() {
  const selectedNode = useJarvisStore((state) => state.selectedNode)
  const setSelectedNode = useJarvisStore((state) => state.setSelectedNode)
  const sendChat = useJarvisStore((state) => state.sendChat)
  const setActivePanel = useJarvisStore((state) => state.setActivePanel)
  const repos = useJarvisStore((state) => state.repos)
  const hnStories = useJarvisStore((state) => state.hnStories)

  const enrichedRepos = useMemo(() => repos.map(enrichRepo), [repos])
  const enrichedSelectedRepo = useMemo(
    () => (selectedNode?.type === 'repo' ? enrichRepo(selectedNode.data || {}) : null),
    [selectedNode]
  )

  const relatedRepos = useMemo(() => {
    if (selectedNode?.type === 'repo' && enrichedSelectedRepo) {
      return rankRelatedRepos(enrichedSelectedRepo, enrichedRepos, 4)
    }

    if (selectedNode?.type === 'news' && selectedNode.data) {
      return enrichedRepos
        .map((repo) => ({ repo, score: scoreNewsForRepo(repo, selectedNode.data) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.repo.name.localeCompare(right.repo.name))
        .slice(0, 4)
    }

    return []
  }, [enrichedRepos, enrichedSelectedRepo, selectedNode])

  const relatedNews = useMemo(() => {
    if (selectedNode?.type === 'repo' && enrichedSelectedRepo) {
      return rankRelevantNews(enrichedSelectedRepo, hnStories, 3)
    }
    return []
  }, [enrichedSelectedRepo, hnStories, selectedNode])

  if (!selectedNode) {
    return (
      <div
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-dim)',
          lineHeight: 2.2,
        }}
      >
        <div style={{ fontSize: '28px', marginBottom: '12px', color: 'rgba(0,200,255,0.2)' }}>[]</div>
        CLICK ANY NODE
        <br />
        ON THE BRAIN GRAPH
        <br />
        <span style={{ fontSize: '8px', opacity: 0.5 }}>to view details</span>
      </div>
    )
  }

  const { type, label, data } = selectedNode
  const color = TYPE_COLORS[type] || 'var(--cyan)'
  const typeLabel = TYPE_LABELS[type] || `${type.toUpperCase()} NODE`
  const displayLabel = (type === 'local_pdf' || type === 'local_text') && data?.title ? data.title : label

  const askAboutNode = async () => {
    const question =
      type === 'repo'
        ? `Tell me about my ${label} project. What are the key technical decisions and how can I improve it?`
        : type === 'news'
        ? `Explain this story and why it matters for my work: "${data?.title || label}"`
        : type === 'local_pdf' || type === 'local_text'
        ? `Analyze this ingested document for me: "${displayLabel}". Summarize the important ideas and how they connect to my current projects.`
        : `How does ${label} relate to my current projects and what should I know about it?`

    setActivePanel('chat')
    await sendChat(question)
  }

  const repoData = type === 'repo' ? enrichedSelectedRepo : null

  const openRepoNode = (repo) => {
    setSelectedNode({
      id: `repo-${repo.name}`,
      label: repo.name,
      type: 'repo',
      data: repo,
    })
  }

  const openNewsNode = (story, index) => {
    setSelectedNode({
      id: `hn-${index}`,
      label: `${(story.title || '').slice(0, 20)}...`,
      type: 'news',
      data: story,
    })
  }

  return (
    <div className="scroll-area" style={{ padding: '16px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-dim)',
              letterSpacing: '0.15em',
              marginBottom: '4px',
            }}
          >
            {typeLabel}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              color,
              letterSpacing: '0.05em',
              textShadow: `0 0 10px ${color}50`,
            }}
          >
            {displayLabel}
          </div>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          style={{
            background: 'none',
            border: '1px solid rgba(0,200,255,0.15)',
            borderRadius: '3px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            cursor: 'pointer',
            padding: '3px 7px',
          }}
        >
          X
        </button>
      </div>

      {type === 'repo' && repoData && (
        <div>
          {repoData.description && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: '14px',
                lineHeight: 1.5,
              }}
            >
              {repoData.description}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {repoData.language && (
              <div
                style={{
                  background: 'rgba(167,139,250,0.08)',
                  border: '1px solid rgba(167,139,250,0.2)',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: '#a78bfa',
                }}
              >
                {repoData.language}
              </div>
            )}
            {repoData.stars !== undefined && (
              <div
                style={{
                  background: 'rgba(240,180,41,0.05)',
                  border: '1px solid rgba(240,180,41,0.2)',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--gold)',
                }}
              >
                Stars {repoData.stars}
              </div>
            )}
            {repoData.file_count > 0 && (
              <div
                style={{
                  background: 'rgba(0,255,159,0.05)',
                  border: '1px solid rgba(0,255,159,0.2)',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--green)',
                }}
              >
                Files {repoData.file_count}
              </div>
            )}
          </div>

          {(repoData.derivedTopics || []).length > 0 && (
            <Section title="TOPICS">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {repoData.derivedTopics.map((topic) => (
                  <span key={topic} className="tag">
                    {topic}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {(repoData.derivedPatterns || []).length > 0 && (
            <Section title="PATTERNS">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {repoData.derivedPatterns.map((pattern) => (
                  <span key={pattern} className="tag">
                    {pattern}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {repoData.url && (
            <a
              href={repoData.url}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ display: 'inline-block', textDecoration: 'none', marginTop: '16px' }}
            >
              VIEW ON GITHUB
            </a>
          )}
        </div>
      )}

      {type === 'news' && data && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: '12px',
              lineHeight: 1.5,
            }}
          >
            {data.title}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span className="tag">Score {data.score}</span>
            {data.by && <span className="tag">by {data.by}</span>}
          </div>
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ display: 'inline-block', textDecoration: 'none', marginBottom: '14px' }}
            >
              READ STORY
            </a>
          )}
        </div>
      )}

      {(type === 'topic' || type === 'lang') && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginBottom: '14px',
            lineHeight: 1.5,
          }}
        >
          {type === 'lang'
            ? 'Programming language used across your repositories.'
            : 'Topic tag found across one or more of your repos.'}
        </div>
      )}

      {(type === 'local_pdf' || type === 'local_text') && data && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: '14px',
              lineHeight: 1.55,
            }}
          >
            {data.preview || 'Recently ingested local content available in the knowledge store.'}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {(data.file_type || data.language) && (
              <div
                style={{
                  background: `${color}10`,
                  border: `1px solid ${color}40`,
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color,
                }}
              >
                {data.file_type || data.language}
              </div>
            )}
            {data.chunks && (
              <div
                style={{
                  background: 'rgba(0,200,255,0.05)',
                  border: '1px solid rgba(0,200,255,0.2)',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--cyan)',
                }}
              >
                Chunks {data.chunks}
              </div>
            )}
          </div>

          <Section title="SOURCE">
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-secondary)',
                lineHeight: 1.7,
                wordBreak: 'break-word',
              }}
            >
              {data.source}
              {data.directory && (
                <>
                  <br />
                  ROOT {data.directory}
                </>
              )}
            </div>
          </Section>
        </div>
      )}

      {relatedRepos.length > 0 && (
        <Section title={type === 'news' ? 'RELATED REPOS' : 'SIMILAR REPOS'}>
          {relatedRepos.map(({ repo, score }) => (
            <JumpButton
              key={repo.name}
              label={`${repo.name}  (${score})`}
              color="var(--green)"
              onClick={() => openRepoNode(repo)}
            />
          ))}
        </Section>
      )}

      {relatedNews.length > 0 && (
        <Section title="RELEVANT NEWS">
          {relatedNews.map(({ story, score, index }) => (
            <JumpButton
              key={`${story.title}-${index}`}
              label={`${story.title}  (${score})`}
              color="#ff6b9d"
              onClick={() => openNewsNode(story, index)}
            />
          ))}
        </Section>
      )}

      <button className="btn btn-gold" onClick={askAboutNode} style={{ width: '100%', marginTop: '18px' }}>
        ASK JARVIS ABOUT THIS
      </button>
    </div>
  )
}
