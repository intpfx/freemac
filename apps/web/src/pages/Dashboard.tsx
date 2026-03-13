import { useEffect, useState } from "react";
import { networkSettingsSchema, relaySettingsSchema, setupInitSchema } from "@freemac/shared";
import type { AgentToolPlan, DdnsState, RelayReportState, SetupStatus, SystemSnapshot } from "@freemac/shared";
import { SystemCards } from "../components/system/SystemCards";
import { TopProcesses } from "../components/system/TopProcesses";
import { AgentConsole } from "../components/agent/AgentConsole";

const SESSION_STORAGE_KEY = "freemac.sessionId";

interface OverviewResponse {
  setup: SetupStatus;
  ddns: DdnsState;
  relay: RelayReportState;
  snapshot: SystemSnapshot;
}

interface RelayStatusPresentation {
  connectionLabel: string;
  reportLabel: string;
  tone: "idle" | "success" | "error" | "running";
}

const DEFAULT_RELAY_STATE: RelayReportState = {
  configured: false,
  relayOrigin: "",
  status: "idle",
  lastReportedAt: null,
  errorMessage: null,
  lastTargetUrl: null,
};

function normalizeOverviewResponse(data: Partial<OverviewResponse>): OverviewResponse | null {
  if (!data.setup || !data.ddns || !data.snapshot) {
    return null;
  }

  return {
    setup: data.setup,
    ddns: data.ddns,
    snapshot: data.snapshot,
    relay: data.relay || DEFAULT_RELAY_STATE,
  };
}

function describeRelayState(relay: RelayReportState | null | undefined): RelayStatusPresentation {
  if (!relay || !relay.configured) {
    return {
      connectionLabel: "未连接",
      reportLabel: "未配置",
      tone: "idle",
    };
  }

  if (relay.status === "running") {
    return {
      connectionLabel: "已连接",
      reportLabel: "上报中",
      tone: "running",
    };
  }

  if (relay.errorMessage) {
    return {
      connectionLabel: "已连接",
      reportLabel: "上报失败",
      tone: "error",
    };
  }

  if (relay.lastReportedAt) {
    return {
      connectionLabel: "已连接",
      reportLabel: "上报成功",
      tone: "success",
    };
  }

  return {
    connectionLabel: "已连接",
    reportLabel: "等待首次上报",
    tone: "idle",
  };
}

