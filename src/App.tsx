import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { ProcessEditor } from './components/ProcessEditor';
import type { BpmnViewerHandle } from './components/BpmnViewer';
import { generateBpmn } from './services/bpmnGenerator';
import { downloadBpmn, downloadJson } from './services/bpmnExporter';
import { importBpmnFile } from './services/bpmnImporter';
import {
  parseProcessInput,
  validateProcessDefinition,
} from './services/validator';
import type {
  ProcessDefinition,
  ProcessDocument,
  ValidationIssue,
} from './types/process';
import dpfProcess from './examples/dpfProcess.json';
import simpleProcess from './examples/simpleProcess.json';
import gatewayProcess from './examples/gatewayProcess.json';

const EXAMPLES: Record<string, ProcessDocument> = {
  simple: simpleProcess as ProcessDocument,
  gateway: gatewayProcess as ProcessDocument,
  dpf: dpfProcess as ProcessDocument,
};

function formatDocument(doc: ProcessDocument): string {
  return JSON.stringify(doc, null, 2);
}

export default function App() {
  const viewerRef = useRef<BpmnViewerHandle>(null);
  const initialGenerateDone = useRef(false);
  const [darkMode, setDarkMode] = useState(true);
  const [code, setCode] = useState(() => formatDocument(EXAMPLES.dpf));
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);
  const [status, setStatus] = useState<string | null>(
    'Listo. Generando diagrama inicial…',
  );
  const [generating, setGenerating] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [process, setProcess] = useState<ProcessDefinition | null>(
    EXAMPLES.dpf.process,
  );

  const parsedDocument = useMemo(() => {
    const { document, parseError } = parseProcessInput(code);
    return { document, parseError };
  }, [code]);

  const runValidation = useCallback(() => {
    const { document, parseError } = parseProcessInput(code);
    if (parseError || !document) {
      const issue: ValidationIssue = {
        severity: 'error',
        message: `JSON inválido\n\n${parseError ?? 'No se pudo interpretar la definición.'}`,
      };
      setErrors([issue]);
      setWarnings([]);
      setProcess(null);
      setStatus('Validación fallida.');
      return null;
    }

    const result = validateProcessDefinition(document);
    setErrors(result.errors);
    setWarnings(result.warnings);
    setProcess(document.process);
    setStatus(
      result.valid
        ? `Validación OK${result.warnings.length ? ` (${result.warnings.length} warnings)` : ''}.`
        : `Validación fallida: ${result.errors.length} error(es).`,
    );
    return result.valid ? document : null;
  }, [code]);

  const handleGenerate = useCallback(async () => {
    const document = runValidation();
    if (!document) return;

    setGenerating(true);
    setStatus('Generando BPMN 2.0…');
    try {
      const xml = await generateBpmn(document);
      await viewerRef.current?.importXml(xml);
      setProcess(document.process);
      setStatus('Diagrama generado correctamente (BPMN 2.0 XML válido).');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al generar BPMN.';
      setErrors([
        {
          severity: 'error',
          message: `Error de generación\n\n${message}`,
        },
      ]);
      setStatus('Error al generar el diagrama.');
    } finally {
      setGenerating(false);
    }
  }, [runValidation]);

  const handleImportBpmn = useCallback(async () => {
    const modeler = viewerRef.current?.getModeler();
    if (!modeler) return;
    try {
      const xml = await importBpmnFile(modeler);
      if (!xml) return;
      viewerRef.current?.fitViewport();
      setStatus('BPMN importado. Puedes editarlo visualmente y exportarlo.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo importar el BPMN.';
      setErrors([{ severity: 'error', message }]);
      setStatus('Importación fallida.');
    }
  }, []);

  const handleExportBpmn = useCallback(async () => {
    const modeler = viewerRef.current?.getModeler();
    if (!modeler) return;
    try {
      await downloadBpmn(modeler, `${process?.id ?? 'process'}.bpmn`);
      setStatus('BPMN exportado.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo exportar BPMN.';
      setErrors([{ severity: 'error', message }]);
    }
  }, [process?.id]);

  const handleExportJson = useCallback(() => {
    const { document, parseError } = parsedDocument;
    if (!document || parseError) {
      setErrors([
        {
          severity: 'error',
          message: parseError ?? 'No hay JSON válido para exportar.',
        },
      ]);
      return;
    }
    downloadJson(document, `${document.process.id ?? 'process'}.json`);
    setStatus('JSON exportado.');
  }, [parsedDocument]);

  const handleLoadExample = useCallback((key: string) => {
    const example = EXAMPLES[key];
    if (!example) return;
    setCode(formatDocument(example));
    setProcess(example.process);
    setErrors([]);
    setWarnings([]);
    setStatus(`Ejemplo "${key}" cargado. Pulsa Generate BPMN.`);
  }, []);

  useEffect(() => {
    if (!viewerReady || initialGenerateDone.current) return;
    initialGenerateDone.current = true;
    void handleGenerate();
  }, [viewerReady, handleGenerate]);

  return (
    <div className={`app ${darkMode ? 'theme-dark' : 'theme-light'}`}>
      <Toolbar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
        onValidate={() => {
          runValidation();
        }}
        onGenerate={() => {
          void handleGenerate();
        }}
        onImportBpmn={() => {
          void handleImportBpmn();
        }}
        onExportBpmn={() => {
          void handleExportBpmn();
        }}
        onExportJson={handleExportJson}
        onFit={() => viewerRef.current?.fitViewport()}
        onZoomIn={() => viewerRef.current?.zoomIn()}
        onZoomOut={() => viewerRef.current?.zoomOut()}
        onLoadExample={handleLoadExample}
        generating={generating}
      />

      <ProcessEditor
        code={code}
        onCodeChange={setCode}
        process={process}
        errors={errors}
        warnings={warnings}
        status={status}
        viewerRef={viewerRef}
        onViewerReady={() => setViewerReady(true)}
        onDiagramChanged={() =>
          setStatus('Diagrama modificado visualmente. Puedes exportar el BPMN.')
        }
        footer={
          <footer className="app-footer">
            <span>Validate</span>
            <span>Generate</span>
            <span>Import BPMN</span>
            <span>Export BPMN</span>
            <span>Export JSON</span>
            <span className="muted">
              Motor: bpmn-js · Formato: BPMN 2.0 XML
            </span>
          </footer>
        }
      />
    </div>
  );
}
