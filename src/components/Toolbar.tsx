interface ToolbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onValidate: () => void;
  onGenerate: () => void;
  onImportBpmn: () => void;
  onExportBpmn: () => void;
  onExportJson: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLoadExample: (key: string) => void;
  generating: boolean;
}

export function Toolbar({
  darkMode,
  onToggleDarkMode,
  onValidate,
  onGenerate,
  onImportBpmn,
  onExportBpmn,
  onExportJson,
  onFit,
  onZoomIn,
  onZoomOut,
  onLoadExample,
  generating,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <div className="brand-mark">BPMN</div>
        <div>
          <h1>BPMN Code Generator</h1>
          <p>JSON → bpmn-js → BPMN 2.0</p>
        </div>
      </div>

      <div className="toolbar-actions">
        <label className="example-select">
          <span>Ejemplo</span>
          <select
            defaultValue="dpf"
            onChange={(e) => onLoadExample(e.target.value)}
          >
            <option value="simple">Simple</option>
            <option value="gateway">Gateway</option>
            <option value="dpf">DPF 4 lanes</option>
          </select>
        </label>

        <button type="button" onClick={onValidate}>
          Validate
        </button>
        <button
          type="button"
          className="primary"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Generate BPMN'}
        </button>
        <button type="button" onClick={onImportBpmn}>
          Import BPMN
        </button>
        <button type="button" onClick={onExportBpmn}>
          Export BPMN
        </button>
        <button type="button" onClick={onExportJson}>
          Export JSON
        </button>

        <div className="toolbar-divider" />

        <button type="button" onClick={onZoomOut} title="Zoom out">
          −
        </button>
        <button type="button" onClick={onFit} title="Fit viewport">
          Fit
        </button>
        <button type="button" onClick={onZoomIn} title="Zoom in">
          +
        </button>
        <button type="button" onClick={onToggleDarkMode}>
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  );
}
