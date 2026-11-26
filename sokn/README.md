# S\u00f3kn

S\u00f3kn is a private visitor circle for one person and the family or friends who visit them.

## Run locally

```powershell
cd sokn/api
npm install
set DEV_LOGIN=1
npm start
```

Open `http://localhost:3000`. The development login is intentionally enabled outside production and lets tests and local use create a user without OAuth keys.

## Environment

Copy `api/.env.example` and set:

- `PORT`, `HOST`, `BASE_URL`
- `COOKIE_SECRET` (32+ random bytes)
- `DB_PATH`
- `DEV_LOGIN=0` in production
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Microsoft: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT`
- Apple: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
- Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

Generate VAPID keys with `npx web-push generate-vapid-keys`.

## Docker

From the repository root:

```bash
docker build -f sokn/Dockerfile -t holg-sokn .
docker run --rm -p 3000:3000 -e COOKIE_SECRET="$(openssl rand -hex 32)" -e DB_PATH=/data/sokn.db -v sokn-data:/data holg-sokn
```

The container serves both the API and `sokn/app/` from one Fastify process. Mount `/data` for SQLite persistence.

## Privacy and roles

- Circle links use 192-bit URL-safe CSPRNG slugs.
- Visitor slugs are public join links. Admin slugs are hashed at rest and presented once.
- Admins rotate links, ban members and delete visits.
- Visitors create, edit and delete only their own visits.
- Pairing creates a long-lived, read-only tablet session.
- Every visit and member query is scoped to the current circle.
