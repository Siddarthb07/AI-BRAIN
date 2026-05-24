"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  BriefInsight,
  getBrief,
  getContext,
  getGraph,
  getInsights,
  ingestExternal,
  ingestGithub,
  ingestGithubUser,
  setContext,
  speakText
} from "../lib/api";

export function Dashboard() {
  const [goalsInput, setGoalsInput] = useState("");
  const [project, setProject] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [githubUser, setGithubUser] = useState("Siddarthb07");
  const [focusRepos, setFocusRepos] = useState<string[]>([]);
  const [focusTopics, setFocusTopics] = useState("");
  const [repoOptions, setRepoOptions] = useState<string[]>([]);
  const [brief, setBrief] = useState<BriefInsight[]>([]);
  const [insights, setInsights] = useState<{ title: string; url?: string }[]>([]);
  const [status, setStatus] = useState("Ready");
  const [loadingBrief, setLoadingBrief] = useState(false);

  const actions = useMemo(() => brief.map((b) => b.action), [brief]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const context = await getContext();
        if (!mounted) return;
        setProject(context.active_project ?? "");
        setGoalsInput((context.daily_goals ?? []).join(", "));
        setFocusRepos(context.focus_repos ?? []);
        setFocusTopics((context.focus_topics ?? []).join(", "));
      } catch {
        // ignore
      }
      try {
        const graph = await getGraph();
        const repoNames = (graph.nodes || [])
          .filter((node: { kind: string; name: string }) => node.kind === "github_repo")
          .map((node: { name: string }) => node.name);
        setRepoOptions(Array.from(new Set(repoNames)).slice(0, 40));
      } catch {
        // ignore
      }
      await refreshBrief();
      await refreshInsights();
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshBrief() {
    setLoadingBrief(true);
    try {
      const data = await getBrief();
      setBrief(data.insights);
      setStatus("Brief refreshed.");
    } catch (err) {
      setStatus(`Brief unavailable. ${(err as Error).message}`);
    } finally {
      setLoadingBrief(false);
    }
  }

  async function refreshInsights() {
    try {
      const data = await getInsights();
      setInsights(data);
    } catch {
      setInsights([]);
    }
  }

  async function saveContext(e: FormEvent) {
    e.preventDefault();
    const daily_goals = goalsInput
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const focus_topics = focusTopics
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await setContext({
        daily_goals,
        active_project: project.trim(),
        focus_repos: focusRepos,
        focus_topics
      });
      setStatus("Context saved.");
      await refreshBrief();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function runExternalIngest() {
    try {
      setStatus("Fetching external signals...");
      const result = await ingestExternal();
      setStatus(result.message || "External ingestion complete.");
      await refreshBrief();
      await refreshInsights();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function runGithubIngest(e: FormEvent) {
    e.preventDefault();
    if (!repoInput.trim()) return;
    try {
      setStatus("Indexing GitHub repository...");
      const result = await ingestGithub(repoInput.trim());
      setStatus(result.message || "GitHub ingestion complete.");
      setRepoInput("");
      await refreshBrief();
      await refreshInsights();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function runGithubUserIngest() {
    try {
      setStatus("Indexing all GitHub repos...");
      const result = await ingestGithubUser(githubUser.trim() || "Siddarthb07");
      setStatus(result.message || "GitHub user ingestion complete.");
      await refreshBrief();
      await refreshInsights();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function readBriefAloud() {
    const text = brief
      .map(
        (item, idx) =>
          `Insight ${idx + 1}. ${item.signal}. Why it matters: ${item.why_it_matters}. Action: ${item.action}.`
      )
      .join(" ");
    if (!text.trim()) return;
    await speakText(text);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Command Center</h2>
        <span className="pill">{status}</span>
      </div>

      <form className="section-grid" onSubmit={saveContext}>
        <label>
          Active project
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="JARVIS AI Brain"
          />
        </label>
        <label>
          Daily goals
          <input
            value={goalsInput}
            onChange={(e) => setGoalsInput(e.target.value)}
            placeholder="Priorities for today"
          />
        </label>
        <div className="row">
          <button type="submit">Save</button>
          <button type="button" onClick={refreshBrief} disabled={loadingBrief}>
            {loadingBrief ? "Refreshing..." : "Refresh Brief"}
          </button>
          <button type="button" onClick={readBriefAloud}>
            Read Brief
          </button>
        </div>
      </form>

      <details className="details" open>
        <summary>Focus repos</summary>
        <div className="scroll">
          <div className="chip-grid">
            {repoOptions.length === 0 ? (
              <span className="muted">Run GitHub ingestion to load repos.</span>
            ) : (
              repoOptions.map((repo) => (
                <button
                  key={repo}
                  type="button"
                  className={`chip ${focusRepos.includes(repo) ? "active" : ""}`}
                  onClick={() => {
                    if (focusRepos.includes(repo)) {
                      setFocusRepos((prev) => prev.filter((item) => item !== repo));
                    } else {
                      setFocusRepos((prev) => [...prev, repo]);
                    }
                  }}
                >
                  {repo}
                </button>
              ))
            )}
          </div>
        </div>
      </details>

      <details className="details">
        <summary>Learning topics</summary>
        <input
          value={focusTopics}
          onChange={(e) => setFocusTopics(e.target.value)}
          placeholder="agents, rag, fastapi"
        />
      </details>

      <div className="section">
        <div className="row">
          <button type="button" onClick={runExternalIngest}>
            Ingest Intel
          </button>
          <button type="button" onClick={runGithubUserIngest}>
            Ingest All Repos
          </button>
        </div>
        <form className="row" onSubmit={runGithubIngest}>
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
          />
          <button type="submit">Ingest Repo</button>
        </form>
        <label>
          GitHub username
          <input value={githubUser} onChange={(e) => setGithubUser(e.target.value)} />
        </label>
      </div>

      <div className="section">
        <h3>Brief highlights</h3>
        <div className="list compact">
          {brief.slice(0, 4).map((item, idx) => (
            <div key={`${item.signal}-${idx}`} className="brief-item">
              <strong>{item.signal}</strong>
              <span>{item.action}</span>
            </div>
          ))}
          {brief.length === 0 ? <span className="muted">Run ingestion to generate insights.</span> : null}
        </div>
      </div>

      <details className="details">
        <summary>Intel feeds</summary>
        <div className="list compact">
          {insights.slice(0, 6).map((item) =>
            item.url ? (
              <a key={item.title} href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            ) : (
              <span key={item.title}>{item.title}</span>
            )
          )}
          {insights.length === 0 ? <span className="muted">No signals yet.</span> : null}
        </div>
      </details>

      <div className="section">
        <h3>Action queue</h3>
        <div className="list compact">
          {actions.slice(0, 5).map((a, i) => (
            <span key={`${a}-${i}`}>{a}</span>
          ))}
          {actions.length === 0 ? <span className="muted">No actions yet.</span> : null}
        </div>
      </div>
    </section>
  );
}
