"use client";

import { useEffect, useState } from "react";

import { getVaultStatus, listVaultNotes, syncVault } from "../lib/api";

export function VaultPanel() {
  const [status, setStatus] = useState<{ vault_path?: string; note_count?: number } | null>(null);
  const [notes, setNotes] = useState<Array<{ relative_path: string; title: string }>>([]);
  const [msg, setMsg] = useState("");

  async function refresh() {
    try {
      const st = await getVaultStatus();
      setStatus(st);
      const data = await listVaultNotes(30);
      setNotes(data.notes || []);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSync() {
    setMsg("Syncing...");
    try {
      const result = await syncVault();
      setMsg(`Synced ${result.indexed_chunks || 0} chunks`);
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <section className="panel">
      <h2>Obsidian Vault</h2>
      <p className="muted">{status?.vault_path || "Loading..."}</p>
      <p className="muted">{status?.note_count ?? 0} notes in JARVIS/</p>
      <div className="row">
        <button type="button" onClick={onSync}>
          Sync vault → RAG
        </button>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </div>
      <ul>
        {notes.map((n) => (
          <li key={n.relative_path}>
            <small>{n.relative_path.replace(/\\/g, "/")}</small>
          </li>
        ))}
      </ul>
      {msg ? <p className="status">{msg}</p> : null}
    </section>
  );
}
