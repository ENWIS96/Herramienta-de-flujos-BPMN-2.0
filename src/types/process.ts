export type BpmnElementType =
  | 'startEvent'
  | 'endEvent'
  | 'intermediateCatchEvent'
  | 'intermediateThrowEvent'
  | 'task'
  | 'userTask'
  | 'serviceTask'
  | 'manualTask'
  | 'scriptTask'
  | 'sendTask'
  | 'receiveTask'
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway'
  | 'eventBasedGateway'
  | 'subprocess'
  | 'callActivity';

export const SUPPORTED_ELEMENT_TYPES: readonly BpmnElementType[] = [
  'startEvent',
  'endEvent',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
  'task',
  'userTask',
  'serviceTask',
  'manualTask',
  'scriptTask',
  'sendTask',
  'receiveTask',
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
  'eventBasedGateway',
  'subprocess',
  'callActivity',
] as const;

export interface LaneDefinition {
  id: string;
  name: string;
}

export interface ElementDefinition {
  id: string;
  type: BpmnElementType;
  name?: string;
  lane: string;
}

export interface FlowDefinition {
  id?: string;
  from: string;
  to: string;
  label?: string;
}

export interface ProcessDefinition {
  id: string;
  name: string;
  description?: string;
  lanes: LaneDefinition[];
  elements: ElementDefinition[];
  flows: FlowDefinition[];
}

export interface ProcessDocument {
  process: ProcessDefinition;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementLayout extends LayoutBounds {
  id: string;
}

export interface LaneLayout extends LayoutBounds {
  id: string;
  name: string;
}

export interface FlowLayout {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** Explicit position for the flow label, anchored next to its source. */
  labelBounds?: LayoutBounds;
  waypoints: LayoutPoint[];
}

export interface ParticipantLayout extends LayoutBounds {
  id: string;
  name: string;
}

export interface DiagramLayout {
  participant: ParticipantLayout;
  lanes: LaneLayout[];
  elements: ElementLayout[];
  flows: FlowLayout[];
  width: number;
  height: number;
}
