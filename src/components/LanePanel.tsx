import type { ProcessDefinition } from '../types/process';

interface LanePanelProps {
  process: ProcessDefinition | null;
}

export function LanePanel({ process }: LanePanelProps) {
  if (!process) {
    return (
      <aside className="lane-panel">
        <div className="panel-header">Lanes</div>
        <p className="muted">Sin proceso cargado.</p>
      </aside>
    );
  }

  const counts = new Map<string, number>();
  process.elements.forEach((el) => {
    counts.set(el.lane, (counts.get(el.lane) ?? 0) + 1);
  });

  return (
    <aside className="lane-panel">
      <div className="panel-header">Lanes</div>
      <div className="lane-list">
        {process.lanes.map((lane, index) => (
          <div key={lane.id} className="lane-item">
            <div className="lane-index">{index + 1}</div>
            <div className="lane-meta">
              <strong>{lane.name}</strong>
              <span>{lane.id}</span>
              <span className="muted">{counts.get(lane.id) ?? 0} elementos</span>
            </div>
          </div>
        ))}
      </div>
      <div className="lane-stats">
        <div>
          <span className="muted">Elementos</span>
          <strong>{process.elements.length}</strong>
        </div>
        <div>
          <span className="muted">Flujos</span>
          <strong>{process.flows.length}</strong>
        </div>
      </div>
    </aside>
  );
}
