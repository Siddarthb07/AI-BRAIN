"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  confirmChatAction,
  getChatHistory,
  saveChatToVault,
  sendChat,
  speakText,
  transcribeAudio
} from "../lib/api";

type ChatAction = {
  id: string;
  type: string;
  label: string;
  requires_confirm?: boolean;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ id: number; path: string; snippet?: string }>;
  actions?: ChatAction[];
};

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [lastAssistant, setLastAssistant] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      try {
        const data = await getChatHistory();
        if (!mounted) return;
        setSessionId(data.session_id || null);
        const history = (data.history || []).map((m: Message & { meta?: { citations?: Message["citations"]; actions?: ChatAction[] } }) => ({
          role: m.role,
          content: m.content,
          citations: m.meta?.citations,
          actions: m.meta?.actions
        }));
        setMessages(history);
      } catch {
        // ignore
      }
    }
    loadHistory();
    return () => {
      mounted = false;
    };
  }, []);

  async function runChat(messageText: string, addUserMessage = true) {
    const text = messageText.trim();
    if (!text) return;

    setBusy(true);
    setStatus("Thinking...");
    if (addUserMessage) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
    }
    setInput("");

    try {
      const result = await sendChat(text, sessionId || undefined);
      if (result.session_id) setSessionId(result.session_id);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          citations: result.citations || [],
          actions: result.actions || []
        }
      ]);
      setLastAssistant(result.reply);
      setStatus(result.llm_offline ? "LLM offline — start Ollama." : "Response received.");

      if (voiceEnabled && result.reply.trim() && !result.llm_offline) {
        setStatus("Generating voice...");
        await speakText(result.reply);
        setStatus("Voice playback ready.");
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${(err as Error).message}`
        }
      ]);
      setStatus("Chat request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmAction(action: ChatAction) {
    setBusy(true);
    setStatus(`Running: ${action.label}...`);
    try {
      const result = await confirmChatAction(action.id, sessionId || undefined);
      setStatus(result.ok ? `Done: ${result.result || action.label}` : result.error || "Action failed");
    } catch (err) {
      setStatus(`Action failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await runChat(input);
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: preferredType || "audio/webm" });
      setStatus("Transcribing...");
      try {
        const transcript = await transcribeAudio(blob);
        if (transcript.trim()) {
          setMessages((prev) => [...prev, { role: "user", content: transcript }]);
          await runChat(transcript, false);
        } else {
          setStatus("No speech detected.");
        }
      } catch (err) {
        setStatus(`Transcription failed: ${(err as Error).message}`);
      } finally {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
    setStatus("Recording...");
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    try {
      await startRecording();
    } catch (err) {
      setStatus(`Microphone unavailable: ${(err as Error).message}`);
    }
  }

  async function readLastReply() {
    if (!lastAssistant.trim()) {
      setStatus("No assistant reply to read yet.");
      return;
    }
    try {
      setStatus("Reading last reply...");
      await speakText(lastAssistant);
      setStatus("Reply readout started.");
    } catch (err) {
      setStatus(`Readout failed: ${(err as Error).message}`);
    }
  }

  return (
    <section className="panel">
      <h2>Conversational Interface</h2>
      <div className="chatbox">
        {hasMessages ? (
          messages.map((msg, idx) => (
            <div key={`${msg.role}-${idx}`} className={`msg ${msg.role}`}>
              <p>{msg.content}</p>
              {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                <div className="row inline">
                  {msg.citations.map((c) => (
                    <span key={c.id} className="tag">
                      [{c.id}] {c.path}
                    </span>
                  ))}
                </div>
              )}
              {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                <div className="row inline">
                  {msg.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => onConfirmAction(action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              {msg.role === "assistant" && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const saved = await saveChatToVault(msg.content, "JARVIS reply");
                      setStatus(`Saved to ${saved.saved?.relative_path || "vault"}`);
                    } catch (err) {
                      setStatus(`Save failed: ${(err as Error).message}`);
                    }
                  }}
                >
                  Save to Vault
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="muted">Start by typing or using the mic.</p>
        )}
      </div>

      <form className="row" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your project, priorities, or next actions..."
        />
        <button type="submit" disabled={busy}>
          {busy ? "Sending..." : "Send"}
        </button>
        <button
          type="button"
          className={recording ? "danger" : ""}
          onClick={toggleRecording}
          disabled={busy}
          aria-label="Microphone toggle"
        >
          {recording ? "Stop Mic" : "Start Mic"}
        </button>
        <button type="button" onClick={readLastReply} disabled={busy}>
          Read Reply
        </button>
      </form>

      <label className="row inline">
        <input
          type="checkbox"
          checked={voiceEnabled}
          onChange={(e) => setVoiceEnabled(e.target.checked)}
        />
        Speak assistant responses
      </label>

      <p className="status">{status}</p>
    </section>
  );
}
