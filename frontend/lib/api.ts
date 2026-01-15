export type ContextPayload = {
  daily_goals: string[];
  active_project: string;
};

export type BriefInsight = {
  signal: string;
  why_it_matters: string;
  action: string;
  effort: string;
  priority: string;
};

export type BriefResponse = {
  insights: BriefInsight[];
};

export type ChatResponse = {
  reply: string;
  sources: Array<{ id: string; title: string; source: string; score: number }>;
};

export type GraphNode = {
  id: string;
  name: string;
  kind: string;
  tech: string[];
  active: boolean;
  videos?: string[];
  parent?: string;
  news?: string[];
};

export type GraphEdge = {
  source: string;
  target: string;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.detail ?? "";
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getContext(): Promise<ContextPayload & { updated_at: string }> {
  return http("/context");
}

export async function setContext(payload: ContextPayload): Promise<ContextPayload & { updated_at: string }> {
  return http("/context", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function ingestExternal(): Promise<{ message: string }> {
  return http("/ingest/external");
}

export async function ingestGithub(repo: string): Promise<{ message: string }> {
  return http("/ingest/github", {
    method: "POST",
    body: JSON.stringify({ repo })
  });
}

export async function getBrief(): Promise<BriefResponse> {
  return http("/brief");
}

export async function sendChat(message: string): Promise<ChatResponse> {
  return http("/chat", {
    method: "POST",
    body: JSON.stringify({ message })
  });
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "voice.webm");
  const res = await fetch(`${API_URL}/voice/input`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error("Voice transcription failed");
  }
  const data = await res.json();
  return data.text ?? "";
}

export async function synthesizeSpeech(text: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/voice/output`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    throw new Error("Voice synthesis failed");
  }
  return await res.blob();
}

export async function getGraph(): Promise<GraphResponse> {
  return http("/graph");
}
