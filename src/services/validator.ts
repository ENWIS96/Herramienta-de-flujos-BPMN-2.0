import * as yaml from 'js-yaml';
import type {
  ProcessDocument,
  ValidationIssue,
  ValidationResult,
  BpmnElementType,
} from '../types/process';
import { SUPPORTED_ELEMENT_TYPES } from '../types/process';

function isSupportedType(type: string): type is BpmnElementType {
  return (SUPPORTED_ELEMENT_TYPES as readonly string[]).includes(type);
}

function hasCycle(adjacency: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of adjacency.keys()) {
    if (dfs(node)) return true;
  }
  return false;
}

export function validateProcessDefinition(
  document: unknown,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!document || typeof document !== 'object') {
    return {
      valid: false,
      errors: [{ severity: 'error', message: 'JSON inválido: se esperaba un objeto.' }],
      warnings,
    };
  }

  const doc = document as Partial<ProcessDocument>;
  if (!doc.process || typeof doc.process !== 'object') {
    return {
      valid: false,
      errors: [
        {
          severity: 'error',
          path: 'process',
          message: 'Falta la propiedad raíz "process".',
        },
      ],
      warnings,
    };
  }

  const process = doc.process;

  if (!process.id || typeof process.id !== 'string') {
    errors.push({
      severity: 'error',
      path: 'process.id',
      message: 'El proceso debe tener un "id" de tipo string.',
    });
  }

  if (!process.name || typeof process.name !== 'string') {
    warnings.push({
      severity: 'warning',
      path: 'process.name',
      message: 'El proceso no tiene nombre.',
    });
  }

  if (!Array.isArray(process.lanes) || process.lanes.length === 0) {
    errors.push({
      severity: 'error',
      path: 'process.lanes',
      message: 'El proceso debe declarar al menos un lane.',
    });
  }

  if (!Array.isArray(process.elements) || process.elements.length === 0) {
    errors.push({
      severity: 'error',
      path: 'process.elements',
      message: 'El proceso debe declarar al menos un elemento.',
    });
  }

  if (!Array.isArray(process.flows)) {
    errors.push({
      severity: 'error',
      path: 'process.flows',
      message: 'El proceso debe declarar un arreglo "flows".',
    });
  }

  if (errors.length > 0 && (!process.lanes || !process.elements || !process.flows)) {
    return { valid: false, errors, warnings };
  }

  const laneIds = new Set<string>();
  process.lanes?.forEach((lane, index) => {
    if (!lane?.id) {
      errors.push({
        severity: 'error',
        path: `process.lanes[${index}]`,
        message: 'Cada lane debe tener un "id".',
      });
      return;
    }
    if (laneIds.has(lane.id)) {
      errors.push({
        severity: 'error',
        path: `process.lanes[${index}]`,
        message: `ID de lane duplicado: "${lane.id}".`,
      });
    }
    laneIds.add(lane.id);
  });

  const elementIds = new Set<string>();
  let hasStart = false;
  let hasEnd = false;
  const connected = new Set<string>();

  process.elements?.forEach((element, index) => {
    const path = `process.elements[${index}]`;
    if (!element?.id) {
      errors.push({
        severity: 'error',
        path,
        message: 'El elemento no tiene "id".',
      });
      return;
    }

    if (elementIds.has(element.id) || laneIds.has(element.id)) {
      errors.push({
        severity: 'error',
        path,
        message: `ID duplicado: "${element.id}".`,
      });
    }
    elementIds.add(element.id);

    if (!element.type) {
      errors.push({
        severity: 'error',
        path,
        message: `El elemento "${element.id}" no tiene "type".`,
      });
    } else if (!isSupportedType(element.type)) {
      errors.push({
        severity: 'error',
        path,
        message: `Tipo BPMN no soportado: "${element.type}" en el elemento "${element.id}".`,
      });
    }

    if (!element.lane) {
      errors.push({
        severity: 'error',
        path,
        message: `❌ Error en ${path}\n\nEl elemento "${element.id}" no tiene lane asignado.`,
      });
    } else if (!laneIds.has(element.lane)) {
      errors.push({
        severity: 'error',
        path,
        message: `❌ Error en ${path}\n\nEl elemento "${element.id}" pertenece al lane "${element.lane}", pero dicho lane no existe.`,
      });
    }

    if (element.type === 'startEvent') hasStart = true;
    if (element.type === 'endEvent') hasEnd = true;
  });

  const adjacency = new Map<string, string[]>();
  elementIds.forEach((id) => adjacency.set(id, []));

  process.flows?.forEach((flow, index) => {
    const path = `process.flows[${index}]`;
    if (!flow?.from || !flow?.to) {
      errors.push({
        severity: 'error',
        path,
        message: 'Cada flow debe tener "from" y "to".',
      });
      return;
    }

    if (!elementIds.has(flow.from)) {
      errors.push({
        severity: 'error',
        path,
        message: `La conexión referencia un origen inexistente: "${flow.from}".`,
      });
    }

    if (!elementIds.has(flow.to)) {
      errors.push({
        severity: 'error',
        path,
        message: `La conexión referencia un destino inexistente: "${flow.to}".`,
      });
    }

    connected.add(flow.from);
    connected.add(flow.to);
    adjacency.get(flow.from)?.push(flow.to);
  });

  if (!hasStart) {
    errors.push({
      severity: 'error',
      path: 'process.elements',
      message: 'El proceso no contiene un startEvent.',
    });
  }

  if (!hasEnd) {
    errors.push({
      severity: 'error',
      path: 'process.elements',
      message: 'El proceso no contiene un endEvent.',
    });
  }

  process.elements?.forEach((element, index) => {
    if (element?.id && !connected.has(element.id) && (process.elements?.length ?? 0) > 1) {
      warnings.push({
        severity: 'warning',
        path: `process.elements[${index}]`,
        message: `⚠ Warning\n\nEl proceso contiene un elemento sin conexión: "${element.id}".`,
      });
    }
  });

  if (hasCycle(adjacency)) {
    warnings.push({
      severity: 'warning',
      path: 'process.flows',
      message:
        '⚠ Warning\n\nEl grafo de flujos contiene ciclos. El layout los soporta, pero revisa si son intencionales.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function parseProcessInput(raw: string): {
  document: ProcessDocument | null;
  parseError: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { document: null, parseError: 'El editor está vacío.' };
  }

  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return {
        document: JSON.parse(trimmed) as ProcessDocument,
        parseError: null,
      };
    }

    const parsed = yaml.load(trimmed);
    return {
      document: parsed as ProcessDocument,
      parseError: null,
    };
  } catch (error) {
    return {
      document: null,
      parseError:
        error instanceof Error ? error.message : 'Entrada inválida (JSON/YAML).',
    };
  }
}
