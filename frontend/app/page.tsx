import { ChatPanel } from "../components/ChatPanel";
import { Dashboard } from "../components/Dashboard";
import { BrainGraph } from "../components/BrainGraph";

export default function HomePage() {
  return (
    <main className="container">
      <header className="hero">
        <h1>JARVIS AI Brain</h1>
        <p>Always-on command intelligence with voice readouts on demand.</p>
      </header>
      <section className="layout">
        <div className="layout-main">
          <BrainGraph />
        </div>
        <div className="layout-side">
          <Dashboard />
          <ChatPanel />
        </div>
      </section>
    </main>
  );
}