interface SetupFormState {
  password: string;
  publicPort: string;
}

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function Dashboard() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [prompt, setPrompt] = useState("Show me the current system overview");
  const [plan, setPlan] = useState<AgentToolPlan | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [networkPort, setNetworkPort] = useState("43200");
  const [relayOrigin, setRelayOrigin] = useState("");
  const [networkMessage, setNetworkMessage] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [relayMessage, setRelayMessage] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [relayBusy, setRelayBusy] = useState(false);
  const [setupForm, setSetupForm] = useState<SetupFormState>({
    password: "",
    publicPort: "43200",
  });

  function createHeaders(includeAuth = false): HeadersInit {
    const headers: Record<string, string> = {};
    if (includeAuth && sessionId) {
      headers["x-session-id"] = sessionId;
    }
    return headers;
  }

  useEffect(() => {
    const storedSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSessionId) {
      setSessionId(storedSessionId);
      void fetch("/auth/status", {
        headers: {
          "x-session-id": storedSessionId,
        },
      })
        .then((response) => response.json())
        .then((data: { authenticated: boolean }) => {
          if (data.authenticated) {
            setAuthState("authenticated");
            return;
          }
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionId(null);
          setAuthState("unauthenticated");
        })
        .catch(() => {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionId(null);
          setAuthState("unauthenticated");
        });
    } else {
      setAuthState("unauthenticated");
    }

    void fetch("/system/overview")
      .then((response) => response.json())
      .then((raw: Partial<OverviewResponse>) => {
        const data = normalizeOverviewResponse(raw);
        if (!data) {
          return;
        }

        setOverview(data);
        setSetupForm((current) => ({
          ...current,
          publicPort: String(data.setup.publicPort || current.publicPort),
        }));
        setNetworkPort(String(data.setup.publicPort || 43200));
        setRelayOrigin(data.setup.relayOrigin || "");
      })
      .catch(() => undefined);

    const events = new EventSource("/events/stream");
    events.onmessage = (event) => {
      const raw = JSON.parse(event.data) as Partial<OverviewResponse>;
      const data = normalizeOverviewResponse(raw);
      if (!data) {
        return;
      }
      setOverview(data);
    };

    return () => events.close();
  }, []);

  async function planPrompt() {
    if (!sessionId) {
      setLoginError("Log in before using agent tools.");
      setAuthState("unauthenticated");
      return;
    }

    const response = await fetch("/agent/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createHeaders(true),
      },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();
    setPlan(data.plan as AgentToolPlan);
  }

  async function submitSetup() {
    setSetupError(null);
    const payload = {
      password: setupForm.password,
      publicPort: Number(setupForm.publicPort),
    };

    const parsed = setupInitSchema.safeParse(payload);
    if (!parsed.success) {
      setSetupError(parsed.error.issues[0]?.message || "Please complete the setup form.");
      return;
    }

    const response = await fetch("/setup/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
    });

    const raw = await response.text();
    let data: { ok?: boolean; message?: string } = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as { ok?: boolean; message?: string };
      } catch {
        data = {};
      }
    }
    if (!response.ok || !data.ok) {
      setSetupError(data.message || "Setup failed. Check the form values and try again.");
      return;
    }

    const refreshedRaw = await fetch("/system/overview").then((result) => result.json()) as Partial<OverviewResponse>;
    const refreshed = normalizeOverviewResponse(refreshedRaw);
    if (!refreshed) {
      setSetupError("Setup saved, but dashboard refresh returned incomplete data.");
      return;
    }
    setOverview(refreshed);
    setSetupForm((current) => ({
      ...current,
      password: "",
    }));
    setNetworkMessage(refreshed.setup.restartRequired ? "Setup saved. Restart freemac core or reload the launchd agent to apply the public port." : "Setup saved.");
  }

  function updateSetupField<K extends keyof SetupFormState>(key: K, value: SetupFormState[K]) {
    setSetupForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submitLogin() {
    setLoginBusy(true);
    setLoginError(null);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: loginPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok || !data.sessionId) {
        setLoginError(data.message || "Login failed");
        return;
      }

      window.localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setSessionId(data.sessionId as string);
      setAuthState("authenticated");
      setLoginPassword("");
    } catch {
      setLoginError("Login failed");
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    if (sessionId) {
      await fetch("/auth/logout", {
        method: "POST",
        headers: createHeaders(true),
      }).catch(() => undefined);
    }

    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setAuthState("unauthenticated");
    setPlan(null);
  }

  async function saveNetworkSettings() {
    setNetworkError(null);
    setNetworkMessage(null);

    const payload = {
      publicPort: Number(networkPort),
    };
    const parsed = networkSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      setNetworkError(parsed.error.issues[0]?.message || "Enter a valid high port.");
      return;
    }

    const response = await fetch("/setup/network", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createHeaders(true),
      },
      body: JSON.stringify(parsed.data),
    });

    const data = await response.json() as { ok?: boolean; message?: string; status?: SetupStatus };
    if (!response.ok || !data.ok || !data.status) {
      setNetworkError(data.message || "Failed to save network settings.");
      return;
    }

    const nextStatus = data.status;

    setOverview((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        setup: nextStatus,
      };
    });
    setSetupForm((current) => ({ ...current, publicPort: String(nextStatus.publicPort) }));
    setNetworkPort(String(nextStatus.publicPort));
    setNetworkMessage(data.message || "Saved.");
  }

  async function saveRelaySettings() {
    setRelayError(null);
    setRelayMessage(null);

    const payload = {
      relayOrigin: relayOrigin.trim(),
    };
    const parsed = relaySettingsSchema.safeParse(payload);
    if (!parsed.success) {
      setRelayError(parsed.error.issues[0]?.message || "Enter a valid Deno Deploy URL.");
      return;
    }

    const response = await fetch("/setup/relay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createHeaders(true),
      },
      body: JSON.stringify(parsed.data),
    });

    const raw = await response.text();
    let data: { ok?: boolean; message?: string; status?: SetupStatus; relay?: RelayReportState } = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as { ok?: boolean; message?: string; status?: SetupStatus; relay?: RelayReportState };
      } catch {
        data = {};
      }
    }
    if (!response.ok || !data.ok || !data.status || !data.relay) {
      setRelayError(data.message || "Failed to save relay settings.");
      return;
    }

    const nextStatus = data.status;
    const nextRelay = data.relay;

    setOverview((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        setup: nextStatus,
        relay: nextRelay,
      };
    });
    setRelayOrigin(nextStatus.relayOrigin);
    setRelayMessage(data.message || "Relay saved.");
  }

  async function reportRelayNow() {
    setRelayBusy(true);
    setRelayError(null);
    setRelayMessage(null);

    try {
      const response = await fetch("/system/report-relay", {
        method: "POST",
        headers: createHeaders(true),
      });
      const raw = await response.text();
      let data: { ok?: boolean; message?: string; relay?: RelayReportState } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { ok?: boolean; message?: string; relay?: RelayReportState };
        } catch {
          data = {};
        }
      }
      if (!response.ok || !data.ok || !data.relay) {
        setRelayError(data.message || "Relay report failed.");
        return;
      }

      const nextRelay = data.relay;
      setOverview((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          relay: nextRelay,
        };
      });
      setRelayMessage(nextRelay.errorMessage ? `Relay report finished with error: ${nextRelay.errorMessage}` : "Relay report sent.");
    } catch {
      setRelayError("Relay report failed.");
    } finally {
      setRelayBusy(false);
    }
  }

  const initialized = overview?.setup.initialized ?? false;
  const locked = !initialized || authState !== "authenticated";
  const showAuthDock = !initialized || authState !== "authenticated";
  const relayPresentation = describeRelayState(overview?.relay);

  return (
    <main className="shell shell-frame">
      <div className={locked ? "dashboard-surface is-locked" : "dashboard-surface"}>
        <header className="hero">
          <div>
            <p className="eyebrow">freemac</p>
            <h1>Mac Control Dashboard</h1>
            <p className="hero-copy">
              Bun-only MVP scaffold for DDNS, telemetry, approvals, and restricted agent control.
            </p>
          </div>
          <div className="status-card">
            <span>
              {!initialized
                ? "Setup required"
                : authState === "authenticated"
                  ? "Unlocked"
                  : authState === "checking"
                    ? "Checking session"
                    : "Locked"}
            </span>
            <strong>{overview?.ddns.status || "booting"}</strong>
            <small>{overview?.ddns.lastUpdatedAt || "No DDNS sync yet"}</small>
            {initialized && authState === "authenticated" && (
              <button className="ghost-button" onClick={logout}>Log out</button>
            )}
          </div>
        </header>

        <section className="grid two-up">
          <article className="panel">
            <div className="panel-header">
              <h2>Network Access</h2>
            </div>
            <p>Current IPv6: {overview?.ddns.currentIpv6 || "--"}</p>
            <p>Observed IPv6: {overview?.ddns.observedIpv6 || "--"}</p>
            <p>Public Port: {overview?.setup.publicPort || setupForm.publicPort || "--"}</p>
            <p>Current Listen: {overview ? `${overview.setup.currentListenHost}:${overview.setup.currentListenPort}` : "--"}</p>
            {overview?.ddns.currentIpv6 && overview?.setup.publicPort && (
              <p>Access URL: {`http://[${overview.ddns.currentIpv6}]:${overview.setup.publicPort}`}</p>
            )}
            <p>Relay Origin: {overview?.setup.relayOrigin || "--"}</p>
            <div className={`relay-status relay-status--${relayPresentation.tone}`}>
              <div>
                <span className="relay-status__label">Relay</span>
                <strong>{relayPresentation.connectionLabel}</strong>
              </div>
              <div>
                <span className="relay-status__label">状态</span>
                <strong>{relayPresentation.reportLabel}</strong>
              </div>
            </div>
          </article>
          <article className="panel">
            <div className="panel-header">
              <h2>{initialized ? "Next Steps" : "Bootstrap"}</h2>
            </div>
            <ol className="plain-list">
              {!initialized ? (
                <>
                  <li>Choose a high public TCP port such as 43200.</li>
                  <li>Set a local dashboard login password for freemac.</li>
                  <li>Allow inbound IPv6 traffic for that port on your router and Mac.</li>
                </>
              ) : (
                <>
                  <li>Keep the public port in sync with your router firewall rule.</li>
                  <li>Protect system and agent routes with session checks.</li>
                  <li>Complete approval flow for process kill and app actions.</li>
                  <li>Restart freemac after changing the public port if needed.</li>
                </>
              )}
            </ol>
          </article>
        </section>

        <SystemCards snapshot={overview?.snapshot || null} />

        <section className="grid two-up bottom-grid">
          <TopProcesses snapshot={overview?.snapshot || null} />
          <AgentConsole prompt={prompt} onPromptChange={setPrompt} onPlan={planPrompt} plan={plan} />
        </section>
        {initialized && authState === "authenticated" && (
          <section className="panel bottom-grid">
            <div className="panel-header">
              <h2>Direct Access And Relay</h2>
            </div>
            <div className="form-grid form-grid--compact">
              <label>
                <span>Public Port</span>
                <input value={networkPort} onChange={(event) => setNetworkPort(event.target.value)} />
              </label>
              <label className="form-grid__full">
                <span>Deno Deploy Origin</span>
                <input value={relayOrigin} onChange={(event) => setRelayOrigin(event.target.value)} placeholder="https://your-app.deno.dev" />
              </label>
            </div>
            {overview?.setup.restartRequired && <p className="helper-text">Saved port differs from the current listen port. Restart freemac core to apply it.</p>}
            {networkError && <p className="error-text">{networkError}</p>}
            {networkMessage && <p className="helper-text">{networkMessage}</p>}
            {relayError && <p className="error-text">{relayError}</p>}
            {relayMessage && <p className="helper-text">{relayMessage}</p>}
            {overview?.relay?.lastReportedAt && <p className="helper-text">Last relay report: {overview.relay.lastReportedAt}</p>}
            {overview?.relay?.lastTargetUrl && <p className="helper-text">Relay target: {overview.relay.lastTargetUrl}</p>}
            {overview?.relay?.errorMessage && <p className="error-text">Relay error: {overview.relay.errorMessage}</p>}
            <div className="button-row">
              <button className="button" onClick={saveNetworkSettings}>Save Port</button>
              <button className="button ghost-button-solid" onClick={saveRelaySettings}>Save Relay</button>
              <button className="button ghost-button-solid" onClick={reportRelayNow} disabled={relayBusy || !relayOrigin.trim()}>
                {relayBusy ? "Reporting..." : "Report Now"}
              </button>
            </div>
          </section>
        )}
      </div>

      <section className={showAuthDock ? `auth-dock auth-dock--visible${!initialized ? " auth-dock--setup" : ""}` : "auth-dock"}>
        <div className="auth-dock__inner">
          <div>
            <p className="eyebrow">{initialized ? "Access" : "Setup"}</p>
            <h2>
              {!initialized
                ? "Initialize freemac"
                : authState === "checking"
                  ? "Checking session"
                  : "Unlock dashboard"}
            </h2>
            <p className="auth-copy">
              {!initialized
                ? "Keep the dashboard in view while you choose a high public port, set a local freemac login password, and prepare direct IPv6 access."
                : "All UI stays on one page. Log in to enable agent actions and future protected controls."}
            </p>
          </div>

          {!initialized ? (
            <div className="auth-form auth-form--setup">
              <div className="form-grid form-grid--compact">
                <label>
                  <span>Local Dashboard Password</span>
                  <input type="password" value={setupForm.password} onChange={(event) => updateSetupField("password", event.target.value)} />
                </label>
                <label>
                  <span>Public Port</span>
                  <input value={setupForm.publicPort} onChange={(event) => updateSetupField("publicPort", event.target.value)} />
                </label>
              </div>
              {setupError && <p className="error-text">{setupError}</p>}
              <button className="button" onClick={submitSetup}>Initialize</button>
            </div>
          ) : authState !== "authenticated" ? (
            <div className="auth-form">
              <label>
                <span>Local Dashboard Password</span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void submitLogin();
                    }
                  }}
                />
              </label>
              {loginError && <p className="error-text">{loginError}</p>}
              <button className="button" onClick={submitLogin} disabled={loginBusy || authState === "checking"}>
                {loginBusy ? "Signing in..." : "Sign in"}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
