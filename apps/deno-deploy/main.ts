type TargetProtocol = "http" | "https";

interface StoredTarget {
  ipv6: string;
  port: number;
  protocol: TargetProtocol;
  updatedAt: string;
  source?: string;
}

const kv = await Deno.openKv();
const TARGET_KEY = ["freemac", "latest-target"] as const;
const HISTORY_KEY = ["freemac", "history"] as const;
const UPDATE_TOKEN = Deno.env.get("FREEMAC_UPDATE_TOKEN") || "";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidIpv6(ipv6: string): boolean {
  return ipv6.includes(":") && !/[\s\[\]\/]/.test(ipv6);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function buildAccessUrl(target: StoredTarget): string {
  return `${target.protocol}://[${target.ipv6}]:${target.port}`;
}

async function loadTarget(): Promise<StoredTarget | null> {
  const result = await kv.get<StoredTarget>(TARGET_KEY);
  return result.value;
}

async function saveTarget(target: StoredTarget): Promise<void> {
  const historyKey = [...HISTORY_KEY, target.updatedAt] as const;
  await kv.atomic()
    .set(TARGET_KEY, target)
    .set(historyKey, target, { expireIn: 1000 * 60 * 60 * 24 * 30 })
    .commit();
}

function authorized(request: Request): boolean {
  if (!UPDATE_TOKEN) {
    return true;
  }
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${UPDATE_TOKEN}`;
}

function renderPage(target: StoredTarget | null, requestUrl: URL): string {
  const accessUrl = target ? buildAccessUrl(target) : "";
  const mixedContentRisk = Boolean(target && requestUrl.protocol === "https:" && target.protocol === "http");
  const title = target ? `freemac relay -> ${target.ipv6}:${target.port}` : "freemac relay";
  const source = target?.source ? `<p class=\"meta\">source: ${escapeHtml(target.source)}</p>` : "";
  const warning = mixedContentRisk
    ? `<div class=\"warning\">This page is served over HTTPS, but the target uses HTTP. Most browsers will block the iframe as mixed content. Use the direct-open link below, or expose the target over HTTPS.</div>`
    : "";
  const body = target
    ? `
      <section class="card">
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">updated: ${escapeHtml(target.updatedAt)}</p>
        ${source}
        <p class="url"><a href="${escapeHtml(accessUrl)}" target="_blank" rel="noreferrer">${escapeHtml(accessUrl)}</a></p>
        ${warning}
      </section>
      <section class="frame-card">
        <iframe src="${escapeHtml(accessUrl)}" title="freemac target" referrerpolicy="no-referrer"></iframe>
      </section>
    `
    : `
      <section class="card empty-card">
        <div class="empty-mark" aria-hidden="true">
          <div class="empty-mark__orb"></div>
          <div class="empty-mark__ring"></div>
        </div>
        <h1>freemac relay is waiting for a target</h1>
        <p class="meta">No Mac has reported an IPv6 endpoint yet.</p>
        <p class="meta">Once freemac posts to <code>/api/report</code>, this page will automatically show the latest direct-access target.</p>
        <div class="empty-code">
          <span>POST</span>
          <code>/api/report</code>
        </div>
      </section>
    `;

  return `<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #eef6ff, #f8fafc 40%, #eef2ff 100%);
        color: #0f172a;
      }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px; }
      main { max-width: 1200px; margin: 0 auto; display: grid; gap: 20px; }
      .card, .frame-card {
        background: rgba(255,255,255,0.88);
        border: 1px solid rgba(148,163,184,0.22);
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(15,23,42,0.08);
        backdrop-filter: blur(16px);
      }
      .card { padding: 24px; }
      .empty-card {
        display: grid;
        justify-items: center;
        text-align: center;
        padding: 56px 24px;
      }
      .frame-card { padding: 12px; min-height: 70vh; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      .meta { margin: 6px 0; color: #475569; }
      .url { margin: 16px 0 0; font-size: 16px; }
      .empty-mark {
        position: relative;
        width: 128px;
        height: 128px;
        margin-bottom: 24px;
      }
      .empty-mark__orb {
        position: absolute;
        inset: 24px;
        border-radius: 999px;
        background: radial-gradient(circle at 30% 30%, #93c5fd, #2563eb);
        box-shadow: 0 12px 30px rgba(37, 99, 235, 0.24);
      }
      .empty-mark__ring {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        border: 2px dashed rgba(37, 99, 235, 0.3);
      }
      .empty-code {
        margin-top: 24px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 999px;
        background: rgba(37, 99, 235, 0.08);
        color: #1d4ed8;
      }
      .warning {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 16px;
        background: #fff7ed;
        color: #9a3412;
      }
      iframe {
        width: 100%;
        min-height: calc(70vh - 24px);
        border: 0;
        border-radius: 16px;
        background: #fff;
      }
      code { font-family: ui-monospace, SFMono-Regular, monospace; }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    const target = await loadTarget();
    return new Response(renderPage(target, url), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    const target = await loadTarget();
    return json({ ok: true, target, accessUrl: target ? buildAccessUrl(target) : null });
  }

  if (request.method === "POST" && url.pathname === "/api/report") {
    if (!authorized(request)) {
      return json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => null) as Partial<StoredTarget> | null;
    if (!payload || typeof payload.ipv6 !== "string" || typeof payload.port !== "number") {
      return json({ ok: false, message: "Invalid payload" }, { status: 400 });
    }

    const protocol: TargetProtocol = payload.protocol === "https" ? "https" : "http";
    const ipv6 = payload.ipv6.trim().toLowerCase();
    const port = payload.port;

    if (!isValidIpv6(ipv6)) {
      return json({ ok: false, message: "Invalid IPv6 address" }, { status: 400 });
    }

    if (!isValidPort(port)) {
      return json({ ok: false, message: "Invalid port" }, { status: 400 });
    }

    const target: StoredTarget = {
      ipv6,
      port,
      protocol,
      updatedAt: new Date().toISOString(),
      source: typeof payload.source === "string" ? payload.source.trim().slice(0, 120) : undefined,
    };

    await saveTarget(target);
    return json({ ok: true, target, accessUrl: buildAccessUrl(target) });
  }

  return json({ ok: false, message: "Not found" }, { status: 404 });
});
