import { Database } from "bun:sqlite";
import { config } from "../config";
import type { DdnsState, SystemSnapshot } from "@freemac/shared";

export interface AppSettingsRecord {
  passwordHash: string | null;
  initializedAt: string | null;
  publicHost: string;
  publicPort: number;
  relayOrigin: string;
}

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.query(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

export const db = new Database(config.sqlitePath, { create: true });

export function initDb(): void {
  db.exec(`
    create table if not exists sessions (
      id text primary key,
      created_at text not null,
      expires_at text not null
    );

    create table if not exists audit_logs (
      id text primary key,
      category text not null,
      action text not null,
      status text not null,
      payload text not null,
      created_at text not null
    );

    create table if not exists approvals (
      id text primary key,
      tool_id text not null,
      summary text not null,
      status text not null,
      input text not null,
      created_at text not null
    );

    create table if not exists telemetry_history (
      id text primary key,
      snapshot text not null,
      created_at text not null
    );

    create table if not exists ddns_state (
      id integer primary key check (id = 1),
      domain text not null,
      subdomain text not null,
      current_ipv6 text,
      observed_ipv6 text,
      last_updated_at text,
      status text not null,
      error_message text
    );

    create table if not exists app_settings (
      id integer primary key check (id = 1),
      password_hash text,
      initialized_at text,
      updated_at text not null
    );
  `);

  ensureColumn("app_settings", "public_host", "text not null default '::'");
  ensureColumn("app_settings", "public_port", "integer not null default 43200");
  ensureColumn("app_settings", "relay_origin", "text not null default ''");
}

export function loadAppSettings(): AppSettingsRecord | null {
  const row = db.query(`
    select password_hash, initialized_at, public_host, public_port, relay_origin
    from app_settings
    where id = 1
  `).get() as {
    password_hash: string | null;
    initialized_at: string | null;
    public_host: string | null;
    public_port: number | null;
    relay_origin: string | null;
  } | null;

  if (!row) {
    return null;
  }

  return {
    passwordHash: row.password_hash,
    initializedAt: row.initialized_at,
    publicHost: row.public_host || "::",
    publicPort: row.public_port || 43200,
    relayOrigin: row.relay_origin || "",
  };
}

export function saveAppSettings(settings: AppSettingsRecord): void {
  const updatedAt = new Date().toISOString();
  db.query(`
    insert into app_settings (id, password_hash, initialized_at, public_host, public_port, relay_origin, updated_at)
    values (1, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      password_hash = excluded.password_hash,
      initialized_at = excluded.initialized_at,
      public_host = excluded.public_host,
      public_port = excluded.public_port,
      relay_origin = excluded.relay_origin,
      updated_at = excluded.updated_at
  `).run(
    settings.passwordHash,
    settings.initializedAt,
    settings.publicHost,
    settings.publicPort,
    settings.relayOrigin,
    updatedAt,
  );
}

export function loadDdnsState(): DdnsState | null {
  const row = db.query(`
    select domain, subdomain, current_ipv6, observed_ipv6, last_updated_at, status, error_message
    from ddns_state
    where id = 1
  `).get() as {
    domain: string;
    subdomain: string;
    current_ipv6: string | null;
    observed_ipv6: string | null;
    last_updated_at: string | null;
    status: DdnsState["status"];
    error_message: string | null;
  } | null;

  if (!row) {
    return null;
  }

  return {
    domain: row.domain,
    subdomain: row.subdomain,
    currentIpv6: row.current_ipv6,
    observedIpv6: row.observed_ipv6,
    lastUpdatedAt: row.last_updated_at,
    status: row.status,
    errorMessage: row.error_message,
  };
}

export function saveDdnsState(state: DdnsState): void {
  db.query(`
    insert into ddns_state (id, domain, subdomain, current_ipv6, observed_ipv6, last_updated_at, status, error_message)
    values (1, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      domain = excluded.domain,
      subdomain = excluded.subdomain,
      current_ipv6 = excluded.current_ipv6,
      observed_ipv6 = excluded.observed_ipv6,
      last_updated_at = excluded.last_updated_at,
      status = excluded.status,
      error_message = excluded.error_message
  `).run(
    state.domain,
    state.subdomain,
    state.currentIpv6,
    state.observedIpv6,
    state.lastUpdatedAt,
    state.status,
    state.errorMessage,
  );
}

export function loadLatestTelemetrySnapshot(): SystemSnapshot | null {
  const row = db.query(`
    select snapshot
    from telemetry_history
    order by created_at desc
    limit 1
  `).get() as { snapshot: string } | null;

  if (!row) {
    return null;
  }

  return JSON.parse(row.snapshot) as SystemSnapshot;
}

export function saveTelemetrySnapshot(snapshot: SystemSnapshot): void {
  db.query("insert into telemetry_history (id, snapshot, created_at) values (hex(randomblob(16)), ?, ?)").run(
    JSON.stringify(snapshot),
    snapshot.collectedAt,
  );

  db.exec(`
    delete from telemetry_history
    where id not in (
      select id
      from telemetry_history
      order by created_at desc
      limit 288
    )
  `);
}
