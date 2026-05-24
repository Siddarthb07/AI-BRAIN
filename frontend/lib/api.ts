const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8010";

export type BriefInsight = {
  signal: string;
  why_it_matters: string;
  action: string;
  effort: string;
  priority: string;
};

export type GraphNode = {
  id: string;
  name: string;
  kind: string;
  tech?: string[];
  active?: boolean;
  videos?: Array<{ title: string; url: string } | string>;
  news?: Array<{ title: string; url: string } | string>;
  parent?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type InsightItem = {
  id: string;
  source: string;
  title: string;
  summary: string;
  url?: string;
  timestamp: string;
};

export async function getBrief() {
  const res = await fetch(`${API_BASE}/brief`);
  if (!res.ok) throw new Error("brief fetch failed");
  return res.json();
}

export async function getInsights() {
  const res = await fetch(`${API_BASE}/insights`);
  if (!res.ok) throw new Error("insights fetch failed");
  return res.json();
}

export async function getGraph() {
  const res = await fetch(`${API_BASE}/graph`);
  if (!res.ok) throw new Error("graph fetch failed");
  return res.json();
}

export async function getContext() {
  const res = await fetch(`${API_BASE}/context`);
  if (!res.ok) throw new Error("context fetch failed");
  return res.json();
}

export async function getHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("health check failed");
  return res.json();
}

export async function getVaultStatus() {
  const res = await fetch(`${API_BASE}/vault/status`);
  if (!res.ok) throw new Error("vault status failed");
  return res.json();
}

export async function listVaultNotes(limit = 40) {
  const res = await fetch(`${API_BASE}/vault/notes?limit=${limit}`);
  if (!res.ok) throw new Error("vault list failed");
  return res.json();
}

export async function syncVault() {
  const res = await fetch(`${API_BASE}/vault/sync`, { method: "POST" });
  if (!res.ok) throw new Error("vault sync failed");
  return res.json();
}

export async function saveChatToVault(content: string, title?: string) {
  const res = await fetch(`${API_BASE}/chat/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, title: title || "JARVIS note", folder: "Chat" })
  });
  if (!res.ok) throw new Error("vault save failed");
  return res.json();
}

export async function setContext(payload: {
  daily_goals: string[];
  active_project: string;
  focus_repos: string[];
  focus_topics: string[];
}) {
  const res = await fetch(`${API_BASE}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("context save failed");
  return res.json();
}

export async function ingestGithub(repo: string) {
  const res = await fetch(`${API_BASE}/ingest/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo })
  });
  if (!res.ok) throw new Error("github ingest failed");
  return res.json();
}

export async function ingestGithubUser(user: string) {
  const res = await fetch(`${API_BASE}/ingest/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user })
  });
  if (!res.ok) throw new Error("github user ingest failed");
  return res.json();
}

export async function ingestExternal() {
  const res = await fetch(`${API_BASE}/ingest/external`);
  if (!res.ok) throw new Error("external ingest failed");
  return res.json();
}

export async function sendChat(message: string, sessionId?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error("chat failed");
    return res.json();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("chat timed out");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getChatHistory(sessionId?: string) {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`${API_BASE}/chat/history${query}`);
  if (!res.ok) throw new Error("chat history failed");
  return res.json();
}

export async function confirmChatAction(actionId: string, sessionId?: string) {
  const res = await fetch(`${API_BASE}/chat/action/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action_id: actionId, session_id: sessionId })
  });
  if (!res.ok) throw new Error("action confirm failed");
  return res.json();
}

export async function transcribeAudio(blob: Blob) {
  const data = new FormData();
  data.append("file", blob, "voice.webm");

  const res = await fetch(`${API_BASE}/voice/input`, {
    method: "POST",
    body: data
  });
  if (!res.ok) throw new Error("transcribe failed");
  return res.json();
}

export async function speakText(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    speechSynthesis.speak(utter);
    return true;
  }
  try {
    const res = await fetch(`${API_BASE}/voice/output`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error("tts failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}
