# BPMN Code Generator

Aplicación web para **generar diagramas BPMN 2.0 automáticamente** a partir de una definición JSON/YAML, usando **React + Vite + TypeScript + bpmn-js**.

Flujo principal:

```text
JSON / YAML  →  BPMN Generator + Layout Engine  →  BPMN 2.0 XML  →  bpmn-js
```

El usuario escribe la definición del proceso; la app crea pools, lanes, tareas, eventos, gateways y conexiones con layout automático. Después puede editar el diagrama visualmente e importar/exportar.

## 1. Cómo instalar

```bash
npm install
```

## 2. Cómo ejecutar

```bash
npm run dev
```

Abrir la URL que muestra Vite (normalmente `http://localhost:5173`).

Build de producción:

```bash
npm run build
npm run preview
```

## 3. Cómo definir un proceso JSON

Estructura mínima:

```json
{
  "process": {
    "id": "mi-proceso",
    "name": "Nombre del proceso",
    "lanes": [
      { "id": "cliente", "name": "Cliente" },
      { "id": "banco", "name": "Banco" }
    ],
    "elements": [
      { "id": "start", "type": "startEvent", "name": "Inicio", "lane": "cliente" },
      { "id": "task1", "type": "userTask", "name": "Solicitar", "lane": "cliente" },
      { "id": "end", "type": "endEvent", "name": "Fin", "lane": "cliente" }
    ],
    "flows": [
      { "from": "start", "to": "task1" },
      { "from": "task1", "to": "end" }
    ]
  }
}
```

También se acepta **YAML** en el editor.

### Tipos soportados

**Eventos:** `startEvent`, `endEvent`, `intermediateCatchEvent`, `intermediateThrowEvent`

**Actividades:** `task`, `userTask`, `serviceTask`, `manualTask`, `scriptTask`, `sendTask`, `receiveTask`

**Gateways:** `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, `eventBasedGateway`

**Otros:** `subprocess`, `callActivity`

## 4. Cómo generar BPMN

1. Escribe o pega la definición en el editor izquierdo.
2. Pulsa **Validate** (opcional) para revisar errores.
3. Pulsa **Generate BPMN**.

La app ejecuta:

```ts
const xml = await generateBpmn(processDefinition);
await modeler.importXML(xml);
```

y muestra el diagrama editable en bpmn-js.

Ejemplos incluidos (selector de la toolbar):

- **Simple** — Start → Task → End
- **Gateway** — bifurcación exclusive gateway
- **DPF 4 lanes** — Cliente / Creatio / Servicio / Core Bancario

## 5. Cómo importar BPMN

Pulsa **Import BPMN** y selecciona un archivo `.bpmn` o `.xml`.

Se carga con:

```ts
await modeler.importXML(xml);
```

## 6. Cómo exportar BPMN

Pulsa **Export BPMN** para descargar `process.bpmn` (BPMN 2.0 XML válido, compatible con Camunda Modeler / bpmn.io).

```ts
const { xml } = await modeler.saveXML({ format: true });
```

**Export JSON** descarga la definición actual del editor como `process.json`.

## 7. Cómo agregar nuevos tipos BPMN

1. Añade el tipo en `src/types/process.ts` (`BpmnElementType` y `SUPPORTED_ELEMENT_TYPES`).
2. Regístralo en el mapa del generador:

```ts
import { registerBpmnType } from './services/bpmnGenerator';

registerBpmnType('businessRuleTask', 'bpmn:BusinessRuleTask');
```

3. Si el tamaño visual es distinto, añade dimensiones en `src/services/layoutEngine.ts` (`ELEMENT_SIZE`).

No hace falta reescribir el generador completo.

## 8. Cómo funciona el motor de layout

Archivo: `src/services/layoutEngine.ts`

1. **Rompe los ciclos**: detecta las aristas de retorno (rework, "devuelto al
   solicitante") con un DFS. Sin esto los bucles corrompen el ranking y los
   elementos terminan apilados unos sobre otros.
2. **Columnas (X)**: rank por camino más largo sobre el grafo acíclico. Cada
   rank es una columna cuyo ancho es el del elemento más ancho, y los elementos
   se centran dentro de su columna.
3. **Filas (Y)**: dentro de cada lane los elementos se reparten en filas. El
   orden de la fila se decide por baricentro de los predecesores para reducir
   cruces.
4. **Alto de carril dinámico**: cada lane crece hasta contener su pila más alta
   más el padding, así que ninguna caja se sale del carril. Las tareas también
   crecen en alto según el largo de su nombre.
5. **Ruteo por corredores libres**: los tramos verticales van siempre por el
   hueco entre columnas y los tramos horizontales largos por la *banda de
   ruteo* reservada en la parte baja de cada carril. Por eso las líneas no
   pasan por encima de las cajas, ni en saltos largos ni en bucles.
6. **Etiquetas ancladas**: cada `sequenceFlow` con `label` recibe un
   `BPMNLabel` con posición explícita junto a su origen (alternando arriba y
   abajo cuando un gateway tiene varias salidas), en vez de quedar en el punto
   medio del recorrido.

La API es sustituible; puedes mejorar el algoritmo sin tocar la UI. Los
espaciados se ajustan con `LayoutOptions` (`columnGap`, `rowGap`,
`lanePaddingY`, `minLaneHeight`, `taskWidth`).

## Arquitectura

```text
src/
├── components/     # UI (Toolbar, JsonEditor, BpmnViewer, …)
├── services/
│   ├── bpmnGenerator.ts   # JSON → BPMN 2.0 XML (bpmn-moddle)
│   ├── layoutEngine.ts    # posiciones automáticas
│   ├── validator.ts       # validación de la definición
│   ├── bpmnImporter.ts
│   └── bpmnExporter.ts
├── types/process.ts
├── utils/
└── examples/
```

## Scripts

| Comando        | Descripción              |
|----------------|--------------------------|
| `npm run dev`  | Servidor de desarrollo   |
| `npm run build`| Build TypeScript + Vite  |
| `npm run preview` | Vista previa del build |

## Notas

- El resultado es **BPMN 2.0 real** (XML), no Mermaid ni SVG dibujado a mano.
- Tras generar, puedes editar el diagrama en bpmn-js (mover, conectar, zoom, etc.).
- Diagram → JSON aún no es automático; la arquitectura deja espacio para añadirlo después.
