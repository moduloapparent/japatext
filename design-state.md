# Design state — Japatext (Designpowers review)

## Inferred brief (review lane)

- **Product:** Immersive Japanese chat/email practice with persistent characters.
- **Key task:** Text like a real conversation; open study help only when wanted.
- **Audience:** Learners who want fun, natural Japanese — not a classroom UI.
- **Quality bar:** Messaging-app feel first; learning tools secondary and quiet.
- **Prompt for review:** Align chrome/copy/workflow with immersion intent.

## Principles (for this pass)

1. Immersion first — UI should feel like LINE/メール, not a tutor dashboard.
2. Japanese in the chrome — English labels only when unavoidable.
3. Study is on-demand — discoverable, never center-stage.
4. Difficulty controls are quiet — available, not shouting “N+1”.

## Review summary (reconciled)

| Source | Finding | Severity | Action |
|--------|---------|----------|--------|
| Critic / H2 | English “Notes/Settings/N+1/Natural” break Japanese world | Major | Japanize |
| Critic | Mode toggle looks like a LMS control in the chat header | Major | Japanize labels; keep filled accent toggle (user preferred over soft outline) |
| Heuristic H6 | Tap-to-study is powerful but invisible | Major | Quiet hint under compose |
| Heuristic H2 | Empty states / onboarding say “AI” / generic | Minor | Warmer copy |
| A11y | Mode buttons need clearer accessible names | Minor | titles + aria |
| Heuristic H8 | API key warning exposes `server/.env` in nav | Minor | Soften / Japanese |

## Decisions (character / AXD)

- Adopted from Owl-Listener/ai-design-skills: anti-persona, error/repair personality,
  mixed-initiative turn ownership, silent frustration handling, positive short-reply examples,
  identity-first system prompt structure (no "I'm an AI" in character voice).
- Deferred: golden-response regression library, formal eval rubrics, per-character tone matrices.
