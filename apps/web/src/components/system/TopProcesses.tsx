import type { SystemSnapshot } from "@freemac/shared";

interface Props {
  snapshot: SystemSnapshot | null;
}

export function TopProcesses({ snapshot }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Top Processes</h2>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>PID</th>
            <th>Command</th>
            <th>CPU</th>
            <th>Memory</th>
          </tr>
        </thead>
        <tbody>
          {(snapshot?.topProcesses || []).map((proc) => (
            <tr key={proc.pid}>
              <td>{proc.pid}</td>
              <td>{proc.command}</td>
              <td>{proc.cpu.toFixed(1)}%</td>
              <td>{proc.memory.toFixed(1)}%</td>
            </tr>
          ))}
          {!snapshot?.topProcesses.length && (
            <tr>
              <td colSpan={4}>No process data yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
