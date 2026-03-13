import { networkInterfaces } from "node:os";
import { createHmac } from "node:crypto";
import type { DdnsState } from "@freemac/shared";
import { config } from "../config";
import { loadDdnsState, saveDdnsState } from "../db/client";
import { logger } from "../lib/logger";

const state: DdnsState = {
  domain: config.domain,
  subdomain: config.subdomain,
  currentIpv6: null,
  observedIpv6: null,
  lastUpdatedAt: null,
  status: "idle",
  errorMessage: null,
};
let hydrated = false;

function hydrateState(): void {
  if (hydrated) {
    return;
  }

  const saved = loadDdnsState();
  if (saved) {
    Object.assign(state, saved);
  }
  hydrated = true;
}

function syncConfigFields(): void {
  state.domain = config.domain;
  state.subdomain = config.subdomain;
}

function isGlobalIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return !(
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

function normalizeIpv6(address: string): string {
  return address.trim().split("%")[0]!.toLowerCase();
}

function encodeAliyun(value: string): string {
  return encodeURIComponent(value)
    .replace(/\!/g, "%21")
    .replace(/\'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function getLocalIpv6Candidates(): string[] {
  const interfaces = networkInterfaces();
  const candidates = new Set<string>();

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries || name.toLowerCase().includes("lo")) {
      continue;
    }

    for (const entry of entries) {
      if (entry.internal || entry.family !== "IPv6") {
        continue;
      }

      const normalized = normalizeIpv6(entry.address);
      if (isGlobalIpv6(normalized)) {
        candidates.add(normalized);
      }
    }
  }

  return [...candidates];
}

async function observePublicIpv6(): Promise<string | null> {
  for (const url of config.ddnsObservationUrls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) {
        continue;
      }

      const text = normalizeIpv6(await response.text());
      if (text.includes(":")) {
        return text;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function buildAliyunSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQueryString = sortedKeys
    .map((key) => `${encodeAliyun(key)}=${encodeAliyun(params[key]!)}`)
    .join("&");
  const stringToSign = `GET&${encodeAliyun("/")}&${encodeAliyun(canonicalizedQueryString)}`;
  const hmac = createHmac("sha1", `${config.aliyunAccessKeySecret}&`);
  hmac.update(stringToSign);
  return hmac.digest("base64");
}

async function callAliyunDnsApi(action: string, params: Record<string, string>): Promise<any> {
  const baseParams: Record<string, string> = {
    AccessKeyId: config.aliyunAccessKeyId,
    Action: action,
    Format: "JSON",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2015-01-09",
    ...params,
  };

  const signature = buildAliyunSignature(baseParams);
  const query = [...Object.entries({ ...baseParams, Signature: signature })]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeAliyun(key)}=${encodeAliyun(value)}`)
    .join("&");

  const response = await fetch(`${config.aliyunDnsEndpoint}?${query}`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (data.Code) {
    throw new Error(`Aliyun DNS API error: ${data.Code} ${data.Message}`);
  }
  return data;
}

function resolveAliyunDomainParts(): { domainName: string; rr: string } {
  return {
    domainName: config.domain,
    rr: config.subdomain || "@",
  };
}

async function findExistingAaaaRecord(): Promise<{ recordId: string; value: string } | null> {
  const { domainName, rr } = resolveAliyunDomainParts();
  const subDomain = rr === "@" ? domainName : `${rr}.${domainName}`;
  const result = await callAliyunDnsApi("DescribeSubDomainRecords", {
    SubDomain: subDomain,
    Type: "AAAA",
  });
  const records = result.DomainRecords?.Record || [];
  const matched = records.find((record: any) => record.RR === rr && record.Type === "AAAA");
  if (!matched) {
    return null;
  }

  return {
    recordId: matched.RecordId,
    value: matched.Value,
  };
}

async function ensureAliyunAaaaRecord(ipv6: string): Promise<void> {
  const { domainName, rr } = resolveAliyunDomainParts();
  const existing = await findExistingAaaaRecord();

  if (!existing) {
    await callAliyunDnsApi("AddDomainRecord", {
      DomainName: domainName,
      RR: rr,
      Type: "AAAA",
      Value: ipv6,
      TTL: "600",
    });
    return;
  }

  if (existing.value === ipv6) {
    return;
  }

  await callAliyunDnsApi("UpdateDomainRecord", {
    RecordId: existing.recordId,
    RR: rr,
    Type: "AAAA",
    Value: ipv6,
    TTL: "600",
  });
}

function persistState(): void {
  saveDdnsState(state);
}

export function getDdnsState(): DdnsState {
  hydrateState();
  syncConfigFields();
  return state;
}

export async function runDdnsSync(): Promise<DdnsState> {
  hydrateState();
  syncConfigFields();
  state.status = "running";
  state.errorMessage = null;
  persistState();

  try {
    const localCandidates = getLocalIpv6Candidates();
    const observedIpv6 = await observePublicIpv6();
    const chosenIpv6 = observedIpv6 && localCandidates.includes(observedIpv6)
      ? observedIpv6
      : localCandidates[0] || observedIpv6;

    state.observedIpv6 = observedIpv6;

    if (!chosenIpv6) {
      throw new Error("No global IPv6 address detected");
    }

    state.currentIpv6 = chosenIpv6;
    state.lastUpdatedAt = new Date().toISOString();

    if (!config.aliyunAccessKeyId || !config.aliyunAccessKeySecret || !config.domain) {
      state.status = "idle";
      state.errorMessage = null;
      persistState();
      return state;
    }

    await ensureAliyunAaaaRecord(chosenIpv6);
    state.status = "idle";
    state.errorMessage = observedIpv6 && observedIpv6 !== chosenIpv6
      ? `Observed IPv6 differs from selected local IPv6: ${observedIpv6}`
      : null;
    persistState();
    logger.info("ddns", "DDNS sync completed", { ipv6: chosenIpv6, observedIpv6 });
    return state;
  } catch (error) {
    state.status = "error";
    state.errorMessage = error instanceof Error ? error.message : String(error);
    persistState();
    logger.error("ddns", "DDNS sync failed", { error: state.errorMessage });
    return state;
  }
}
