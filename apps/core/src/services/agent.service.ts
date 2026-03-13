import type { AgentToolPlan } from "@freemac/shared";

export function planAgentPrompt(prompt: string): AgentToolPlan {
  if (/kill|terminate/i.test(prompt)) {
    return {
      toolId: "process.kill",
      requiresApproval: true,
      reason: "The request implies a state-changing process action.",
      input: { pid: 0 },
    };
  }

  return {
    toolId: "system.getOverview",
    requiresApproval: false,
    reason: "Defaulting to a read-only overview tool in the scaffold.",
    input: {},
  };
}
