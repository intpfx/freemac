import { Elysia, t } from "elysia";
import { initializeSetup, getSetupStatus, updateNetworkSettings, updateRelaySettings } from "../services/settings.service";
import { runDdnsSync } from "../services/ddns.service";
import { hasSession } from "../services/auth.service";
import { reportRelayTarget } from "../services/relay-report.service";

export const setupRoutes = new Elysia({ prefix: "/setup" })
  .get("/status", async () => ({ ok: true, status: await getSetupStatus() }))
  .post(
    "/init",
    async ({ body }) => {
      const status = await initializeSetup(body);
      await runDdnsSync();
      return {
        ok: true,
        status,
      };
    },
    {
      body: t.Object({
        password: t.String({ minLength: 8, maxLength: 200 }),
        publicPort: t.Number({ minimum: 1025, maximum: 65535 }),
      }),
    },
  )
  .post(
    "/network",
    async ({ body, headers, set }) => {
      if (!hasSession(headers["x-session-id"])) {
        set.status = 401;
        return { ok: false, message: "Unauthorized" };
      }

      return {
        ok: true,
        status: await updateNetworkSettings(body),
        message: "Port saved. Restart freemac core to apply the new listen port if launchd does not restart it automatically.",
      };
    },
    {
      body: t.Object({
        publicPort: t.Number({ minimum: 1025, maximum: 65535 }),
      }),
    },
  )
  .post(
    "/relay",
    async ({ body, headers, set }) => {
      if (!hasSession(headers["x-session-id"])) {
        set.status = 401;
        return { ok: false, message: "Unauthorized" };
      }

      const status = await updateRelaySettings(body);
      const relay = await reportRelayTarget();
      return {
        ok: true,
        status,
        relay,
        message: "Relay origin saved. Automatic reporting is active.",
      };
    },
    {
      body: t.Object({
        relayOrigin: t.String({ minLength: 0, maxLength: 500 }),
      }),
    },
  );