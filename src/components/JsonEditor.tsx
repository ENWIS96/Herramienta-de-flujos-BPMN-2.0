interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function JsonEditor({ value, onChange }: JsonEditorProps) {
  return (
    <div className="json-editor">
      <div className="panel-header">
        <span>JSON / YAML</span>
        <span className="panel-hint">Code → Diagram</span>
      </div>
      <textarea
        className="code-textarea"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Editor de definición del proceso"
      />
    </div>
  );
}
