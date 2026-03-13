import { existsSync } from "node:fs";
import { join } from "node:path";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { config } from "./config";
import { authRoutes } from "./routes/auth";
import { systemRoutes } from "./routes/system";
import { agentRoutes } from "./routes/agent";
import { eventsRoutes } from "./routes/events";
import { setupRoutes } from "./routes/setup";

function serveIndexHtml() {
  const filePath = join(config.webDistPath, "index.html");
  if (!existsSync(filePath)) {
    return new Response("Dashboard build not found", { status: 503 });
  }
  return new Response(Bun.file(filePath), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export function createApp() {
  return new Elysia()
    .use(cors({ origin: true, credentials: true }))
    .use(staticPlugin({ assets: join(config.webDistPath, "assets"), prefix: "/assets" }))
    .use(setupRoutes)
    .use(authRoutes)
    .use(systemRoutes)
    .use(agentRoutes)
    .use(eventsRoutes)
    .get("/api/health", () => ({ ok: true }))
    .get("/", () => serveIndexHtml())
    .get("/*", ({ path }) => {
      if (
        path.startsWith("/api") ||
        path.startsWith("/auth") ||
        path.startsWith("/setup") ||
        path.startsWith("/system") ||
        path.startsWith("/agent") ||
        path.startsWith("/events")
      ) {
        return new Response("NOT_FOUND", { status: 404 });
      }

      return serveIndexHtml();
    });
}
