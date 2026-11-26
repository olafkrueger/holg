# HOLG

HOLG is a suite of small, accessible apps for stroke survivors who have lost speech and reading ability.

## Sub-app convention

Each sub-app lives in its own directory at the repository root:

- `<app>/app/` – static PWA frontend
- `<app>/api/` – small Fastify backend
- `<app>/README.md` – run, environment and deployment notes

Sub-apps share the same calm, icon-led Material 3 approach but keep their data and deployment simple. The first sub-app is [`Sókn`](sokn/), a private visitor calendar.