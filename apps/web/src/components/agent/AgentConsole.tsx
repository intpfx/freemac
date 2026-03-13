import type { AgentToolPlan } from "@freemac/shared";

interface Props {
  prompt: string;
  onPromptChange: (value: string) => void;
  onPlan: () => void;
  plan: AgentToolPlan | null;
}

export function AgentConsole({ prompt, onPromptChange, onPlan, plan }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Agent Console</h2>
      </div>
      <textarea
        className="prompt-box"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="Ask freemac to inspect the system or prepare a safe action."
      />
      <button className="button" onClick={onPlan}>
        Plan Request
      </button>
      <pre className="plan-output">{plan ? JSON.stringify(plan, null, 2) : "No plan yet"}</pre>
    </section>
  );
}
