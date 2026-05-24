import { ChatPanel } from "../components/ChatPanel";
import { Dashboard } from "../components/Dashboard";
import { BrainGraph } from "../components/BrainGraph";
import { StatusBar } from "../components/StatusBar";
import { VaultPanel } from "../components/VaultPanel";

export default function HomePage() {
  return (
    <main className="container">
      <header className="hero">
        <h1>JARVIS AI Brain</h1>
        <p>Local chief-of-staff — vault, RAG, brief, and chat.</p>
        <StatusBar />
      </header>
      <section className="layout">
        <div className="layout-main">
          <BrainGraph />
        </div>
        <div className="layout-side">
          <Dashboard />
          <VaultPanel />
          <ChatPanel />
        </div>
      </section>
    </main>
  );
}
