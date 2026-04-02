"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  BriefInsight,
  getBrief,
  getContext,
  getGraph,
  getHealth,
  getInsights,
  ingestExternal,
  ingestGithub,
  ingestGithubUser,
  setContext,
  speakText
} from "../lib/api";

export function CommandPanel() {
  const [goalsInput, setGoalsInput] = useState("");
  const [project, setProject] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [githubUser, setGithubUser] = useState("Siddarthb07");
  const [focusRepos, setFocusRepos] = useState<string[]>([]);
  const [focusTopics, setFocusTopics] = useState("");
  const [repoOptions, setRepoOptions] = useState<string[]>([]);
  const [brief, setBrief] = useState<BriefInsight[]>([]);
  const [insights, setInsights] = useState<{ title: string; url?: string; summary: string }[]>(
    []
  );
  const [status, setStatus] = useState("");
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [backendStatus, setBackendStatus] = useState("Unknown");

  const actions = useMemo(() => brief.map((b) => b.action), [brief]);
  const learning = useMemo(() => brief.map((b) => b.signal), [brief]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const health = await getHealth();
        if (mounted) setBackendStatus(health.status ?? "ok");
      } catch {
        if (mounted) setBackendStatus("Offline");
      }
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
        setRepoOptions(Array.from(new Set(repoNames)).slice(0, 30));
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
    await speakText(text);
  }

  async function readAllAloud() {
    const contextText = `Active project ${project || "not set"}. Daily goals ${goalsInput || "not set"}.`;
    const actionsText = actions.length ? `Actions: ${actions.join(". ")}.` : "No actions yet.";
    const learningText = learning.length ? `Learning focus: ${learning.join(". ")}.` : "No learning items yet.";
    const briefText = brief
      .map((item, idx) => `Insight ${idx + 1}. ${item.signal}. ${item.why_it_matters}. ${item.action}.`)
      .join(" ");
    const fullText = `${contextText} ${briefText} ${actionsText} ${learningText}`;
    await speakText(fullText);
  }

  return (
    <section className="panel" id="command-layer">
      <h2>Command Layer</h2>
      <form className="grid" onSubmit={saveContext}>
        <div>
          <div className="label">Active project</div>
          <input
            className="input"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="JARVIS AI Brain"
          />
        </div>
        <div>
          <div className="label">Daily goals (comma separated)</div>
          <input
            className="input"
            value={goalsInput}
            onChange={(e) => setGoalsInput(e.target.value)}
            placeholder="Ship ingestion, analyze repos, summarize learnings"
          />
        </div>
        <div className="grid two">
          <button type="submit">Save Context</button>
          <button type="button" className="secondary" onClick={refreshBrief} disabled={loadingBrief}>
            {loadingBrief ? "Refreshing..." : "Refresh Brief"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              if (brief.length === 0) {
                await refreshBrief();
              }
              await readBriefAloud();
            }}
          >
            Read Brief
          </button>
          <button type="button" className="secondary" onClick={readAllAloud}>
            Read Everything Now
          </button>
        </div>
      </form>

      <div className="grid">
        <div id="repos">
          <div className="label">Focus repos (choose deliberately)</div>
          <div className="list">
            {repoOptions.length === 0 ? (
              <div className="stat">Run GitHub ingestion to load repos.</div>
            ) : (
              repoOptions.map((repo) => (
                <label key={repo} className="stat" style={{ cursor: "pointer" }}>
                  <span>{repo}</span>
                  <input
                    type="checkbox"
                    checked={focusRepos.includes(repo)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFocusRepos((prev) => [...prev, repo]);
                      } else {
                        setFocusRepos((prev) => prev.filter((item) => item !== repo));
                      }
                    }}
                  />
                </label>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="label">Focus topics (comma separated)</div>
          <input
            className="input"
            value={focusTopics}
            onChange={(e) => setFocusTopics(e.target.value)}
            placeholder="agents, rag, fastapi, vector db"
          />
        </div>
        <div>
          <div className="label">GitHub username</div>
          <input
            className="input"
            value={githubUser}
            onChange={(e) => setGithubUser(e.target.value)}
            placeholder="Siddarthb07"
          />
        </div>
        <div className="grid two">
          <button type="button" onClick={runExternalIngest}>
            Ingest External Signals
          </button>
          <button type="button" onClick={runGithubUserIngest}>
            Ingest All GitHub Repos
          </button>
        </div>
        <form className="grid two" onSubmit={runGithubIngest}>
          <input
            className="input"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo or GitHub URL"
          />
          <button type="submit">Ingest GitHub Repo</button>
        </form>
      </div>

      <div className="list">
        <div className="stat">
          <span>Status</span>
          <span>{status || "Ready"}</span>
        </div>
        <div className="stat">
          <span>Backend</span>
          <span>{backendStatus}</span>
        </div>
      </div>

      <div className="grid" id="daily-brief">
        <div className="panel">
          <h2>Daily Brief</h2>
          <div className="list">
            {brief.map((item, idx) => (
              <div key={`${item.signal}-${idx}`} className="stat">
                <span>
                  {item.signal} ({item.priority})
                </span>
                <span>{item.action}</span>
              </div>
            ))}
            {brief.length === 0 ? <div className="stat">Run ingestion to generate insights.</div> : null}
          </div>
        </div>

        <div className="panel" id="intel-feeds">
          <h2>Intel Feeds</h2>
          <div className="list">
            {insights.slice(0, 6).map((item) =>
              item.url ? (
                <a key={item.title} href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              ) : (
                <div key={item.title} className="stat">
                  {item.title}
                </div>
              )
            )}
            {insights.length === 0 ? <div className="stat">Run external ingestion to fill signals.</div> : null}
          </div>
        </div>

        <div className="panel">
          <h2>Actions</h2>
          <div className="list">
            {actions.length ? actions.map((a, i) => <div key={`${a}-${i}`}>{a}</div>) : "No actions yet."}
          </div>
        </div>

        <div className="panel">
          <h2>Learning</h2>
          <div className="list">
            {learning.length ? learning.map((l, i) => <div key={`${l}-${i}`}>{l}</div>) : "No learning items yet."}
          </div>
        </div>
      </div>
    </section>
  );
}
