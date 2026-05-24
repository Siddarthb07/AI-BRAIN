"use client";

import { useEffect, useState } from "react";

import { getHealth, getVaultStatus } from "../lib/api";

export function StatusBar() {
  const [health, setHealth] = useState<{
    ollama?: boolean;
    qdrant?: boolean;
    vault_configured?: boolean;
    demo_mode?: boolean;
  }>({});
  const [vaultPath, setVaultPath] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [h, v] = await Promise.all([getHealth(), getVaultStatus()]);
        if (!mounted) return;
        setHealth(h);
        setVaultPath(v.vault_path || "");
      } catch {
        // ignore
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const dots = [
    { label: "OLLAMA", ok: health.ollama },
    { label: "QDRANT", ok: health.qdrant },
    { label: "VAULT", ok: health.vault_configured || Boolean(vaultPath) }
  ];

  return (
    <div className="status-bar">
      <div className="status-dots">
        {dots.map((item) => (
          <span key={item.label} className="status-dot">
            <span className={`dot ${item.ok ? "ok" : "bad"}`} />
            {item.label}
          </span>
        ))}
      </div>
      {health.demo_mode ? <span className="pill warn">DEMO MODE</span> : null}
    </div>
  );
}
