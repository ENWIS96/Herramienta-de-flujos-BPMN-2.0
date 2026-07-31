import type { ValidationIssue } from '../types/process';

interface ExportPanelProps {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  status: string | null;
}

export function ExportPanel({ errors, warnings, status }: ExportPanelProps) {
  return (
    <div className="export-panel">
      <div className="panel-header">Validación</div>
      {status && <div className="status-message">{status}</div>}
      {errors.length === 0 && warnings.length === 0 && (
        <p className="muted" style={{ padding: '0.75rem 0.9rem' }}>
          Sin errores ni advertencias.
        </p>
      )}
      <ul className="issues-list">
        {errors.map((issue, index) => (
          <li key={`e-${index}`} className="issue error">
            <pre>{issue.message}</pre>
            {issue.path && <span className="issue-path">{issue.path}</span>}
          </li>
        ))}
        {warnings.map((issue, index) => (
          <li key={`w-${index}`} className="issue warning">
            <pre>{issue.message}</pre>
            {issue.path && <span className="issue-path">{issue.path}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
