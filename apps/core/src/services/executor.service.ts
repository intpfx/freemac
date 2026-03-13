import { db } from "../db/client";
import { nanoid } from "nanoid";

export interface ExecutionResult {
  ok: boolean;
  summary: string;
}

export async function executeTool(toolId: string, input: Record<string, unknown>): Promise<ExecutionResult> {
  db.query("insert into audit_logs (id, category, action, status, payload, created_at) values (?, ?, ?, ?, ?, ?)").run(
    nanoid(),
    "tool",
    toolId,
    "accepted",
    JSON.stringify(input),
    new Date().toISOString(),
  );

  return {
    ok: true,
    summary: `Tool ${toolId} accepted by executor scaffold.`,
  };
}
