import type { SystemSnapshot } from "@freemac/shared";

interface Props {
  snapshot: SystemSnapshot | null;
}

export function SystemCards({ snapshot }: Props) {
  return (
    <section className="grid">
      <article className="card">
        <h3>CPU</h3>
        <strong>{snapshot ? `${snapshot.cpuUsagePercent.toFixed(1)}%` : "--"}</strong>
      </article>
      <article className="card">
        <h3>Memory</h3>
        <strong>
          {snapshot ? `${snapshot.memoryUsedMb} / ${snapshot.memoryTotalMb} MB` : "--"}
        </strong>
      </article>
      <article className="card">
        <h3>Disk</h3>
        <strong>{snapshot ? `${snapshot.diskUsedGb} / ${snapshot.diskTotalGb} GB` : "--"}</strong>
      </article>
      <article className="card">
        <h3>Network</h3>
        <strong>{snapshot ? `RX ${snapshot.networkRxMb} / TX ${snapshot.networkTxMb} MB` : "--"}</strong>
      </article>
    </section>
  );
}
