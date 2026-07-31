import type { ReactNode, RefObject } from 'react';
import { JsonEditor } from './JsonEditor';
import { BpmnViewer, type BpmnViewerHandle } from './BpmnViewer';
import { LanePanel } from './LanePanel';
import { ExportPanel } from './ExportPanel';
import type { ProcessDefinition, ValidationIssue } from '../types/process';

interface ProcessEditorProps {
  code: string;
  onCodeChange: (value: string) => void;
  process: ProcessDefinition | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  status: string | null;
  viewerRef: RefObject<BpmnViewerHandle | null>;
  onViewerReady?: (modeler: unknown) => void;
  onDiagramChanged?: () => void;
  footer?: ReactNode;
}

export function ProcessEditor({
  code,
  onCodeChange,
  process,
  errors,
  warnings,
  status,
  viewerRef,
  onViewerReady,
  onDiagramChanged,
  footer,
}: ProcessEditorProps) {
  return (
    <div className="process-editor">
      <div className="workspace">
        <LanePanel process={process} />

        <div className="editor-column">
          <JsonEditor value={code} onChange={onCodeChange} />
          <ExportPanel errors={errors} warnings={warnings} status={status} />
        </div>

        <div className="diagram-column">
          <div className="panel-header">
            <span>BPMN Diagram</span>
            <span className="panel-hint">Editable con bpmn-js</span>
          </div>
          <BpmnViewer
            ref={viewerRef}
            onReady={onViewerReady as never}
            onChanged={onDiagramChanged}
          />
        </div>
      </div>
      {footer}
    </div>
  );
}
