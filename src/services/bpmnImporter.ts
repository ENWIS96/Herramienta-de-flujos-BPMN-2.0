import type Modeler from 'bpmn-js/lib/Modeler';
import { pickFile, readFileAsText } from '../utils/fileUtils';

export async function importBpmnFile(modeler: Modeler): Promise<string | null> {
  const file = await pickFile('.bpmn,.xml,application/xml,text/xml');
  if (!file) return null;

  const xml = await readFileAsText(file);
  await modeler.importXML(xml);
  return xml;
}

export async function importBpmnXml(
  modeler: Modeler,
  xml: string,
): Promise<void> {
  await modeler.importXML(xml);
}
