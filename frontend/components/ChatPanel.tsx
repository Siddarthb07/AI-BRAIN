"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

import { sendChat, synthesizeSpeech, transcribeAudio } from "../lib/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [lastAssistant, setLastAssistant] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

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
      const result = await sendChat(text);
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      setLastAssistant(result.reply);
      setStatus("Response received.");

      if (voiceEnabled && result.reply.trim()) {
        setStatus("Generating voice...");
        const audio = await synthesizeSpeech(result.reply);
        const url = URL.createObjectURL(audio);
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        setAudioUrl(url);
        const player = new Audio(url);
        player.play().catch(() => undefined);
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
      const audio = await synthesizeSpeech(lastAssistant);
      const url = URL.createObjectURL(audio);
      const player = new Audio(url);
      player.play().catch(() => undefined);
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

      {audioUrl ? <audio controls src={audioUrl} /> : null}
      <p className="status">{status}</p>
    </section>
  );
}
