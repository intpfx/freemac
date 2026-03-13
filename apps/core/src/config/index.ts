import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  webDistPath: string;
  dataDir: string;
  sqlitePath: string;
  sessionPassword: string;
  domain: string;
  subdomain: string;
  sseHeartbeatMs: number;
  ddnsIntervalMs: number;
  telemetryIntervalMs: number;
  aliyunAccessKeyId: string;
  aliyunAccessKeySecret: string;
  aliyunDnsEndpoint: string;
  ddnsObservationUrls: string[];
  relayOrigin: string;
  relayReportIntervalMs: number;
  relayReportToken: string;
}

function resolveDataDir(): string {
  const dir = process.env.FREEMAC_DATA_DIR || resolve(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const dataDir = resolveDataDir();

export const config: AppConfig = {
  host: process.env.FREEMAC_HOST || "127.0.0.1",
  port: Number(process.env.FREEMAC_PORT || 3200),
  webDistPath: process.env.FREEMAC_WEB_DIST || resolve(process.cwd(), "../web/dist"),
  dataDir,
  sqlitePath: join(dataDir, "freemac.sqlite"),
  sessionPassword: process.env.FREEMAC_PASSWORD || "changeme123",
  domain: process.env.FREEMAC_DOMAIN || "example.com",
  subdomain: process.env.FREEMAC_SUBDOMAIN || "mac",
  sseHeartbeatMs: Number(process.env.FREEMAC_SSE_HEARTBEAT_MS || 10000),
  ddnsIntervalMs: Number(process.env.FREEMAC_DDNS_INTERVAL_MS || 5 * 60 * 1000),
  telemetryIntervalMs: Number(process.env.FREEMAC_TELEMETRY_INTERVAL_MS || 5 * 1000),
  aliyunAccessKeyId: process.env.FREEMAC_ALIYUN_ACCESS_KEY_ID || "",
  aliyunAccessKeySecret: process.env.FREEMAC_ALIYUN_ACCESS_KEY_SECRET || "",
  aliyunDnsEndpoint: process.env.FREEMAC_ALIYUN_DNS_ENDPOINT || "https://alidns.aliyuncs.com/",
  ddnsObservationUrls: (process.env.FREEMAC_DDNS_OBSERVATION_URLS || "https://api64.ipify.org,https://ipv6.icanhazip.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  relayOrigin: process.env.FREEMAC_RELAY_ORIGIN || "",
  relayReportIntervalMs: Number(process.env.FREEMAC_RELAY_REPORT_INTERVAL_MS || 60 * 1000),
  relayReportToken: process.env.FREEMAC_RELAY_REPORT_TOKEN || "",
};

export function applyRuntimeConfig(input: Partial<Pick<AppConfig, "host" | "port" | "domain" | "subdomain" | "sessionPassword" | "aliyunAccessKeyId" | "aliyunAccessKeySecret" | "relayOrigin">>): void {
  if (input.host !== undefined) {
    config.host = input.host;
  }
  if (input.port !== undefined) {
    config.port = input.port;
  }
  if (input.domain !== undefined) {
    config.domain = input.domain;
  }
  if (input.subdomain !== undefined) {
    config.subdomain = input.subdomain;
  }
  if (input.sessionPassword !== undefined) {
    config.sessionPassword = input.sessionPassword;
  }
  if (input.aliyunAccessKeyId !== undefined) {
    config.aliyunAccessKeyId = input.aliyunAccessKeyId;
  }
  if (input.aliyunAccessKeySecret !== undefined) {
    config.aliyunAccessKeySecret = input.aliyunAccessKeySecret;
  }
  if (input.relayOrigin !== undefined) {
    config.relayOrigin = input.relayOrigin;
  }
}
