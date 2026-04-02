"use client";

import { useState } from "react";

const SECTIONS = [
  { id: "neural-core", label: "Neural Core" },
  { id: "command-layer", label: "Command Layer" },
  { id: "intel-feeds", label: "Intel Feeds" },
  { id: "repos", label: "Repos" },
  { id: "voice-ops", label: "Voice Ops" }
];

export function Sidebar() {
  const [active, setActive] = useState("neural-core");

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">JARVIS</div>
      <nav className="sidebar-nav">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-item ${active === item.id ? "active" : ""}`}
            onClick={() => scrollTo(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="badge">Local Mode</div>
        <p>All systems offline by default.</p>
      </div>
    </aside>
  );
}
