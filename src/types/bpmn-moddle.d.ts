declare module 'bpmn-moddle' {
  export interface ToXMLResult {
    xml: string;
  }

  export interface BpmnModdleInstance {
    create(descriptor: string, attrs?: Record<string, unknown>): unknown;
    toXML(
      element: unknown,
      options?: { format?: boolean },
    ): Promise<ToXMLResult>;
    fromXML(xml: string, options?: unknown): Promise<unknown>;
  }

  export function BpmnModdle(
    additionalPackages?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): BpmnModdleInstance;
}
