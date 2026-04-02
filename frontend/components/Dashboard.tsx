"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { BriefInsight, getBrief, getContext, ingestExternal, ingestGithub, setContext, synthesizeSpeech } from "../lib/api";

export function Dashboard() {
  const [goalsInput, setGoalsInput] = useState("");
  const [project, setProject] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [brief, setBrief] = useState<BriefInsight[]>([
    {
      signal: "New AI repo trending",
      why_it_matters: "Relevant to your backend AI work",
      action: "Review repo and extract ideas",
      effort: "1 hour",
      priority: "HIGH"
    }
  ]);
  const [status, setStatus] = useState("");
  const [loadingBrief, setLoadingBrief] = useState(false);

  const actions = useMemo(() => brief.map((b) => b.action), [brief]);
  const learning = useMemo(() => brief.map((b) => b.signal), [brief]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const context = await getContext();
        if (!mounted) return;
        setProject(context.active_project ?? "");
        setGoalsInput((context.daily_goals ?? []).join(", "));
      } catch {
        // Initial context may not exist yet.
      }
      await refreshBrief();
    }
    init();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshBrief() {
    setLoadingBrief(true);
    try {
      const data = await getBrief();
      setBrief(data.insights);
      setStatus("Daily brief refreshed.");
    } catch (err) {
      setStatus(`Brief unavailable. Showing fallback data. ${(err as Error).message}`);
    } finally {
      setLoadingBrief(false);
    }
  }

  async function saveContext(e: FormEvent) {
    e.preventDefault();
    const daily_goals = goalsInput
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    try {
      await setContext({ daily_goals, active_project: project.trim() });
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
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  async function readBriefAloud() {
    const text = brief
      .map(
        (item, idx) =>
          `Insight ${idx + 1}. ${item.signal}. Why it matters: ${item.why_it_matters}. Action: ${item.action}. Effort: ${item.effort}. Priority: ${item.priority}.`
      )
      .join(" ");
    if (!text.trim()) return;
    try {
      setStatus("Generating brief audio...");
      const audio = await synthesizeSpeech(text);
      const url = URL.createObjectURL(audio);
      const player = new Audio(url);
      player.play().catch(() => undefined);
      setStatus("Brief readout started.");
    } catch (err) {
      setStatus(`Readout failed. ${(err as Error).message}`);
    }
  }

  async function readAllAloud() {
    const contextText = `Active project ${project || "not set"}. Daily goals ${goalsInput || "not set"}.`;
    const actionsText = actions.length ? `Actions: ${actions.join(". ")}.` : "No actions yet.";
    const learningText = learning.length ? `Learning focus: ${learning.join(". ")}.` : "No learning items yet.";
    const briefText = brief
      .map(
        (item, idx) =>
          `Insight ${idx + 1}. ${item.signal}. ${item.why_it_matters}. ${item.action}.`
      )
      .join(" ");
    const fullText = `${contextText} ${briefText} ${actionsText} ${learningText}`;
    try {
      setStatus("Generating full readout...");
      const audio = await synthesizeSpeech(fullText);
      const url = URL.createObjectURL(audio);
      const player = new Audio(url);
      player.play().catch(() => undefined);
      setStatus("Full readout started.");
    } catch (err) {
      setStatus(`Readout failed. ${(err as Error).message}`);
    }
  }

  return (
    <section className="panel">
      <h2>Command Layer</h2>
      <form className="stack" onSubmit={saveContext}>
        <label>
          Active project
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="JARVIS AI Brain"
          />
        </label>
        <label>
          Daily goals (comma separated)
          <input
            value={goalsInput}
            onChange={(e) => setGoalsInput(e.target.value)}
            placeholder="Ship backend ranking, test voice flow, refine brief"
          />
        </label>
        <div className="row">
          <button type="submit">Save Context</button>
          <button type="button" onClick={refreshBrief} disabled={loadingBrief}>
            {loadingBrief ? "Refreshing..." : "Refresh Brief"}
          </button>
          <button type="button" onClick={readBriefAloud}>
            Read Brief
          </button>
          <button type="button" onClick={readAllAloud}>
            Read All
          </button>
        </div>
      </form>

      <div className="stack">
        <div className="row">
          <button type="button" onClick={runExternalIngest}>
            Ingest External Signals
          </button>
        </div>
        <form className="row" onSubmit={runGithubIngest}>
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo or GitHub URL"
          />
          <button type="submit">Ingest GitHub Repo</button>
        </form>
      </div>

      <p className="status">{status}</p>

      <div className="grid2">
        <article className="card">
          <h3>Daily Brief</h3>
          <ul>
            {brief.map((item, idx) => (
              <li key={`${item.signal}-${idx}`}>
                <p>
                  <strong>{item.signal}</strong> ({item.priority})
                </p>
                <p>{item.why_it_matters}</p>
                <p>
                  Action: {item.action} | Effort: {item.effort}
                </p>
              </li>
            ))}
            {brief.length === 0 ? <li>Run ingestion to generate insights.</li> : null}
          </ul>
        </article>

        <article className="card">
          <h3>Actions</h3>
          <ul>
            {actions.length ? actions.map((a, i) => <li key={`${a}-${i}`}>{a}</li>) : <li>No actions yet.</li>}
          </ul>
        </article>

        <article className="card">
          <h3>Learning</h3>
          <ul>
            {learning.length ? learning.map((l, i) => <li key={`${l}-${i}`}>{l}</li>) : <li>No learning items yet.</li>}
          </ul>
        </article>
      </div>
    </section>
  );
}
