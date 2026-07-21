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
| Critic | Mode toggle looks like a LMS control in the chat header | Major | Soften labels + style |
| Heuristic H6 | Tap-to-study is powerful but invisible | Major | Quiet hint under compose |
| Heuristic H2 | Empty states / onboarding say “AI” / generic | Minor | Warmer copy |
| A11y | Mode buttons need clearer accessible names | Minor | titles + aria |
| Heuristic H8 | API key warning exposes `server/.env` in nav | Minor | Soften / Japanese |

## Decisions

- Mode labels: 「ちょうどいい」 / 「そのまま」 (not N+1 / Natural in chrome).
- Study hint: one-line, dismissible, localStorage.
- Keep study-on-tap interaction; do not add inline translations.
