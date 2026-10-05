# Convox Backend

NestJS API for Convox customer messaging, assignments, and Messenger integration.

## Requirements

- Node.js 22+
- pnpm 11+
- Docker Compose (PostgreSQL and Redis)

## Local development

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm start:dev
```

The API listens on `http://localhost:4000`. Swagger is at `/api/docs` and readiness is at `/api/health/ready`.

Set unique development values for `JWT_ACCESS_SECRET` and `REFRESH_TOKEN_PEPPER` before starting. Do not use the sample values in production. `DATABASE_URL` is used by Prisma CLI commands; the application also supports the individual `DB_*` settings when `DATABASE_URL` is not set.

## Database workflow

```bash
pnpm db:generate
pnpm db:migrate       # create/apply a local development migration
pnpm db:deploy        # apply committed migrations in deployed environments
pnpm db:seed          # requires seed credentials in .env
```

The initial migration includes the partial unique index that prevents more than one active conversation for a Page/contact pair.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm exec jest --runInBand
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/convox_db?schema=public pnpm test:integration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/convox_db?schema=public pnpm test:e2e
pnpm build
```

Integration and E2E checks require the local PostgreSQL and Redis services. If their default host ports are occupied, launch Compose with alternate ports and set matching `DATABASE_URL` and `REDIS_URL` values for the test commands. E2E uses fake Meta credentials and mocks the Graph API request.

## API surface

The versioned REST API is under `/api/v1`:

- Auth: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`
- Users/agents: `/users/admins`, `/agents`
- Pages/membership: `/pages`, `/pages/:pageId/agents`
- Conversations/messages/assignment: `/conversations`
- Analytics: `/analytics/overview`, `/analytics/agents`
- Meta callback: `/webhooks/meta`

Socket.IO clients connect to `/realtime` with an access token in the handshake `auth.token`. Room access is server-authorized against the current user and assignment.

## Temporary development Facebook Page

`META_PAGE_ID` and `META_PAGE_ACCESS_TOKEN` are temporary development configuration for a single Page. They must be retired when database-backed Page management is implemented. Meta credentials are read only through the infrastructure credential provider and must not be logged or returned by API endpoints.

Configure `META_APP_ID`, `META_APP_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN` for webhook ingestion. The public webhook callback is `/api/v1/webhooks/meta`; configure Meta to send webhook requests there after making the service reachable.
