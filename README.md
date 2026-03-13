# freemac

A Bun-first MVP scaffold for a Mac dashboard with IPv6 DDNS, telemetry, and a
restricted natural-language agent.

## Workspace

- `apps/core`: Bun + Elysia local service
- `apps/web`: React + Vite dashboard
- `apps/deno-deploy`: Deno Deploy relay that stores the latest IPv6 endpoint in
  Deno KV and renders it in a web page
- `packages/shared`: shared types and schemas
- `deploy`: launchd and Caddy examples
- `docs`: setup and MVP notes

## Scripts

- `bun run dev`
- `bun run build`
- `bun run check`

## MVP scope

- Alibaba Cloud AAAA DDNS updater
- Local telemetry collection for macOS
- Browser dashboard with SSE updates
- Restricted tool registry with approval flow
- Single-user auth and audit logs

## Deployment

- Direct public IPv6 with a high port:
  [docs/deploy-direct-ipv6-high-port.md](/Users/siaovon/Documents/Projects/freemac/docs/deploy-direct-ipv6-high-port.md)
