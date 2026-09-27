# Technical spec

Vite + React SPA (TypeScript) with a PWA shell, Amplify Gen 2 Lambdas, and Supabase. Auth is Supabase only; the Amplify stack does not define Cognito.

## Folder structure

```
.
├── src/                    # Vite entry (`main.tsx`, `App.tsx`, global CSS)
├── components/             # Feature UI and shadcn/ui primitives
│   ├── auth/
│   ├── metrics/
│   ├── settings/
│   └── ui/
├── hooks/                  # React hooks (auth, settings, media, sync-related)
├── lib/                    # Domain, clients, routing helpers
│   ├── ai-chat/
│   ├── amplify/            # Browser clients for Lambda Function URLs
│   ├── auth/
│   ├── cerebras/           # Cerebras HTTP client (server/script usage)
│   ├── program-json/
│   ├── supabase/           # Typed sync, backups, generated DB types
│   └── sync/               # Optional API Gateway client + merge
├── utils/                  # Shared Supabase JS client
├── amplify/                # Amplify Gen 2 backend (functions only)
│   ├── backend.ts
│   └── functions/
│       ├── _shared/        # Auth verification, HTTP, rate limit, secrets
│       ├── ai-chat/
│       ├── ai-extract-json/
│       ├── ai-scope-judge/
│       ├── report-issue/
│       └── test/
├── supabase/
│   ├── schema.sql          # Full schema (RLS)
│   └── migrations/         # Incremental SQL
├── public/                 # Static assets, `manifest.json`, `sw.js`, icons
├── scripts/                # Deploy (SSH/nginx) and local Cerebras test
├── styles/
├── amplify_outputs.json    # Generated Function URL map (consumed by the SPA)
├── vite.config.ts          # `@` → repo root
├── components.json         # shadcn config
└── package.json
```

Path alias: `@/*` → repository root (`tsconfig.json`, `vite.config.ts`).

## Technology

| Layer | Stack |
|---|---|
| Runtime | React 19, React Router 7, TypeScript 5 |
| Build | Vite 6 (`@vitejs/plugin-react`), ES modules |
| Styling | Tailwind CSS 4, PostCSS, `class-variance-authority`, `tailwind-merge` |
| UI | Radix UI primitives, shadcn (New York / lucide), `next-themes`, Sonner |
| Forms / schema | react-hook-form, Zod |
| Markdown | `react-markdown`, `remark-gfm` |
| Charts | Recharts |
| PWA | `public/manifest.json` (standalone), `public/sw.js` (push + MessageChannel ping) |
| Analytics | `@vercel/analytics` (production only) |
| Backend (AWS) | Amplify Gen 2 (`@aws-amplify/backend`), AWS CDK, Node Lambdas (`aws-lambda` types) |
| Data / auth | Supabase JS (`@supabase/supabase-js`), Postgres + RLS |
| Inference | Cerebras Chat Completions HTTP API (`https://api.cerebras.ai/v1`) |
| Deploy (SPA) | `scripts/deploy.sh` — `tsc && vite build`, zip `dist/`, SSH + nginx |

Local/dev scripts: `vite`, `amplify:sandbox` (`npx ampx sandbox`), Amplify secret setters, `test:cerebras` (`tsx`).

## Integration

### Browser → Supabase

- Client: `utils/supabase.ts` (`createClient`, session persist key `cinderblock_supabase_auth`).
- Env: `VITE_SUPABASE_URL_TATER` (project origin only), `VITE_SUPABASE_PUBLISHABLE_KEY_TATER`.
- Tables (see `supabase/schema.sql` + migrations): `user_settings`, `user_active_plan`, `user_backups`, `user_training_logs`, `ai_chat_reports`, `user_program_versions`.
- RLS: row access keyed to `auth.users`. Lambdas use the publishable key plus the caller's JWT, so the same policies apply.

### Browser → Amplify Function URLs

- URLs from `amplify_outputs.json` (`custom.*Url`), called via `lib/amplify/ai-functions.ts`.
- Auth: `Authorization: Bearer <supabase access_token>`; Lambdas call `auth.getUser` (`amplify/functions/_shared/verifySupabaseAuth.ts`).
- CORS on Function URLs only (`POST`, origins `*`). Function URL auth type is `NONE` (app-level JWT).
- Functions:

| Function | Notes |
|---|---|
| `ai-chat` | Streaming (`InvokeMode.RESPONSE_STREAM`), Cerebras |
| `ai-extract-json` | Cerebras |
| `ai-scope-judge` | Cerebras |
| `report-issue` | Inserts as the authenticated user |
| `amplify-test` | Smoke / server-side Supabase |

Secrets (Amplify SSM, not Vite): `TMDB_ACCESS_TOKEN`, `SUPABASE_SECRET_KEY` (writes `tmdb_cache` only), `CEREBRAS_API_KEY`. `VITE_SUPABASE_URL_TATER` and `VITE_SUPABASE_PUBLISHABLE_KEY_TATER` are baked at synthesize time. Optional `CEREBRAS_MODEL`.

### Lambdas → Cerebras

- `lib/cerebras/client.ts` against `/v1` chat completions; key only on the server / scripts.

### Optional API Gateway sync

- `VITE_API_URL` + `lib/sync/api-client.ts` (Bearer token). Independent of Amplify Function URLs.

### SPA hosting

- Static `dist/` behind nginx (`scripts/deploy.sh`). Production analytics via Vercel Analytics in the client bundle.
