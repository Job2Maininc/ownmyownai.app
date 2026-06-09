# OwnMyOwnAI — Architecture V1

## Overview

Three layers: **control plane** (Supabase), **data plane** (Cloudflare WS relay), **inference** (Windows Runner + Ollama).

## Packages

| Path | Role |
|------|------|
| `packages/protocol` | Shared WS message types (Zod) |
| `apps/relay` | Cloudflare Worker + Durable Object per `host_id` |
| `apps/web` | Next.js on Vercel — auth, dashboard, chat |
| `apps/runner` | Tauri Windows — Ollama, pairing, WS to relay |
| `supabase/` | Migrations + Edge Functions |

## WS Protocol

Connect: `wss://relay/v1/connect?token=<relay_jwt>`

JWT claims: `{ sub, host_id, role: "web" | "runner", exp }`

Messages: envelope `{ type, payload, requestId? }` — see `@ownmyownai/protocol`.

## Assistant output formats

Structured deliverables are embedded in assistant markdown (no extra WS types):

- **Artefacts** — `` ```artifact `` fences → side panel (copy / download `.md`). See `docs/ARTIFACTS.md`.
- **Patches** — `` ```diff `` / `` ```patch `` → preview / apply via Host.

The Host injects format instructions from `assistant_output.rs` on every chat request.

## Rules for agents

- Never call Ollama from web; only runner proxies inference.
- Never expose `device_secret` or `service_role` to the browser.
- Chat text is never stored in Supabase.
- Mint relay tokens only via Edge Functions.

## Pairing flow

1. Web: `create-pairing-code` → display code
2. Runner: user enters code → `complete-pairing` → receives `device_secret` (stored in OS keyring)
3. Runner: `runner-mint-relay-token` → WSS to relay
4. Web: `mint-relay-token` → WSS to relay → `chat.start`
