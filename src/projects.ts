import { isObject } from "./plugin_manifest.ts";
import type { InstrumentInfo } from "./plugin_registry.ts";

export interface FlowProject {
  schemaVersion: 1;
  objects: {
    id: string;
    instrumentId: string;
    name: string;
    x: number;
    y: number;
  }[];
  connections: { from: string; fromPort: string; to: string; toPort: string }[];
}

export function normalizeProject(
  value: unknown,
  catalog: InstrumentInfo[],
): FlowProject {
  if (
    !isObject(value) ||
    (value.schemaVersion !== undefined && value.schemaVersion !== 1) ||
    !Array.isArray(value.objects) || !Array.isArray(value.connections) ||
    value.objects.length > 1000 || value.connections.length > 10000
  ) throw new Error("Invalid project");
  const ids = new Set<string>();
  const objects = value.objects.map((object) => {
    if (
      !isObject(object) || typeof object.id !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(object.id) || ids.has(object.id) ||
      typeof object.x !== "number" || !Number.isFinite(object.x) ||
      typeof object.y !== "number" || !Number.isFinite(object.y)
    ) throw new Error("Invalid project object");
    ids.add(object.id);
    const instrumentId = typeof object.instrumentId === "string"
      ? object.instrumentId
      : catalog.find((entry) => entry.legacyGuid === object.guid)?.id ??
        object.guid;
    if (
      typeof instrumentId !== "string" || !/^[a-zA-Z0-9-]+$/.test(instrumentId)
    ) throw new Error("Missing project instrument id");
    return {
      id: object.id,
      instrumentId,
      name: typeof object.name === "string" ? object.name : instrumentId,
      x: Math.max(0, object.x),
      y: Math.max(0, object.y),
    };
  });
  const connections = value.connections.map((connection) => {
    if (
      !isObject(connection) || typeof connection.from !== "string" ||
      typeof connection.to !== "string" || !ids.has(connection.from) ||
      !ids.has(connection.to) || typeof connection.fromPort !== "string" ||
      typeof connection.toPort !== "string"
    ) throw new Error("Invalid project connection");
    const port = (id: string, name: string, direction: "sources" | "sinks") => {
      const instrumentId = objects.find((object) =>
        object.id === id
      )!.instrumentId;
      const manifest = catalog.find((entry) => entry.id === instrumentId)
        ?.manifest;
      return manifest?.[direction].find((connector) =>
        connector.id === name || connector.name === name
      )?.id ?? name;
    };
    return {
      from: connection.from,
      fromPort: port(connection.from, connection.fromPort, "sources"),
      to: connection.to,
      toPort: port(connection.to, connection.toPort, "sinks"),
    };
  });
  return { schemaVersion: 1, objects, connections };
}
