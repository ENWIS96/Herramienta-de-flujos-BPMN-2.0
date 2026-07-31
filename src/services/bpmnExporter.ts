import type Modeler from 'bpmn-js/lib/Modeler';
import { downloadFile } from '../utils/fileUtils';
import type { ProcessDocument } from '../types/process';

export async function exportBpmnXml(modeler: Modeler): Promise<string> {
  const result = await modeler.saveXML({ format: true });
  if (!result.xml) {
    throw new Error('No se pudo serializar el diagrama BPMN.');
  }
  return result.xml;
}

export async function downloadBpmn(
  modeler: Modeler,
  filename = 'process.bpmn',
): Promise<void> {
  const xml = await exportBpmnXml(modeler);
  downloadFile(xml, filename, 'application/xml');
}

export function downloadJson(
  document: ProcessDocument,
  filename = 'process.json',
): void {
  const content = JSON.stringify(document, null, 2);
  downloadFile(content, filename, 'application/json');
}

export async function exportSvg(modeler: Modeler): Promise<string> {
  const result = await modeler.saveSVG();
  if (!result.svg) {
    throw new Error('No se pudo exportar SVG.');
  }
  return result.svg;
}
