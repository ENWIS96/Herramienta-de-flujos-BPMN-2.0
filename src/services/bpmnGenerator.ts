import { BpmnModdle } from 'bpmn-moddle';
import type {
  ProcessDefinition,
  ProcessDocument,
  BpmnElementType,
} from '../types/process';
import { computeLayout } from './layoutEngine';

const BPMN_TYPE_MAP: Record<BpmnElementType, string> = {
  startEvent: 'bpmn:StartEvent',
  endEvent: 'bpmn:EndEvent',
  intermediateCatchEvent: 'bpmn:IntermediateCatchEvent',
  intermediateThrowEvent: 'bpmn:IntermediateThrowEvent',
  task: 'bpmn:Task',
  userTask: 'bpmn:UserTask',
  serviceTask: 'bpmn:ServiceTask',
  manualTask: 'bpmn:ManualTask',
  scriptTask: 'bpmn:ScriptTask',
  sendTask: 'bpmn:SendTask',
  receiveTask: 'bpmn:ReceiveTask',
  exclusiveGateway: 'bpmn:ExclusiveGateway',
  parallelGateway: 'bpmn:ParallelGateway',
  inclusiveGateway: 'bpmn:InclusiveGateway',
  eventBasedGateway: 'bpmn:EventBasedGateway',
  subprocess: 'bpmn:SubProcess',
  callActivity: 'bpmn:CallActivity',
};

type ModdleElement = {
  id: string;
  name?: string;
  outgoing?: ModdleElement[];
  incoming?: ModdleElement[];
  $type: string;
  [key: string]: unknown;
};

/**
 * Generates valid BPMN 2.0 XML from a process definition.
 * Creates collaboration, process, lanes, flow nodes, sequence flows and DI.
 */
