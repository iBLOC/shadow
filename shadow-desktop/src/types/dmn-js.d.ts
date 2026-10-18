// dmn-js has no bundled types and @types/dmn-js is stale —
// declare the minimal surface the JDM editor page uses.
declare module 'dmn-js/lib/Modeler' {
  export default class DmnModeler {
    constructor(options?: {
      container?: HTMLElement | string;
      keyboard?: { bindTo?: Document };
      [key: string]: unknown;
    });
    createDiagram(): Promise<unknown>;
    importXML(xml: string): Promise<{ warnings: unknown[] }>;
    saveXML(options?: { format?: boolean }): Promise<{ xml: string }>;
    destroy(): void;
    attachTo(container: HTMLElement | string): void;
    clear(): void;
  }
}
