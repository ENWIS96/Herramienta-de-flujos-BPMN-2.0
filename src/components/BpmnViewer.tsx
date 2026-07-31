import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

export interface BpmnViewerHandle {
  getModeler: () => BpmnModeler | null;
  importXml: (xml: string) => Promise<void>;
  fitViewport: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface CanvasLike {
  zoom: (scale?: string | number, center?: string) => number;
  viewbox: (box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => { x: number; y: number; width: number; height: number; scale: number };
}

/**
 * Fits the diagram leaving room for the floating palette, otherwise the
 * leftmost element (usually the start event) ends up hidden behind it.
 */
function fitWithPadding(modeler: BpmnModeler): void {
  const canvas = modeler.get('canvas') as CanvasLike;
  canvas.zoom('fit-viewport', 'auto');

  const box = canvas.viewbox();
  const left = 90 / box.scale;
  const margin = 24 / box.scale;

  canvas.viewbox({
    x: box.x - left,
    y: box.y - margin,
    width: box.width + left + margin,
    height: box.height + margin * 2,
  });
}

interface BpmnViewerProps {
  onReady?: (modeler: BpmnModeler) => void;
  onChanged?: () => void;
}

const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_empty"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_empty" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_empty">
    <bpmndi:BPMNPlane id="BPMNPlane_empty" bpmnElement="Process_empty" />
  </bpmndi:BPMNDiagram>
</definitions>`;

export const BpmnViewer = forwardRef<BpmnViewerHandle, BpmnViewerProps>(
  function BpmnViewer({ onReady, onChanged }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<BpmnModeler | null>(null);
    const onReadyRef = useRef(onReady);
    const onChangedRef = useRef(onChanged);

    onReadyRef.current = onReady;
    onChangedRef.current = onChanged;

    useEffect(() => {
      if (!containerRef.current) return;

      const modeler = new BpmnModeler({
        container: containerRef.current,
      });

      modelerRef.current = modeler;

      void modeler.importXML(EMPTY_BPMN).then(() => {
        fitWithPadding(modeler);
        onReadyRef.current?.(modeler);
      });

      const eventBus = modeler.get('eventBus') as {
        on: (event: string, cb: () => void) => void;
        off: (event: string, cb: () => void) => void;
      };

      const handleChange = () => onChangedRef.current?.();
      eventBus.on('commandStack.changed', handleChange);

      return () => {
        eventBus.off('commandStack.changed', handleChange);
        modeler.destroy();
        modelerRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      getModeler: () => modelerRef.current,
      importXml: async (xml: string) => {
        const modeler = modelerRef.current;
        if (!modeler) return;
        await modeler.importXML(xml);
        fitWithPadding(modeler);
      },
      fitViewport: () => {
        const modeler = modelerRef.current;
        if (!modeler) return;
        fitWithPadding(modeler);
      },
      zoomIn: () => {
        const modeler = modelerRef.current;
        if (!modeler) return;
        const canvas = modeler.get('canvas') as {
          zoom: (type?: string | number) => number;
        };
        canvas.zoom(canvas.zoom() + 0.1);
      },
      zoomOut: () => {
        const modeler = modelerRef.current;
        if (!modeler) return;
        const canvas = modeler.get('canvas') as {
          zoom: (type?: string | number) => number;
        };
        canvas.zoom(canvas.zoom() - 0.1);
      },
    }));

    return <div className="bpmn-viewer" ref={containerRef} />;
  },
);
