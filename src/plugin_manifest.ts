export interface ConfigurationSchema {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  properties?: Record<string, ConfigurationSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ConfigurationSchema;
}

export interface Connector {
  id: string;
  name: string;
  type: string;
}

export interface InstrumentManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  entrypoint: string;
  frontend: string;
  icon: string;
  capabilities: string[];
  sources: Connector[];
  sinks: Connector[];
  configuration: ConfigurationSchema;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function safeRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    !/[\\:%?#]/.test(value) &&
    ![...value].some((character) => character.charCodeAt(0) < 32) &&
    value.split("/").every((part) =>
      part !== "" && part !== "." && part !== ".."
    );
}

function checkSchema(
  value: unknown,
  depth = 0,
): asserts value is ConfigurationSchema {
  if (!isObject(value) || depth > 12) {
    throw new Error("Invalid configuration schema");
  }
  const keys = [
    "type",
    "title",
    "description",
    "default",
    "enum",
    "minimum",
    "maximum",
    "properties",
    "required",
    "additionalProperties",
    "items",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error("Unsupported configuration schema keyword");
  }
  if (
    !["object", "string", "number", "integer", "boolean", "array"].includes(
      String(value.type),
    )
  ) {
    throw new Error("Invalid configuration schema type");
  }
  for (const key of ["title", "description"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw new Error(`Invalid ${key}`);
    }
  }
  for (const key of ["minimum", "maximum"]) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "number" || !Number.isFinite(value[key]))
    ) throw new Error(`Invalid ${key}`);
  }
  if (
    typeof value.minimum === "number" && typeof value.maximum === "number" &&
    value.minimum > value.maximum
  ) throw new Error("Invalid numeric bounds");
  if (
    value.enum !== undefined &&
    (!Array.isArray(value.enum) || !value.enum.length)
  ) throw new Error("Invalid enum");
  if (
    value.additionalProperties !== undefined &&
    typeof value.additionalProperties !== "boolean"
  ) throw new Error("Invalid additionalProperties");
  if (value.properties !== undefined) {
    if (value.type !== "object" || !isObject(value.properties)) {
      throw new Error("Invalid properties");
    }
    for (const schema of Object.values(value.properties)) {
      checkSchema(schema, depth + 1);
    }
  }
  if (
    value.required !== undefined &&
    (!Array.isArray(value.required) ||
      value.required.some((key) => typeof key !== "string"))
  ) throw new Error("Invalid required fields");
  if (value.type === "array") checkSchema(value.items, depth + 1);
  if (value.default !== undefined) {
    validateConfiguration(
      value as unknown as ConfigurationSchema,
      value.default,
    );
  }
}

export function validateConfiguration(
  schema: ConfigurationSchema,
  value: unknown,
  path = "configuration",
): void {
  const type = schema.type;
  const valid = type === "object"
    ? isObject(value)
    : type === "array"
    ? Array.isArray(value)
    : type === "integer"
    ? Number.isInteger(value)
    : type === "number"
    ? typeof value === "number" && Number.isFinite(value)
    : type === "boolean"
    ? typeof value === "boolean"
    : typeof value === "string";
  if (!valid) throw new Error(`${path} must be ${type}`);
  if (
    schema.enum &&
    !schema.enum.some((option) =>
      JSON.stringify(option) === JSON.stringify(value)
    )
  ) throw new Error(`${path} is not an allowed value`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new Error(`${path} is below minimum`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      throw new Error(`${path} is above maximum`);
    }
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) {
        throw new Error(`${path}.${key} is required`);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new Error(`Unsafe configuration key ${key}`);
      }
      const child = Object.hasOwn(schema.properties ?? {}, key)
        ? schema.properties![key]
        : undefined;
      if (child) validateConfiguration(child, entry, `${path}.${key}`);
      else if (schema.additionalProperties === false) {
        throw new Error(`${path}.${key} is not supported`);
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((entry, i) =>
      validateConfiguration(schema.items!, entry, `${path}[${i}]`)
    );
  }
}

export function validateManifest(value: unknown): InstrumentManifest {
  if (!isObject(value) || value.schemaVersion !== 1) {
    throw new Error("Unsupported instrument schemaVersion");
  }
  const keys = [
    "$schema",
    "schemaVersion",
    "id",
    "version",
    "name",
    "description",
    "entrypoint",
    "frontend",
    "icon",
    "capabilities",
    "sources",
    "sinks",
    "configuration",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error("Unknown manifest field");
  }
  if (
    typeof value.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value.id)
  ) throw new Error("Invalid instrument id");
  if (
    typeof value.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version)
  ) throw new Error("Invalid instrument version");
  for (const key of ["name", "description"]) {
    if (typeof value[key] !== "string" || !value[key]) {
      throw new Error(`Invalid manifest ${key}`);
    }
  }
  for (const key of ["entrypoint", "frontend", "icon"]) {
    if (!safeRelativePath(value[key])) {
      throw new Error(`Unsafe manifest ${key}`);
    }
  }
  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.some((item) => typeof item !== "string" || !item)
  ) throw new Error("Invalid capabilities");
  for (const key of ["sources", "sinks"]) {
    const ports = value[key];
    if (!Array.isArray(ports)) throw new Error(`Invalid ${key}`);
    const ids = new Set();
    for (const port of ports) {
      if (
        !isObject(port) || typeof port.id !== "string" ||
        !/^[a-zA-Z0-9_-]+$/.test(port.id) || typeof port.name !== "string" ||
        !port.name || typeof port.type !== "string" || !port.type ||
        Object.keys(port).some((key) =>
          !["id", "name", "type"].includes(key)
        ) || ids.has(port.id)
      ) throw new Error(`Invalid or duplicate ${key} connector`);
      ids.add(port.id);
    }
  }
  checkSchema(value.configuration);
  if (value.configuration.type !== "object") {
    throw new Error("Configuration must be an object schema");
  }
  return structuredClone(value) as unknown as InstrumentManifest;
}

export async function containedFile(
  root: string,
  path: string,
): Promise<string> {
  if (!safeRelativePath(path)) throw new Error("Unsafe plug-in path");
  const resolved = await Deno.realPath(`${root}/${path}`);
  if (!resolved.startsWith(`${root}/`) || !(await Deno.stat(resolved)).isFile) {
    throw new Error("Plug-in file escapes its repository");
  }
  return resolved;
}
