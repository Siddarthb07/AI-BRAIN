# Demo design skills (reference)

JARVIS demo sites encode landing-page craft from:

- [agent-website-design-skills](https://github.com/divyanshu-iitian/agent-website-design-skills) — especially **web-visual-direction** and **landing-page-craft**

Those rules are not re-fetched at build time. They live in `services/demo_design.py` as `DESIGN_BRIEF` (injected via `llm_system_prompt()`), with kits, layouts, and hard bans (no purple kits, no fake testimonials/metrics). Templates in `demo_templates.py` render the Vite+React scaffold from the normalized spec.