export async function generateBpmn(
  document: ProcessDocument | ProcessDefinition,
): Promise<string> {
  const processDef: ProcessDefinition =
    'process' in document ? document.process : document;

  const layout = computeLayout(processDef);
  const moddle = BpmnModdle();

  const definitions = moddle.create('bpmn:Definitions', {
    id: 'Definitions_1',
    targetNamespace: 'http://bpmn.io/schema/bpmn',
    exporter: 'BPMN Code Generator',
    exporterVersion: '1.0.0',
  }) as ModdleElement;

  const processId = processDef.id || 'Process_1';
  const collaborationId = 'Collaboration_1';
  const participantId = layout.participant.id;

  const collaboration = moddle.create('bpmn:Collaboration', {
    id: collaborationId,
  }) as ModdleElement;

  const participant = moddle.create('bpmn:Participant', {
    id: participantId,
    name: processDef.name,
  }) as ModdleElement;

  const process = moddle.create('bpmn:Process', {
    id: processId,
    name: processDef.name,
    isExecutable: false,
  }) as ModdleElement;

  participant.processRef = process;
  collaboration.participants = [participant];

  const nodeMap = new Map<string, ModdleElement>();
  const nodesByLane = new Map<string, ModdleElement[]>();
  processDef.lanes.forEach((lane) => nodesByLane.set(lane.id, []));

  const flowNodes: ModdleElement[] = processDef.elements.map((el) => {
    const bpmnType = BPMN_TYPE_MAP[el.type];
    if (!bpmnType) {
      throw new Error(`Tipo BPMN no soportado: ${el.type}`);
    }
    const node = moddle.create(bpmnType, {
      id: el.id,
      name: el.name ?? el.id,
    }) as ModdleElement;
    nodeMap.set(el.id, node);
    nodesByLane.get(el.lane)?.push(node);
    return node;
  });

  const realFlows: ModdleElement[] = processDef.flows.map((flow, index) => {
    const flowId = layout.flows[index]?.id ?? flow.id ?? `Flow_${index + 1}`;
    const source = nodeMap.get(flow.from);
    const target = nodeMap.get(flow.to);
    if (!source || !target) {
      throw new Error(`Flow inválido: ${flow.from} → ${flow.to}`);
    }

    const sequenceFlow = moddle.create('bpmn:SequenceFlow', {
      id: flowId,
      name: flow.label,
      sourceRef: source,
      targetRef: target,
    }) as ModdleElement;

    source.outgoing = [...(source.outgoing ?? []), sequenceFlow];
    target.incoming = [...(target.incoming ?? []), sequenceFlow];
    return sequenceFlow;
  });

  const lanes = processDef.lanes.map((laneDef) =>
    moddle.create('bpmn:Lane', {
      id: laneDef.id,
      name: laneDef.name,
      flowNodeRef: nodesByLane.get(laneDef.id) ?? [],
    }),
  );

  const laneSet = moddle.create('bpmn:LaneSet', {
    id: 'LaneSet_1',
    lanes,
  });

  process.laneSets = [laneSet];
  process.flowElements = [...flowNodes, ...realFlows];

  const diagram = moddle.create('bpmndi:BPMNDiagram', {
    id: 'BPMNDiagram_1',
  });

  const plane = moddle.create('bpmndi:BPMNPlane', {
    id: 'BPMNPlane_1',
    bpmnElement: collaboration,
  });

  const shapes: unknown[] = [];
  const edges: unknown[] = [];

  shapes.push(
    moddle.create('bpmndi:BPMNShape', {
      id: `${participantId}_di`,
      bpmnElement: participant,
      isHorizontal: true,
      bounds: moddle.create('dc:Bounds', {
        x: layout.participant.x,
        y: layout.participant.y,
        width: layout.participant.width,
        height: layout.participant.height,
      }),
    }),
  );

  layout.lanes.forEach((laneLayout, index) => {
    shapes.push(
      moddle.create('bpmndi:BPMNShape', {
        id: `${laneLayout.id}_di`,
        bpmnElement: lanes[index],
        isHorizontal: true,
        bounds: moddle.create('dc:Bounds', {
          x: laneLayout.x,
          y: laneLayout.y,
          width: laneLayout.width,
          height: laneLayout.height,
        }),
      }),
    );
  });

  layout.elements.forEach((elLayout) => {
    const node = nodeMap.get(elLayout.id);
    if (!node) return;

    const shapeAttrs: Record<string, unknown> = {
      id: `${elLayout.id}_di`,
      bpmnElement: node,
      bounds: moddle.create('dc:Bounds', {
        x: elLayout.x,
        y: elLayout.y,
        width: elLayout.width,
        height: elLayout.height,
      }),
    };

    if (node.$type.includes('Gateway')) {
      shapeAttrs.isMarkerVisible = true;
    }

    shapes.push(moddle.create('bpmndi:BPMNShape', shapeAttrs));
  });

  layout.flows.forEach((flowLayout, index) => {
    const flowEl = realFlows[index];
    if (!flowEl) return;

    const edgeAttrs: Record<string, unknown> = {
      id: `${(flowEl as ModdleElement).id}_di`,
      bpmnElement: flowEl,
      waypoint: flowLayout.waypoints.map((wp) =>
        moddle.create('dc:Point', { x: wp.x, y: wp.y }),
      ),
    };

    if (flowLayout.labelBounds) {
      edgeAttrs.label = moddle.create('bpmndi:BPMNLabel', {
        bounds: moddle.create('dc:Bounds', {
          x: flowLayout.labelBounds.x,
          y: flowLayout.labelBounds.y,
          width: flowLayout.labelBounds.width,
          height: flowLayout.labelBounds.height,
        }),
      });
    }

    edges.push(moddle.create('bpmndi:BPMNEdge', edgeAttrs));
  });

  (plane as ModdleElement).planeElement = [...shapes, ...edges];
  (diagram as ModdleElement).plane = plane;

  definitions.rootElements = [collaboration, process];
  definitions.diagrams = [diagram];

  const { xml } = await moddle.toXML(definitions, { format: true });
  return xml;
}

/** Register additional BPMN types without rewriting the generator. */
export function registerBpmnType(
  type: BpmnElementType,
  moddleType: string,
): void {
  BPMN_TYPE_MAP[type] = moddleType;
}

export function getBpmnTypeMap(): Readonly<Record<BpmnElementType, string>> {
  return BPMN_TYPE_MAP;
}
