// toMatchApiSchema: validates an openapi-fetch result against the OpenAPI
// document itself — status documented, content-type as declared, body valid
// per the (dereferenced) JSON Schema. The typed client makes the *request*
// side provably correct at compile time; this matcher is the runtime proof
// for the *response* side.
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { expect } from "vitest";
import type { paths } from "../../../openapi/generated/schema";

export type ApiPath = keyof paths;
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface ApiResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

const SPEC_PATH = path.resolve(import.meta.dirname, "../../../openapi/openapi.yaml");

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

let specPromise: Promise<unknown> | null = null;

function loadSpec(): Promise<unknown> {
  specPromise ??= SwaggerParser.dereference(SPEC_PATH);
  return specPromise;
}

const validatorCache = new Map<string, ValidateFunction>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function dig(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function preview(body: unknown): string {
  const text = JSON.stringify(body);
  return typeof text === "string" ? text.slice(0, 300) : String(body);
}

expect.extend({
  async toMatchApiSchema(received: ApiResult, apiPath: ApiPath, method: HttpMethod, status: number) {
    const actualStatus = received.response.status;
    const body: unknown = actualStatus >= 400 ? received.error : received.data;

    if (actualStatus !== status) {
      return {
        pass: false,
        message: () =>
          `expected ${method.toUpperCase()} ${apiPath} to respond ${String(status)}, got ${String(actualStatus)}: ${preview(body)}`,
      };
    }

    const spec = await loadSpec();
    const responseSpec = dig(spec, "paths", apiPath, method, "responses", String(status));
    if (responseSpec === undefined) {
      return {
        pass: false,
        message: () => `${method.toUpperCase()} ${apiPath} has no documented ${String(status)} response in openapi.yaml`,
      };
    }

    const content = dig(responseSpec, "content");
    const contentType = received.response.headers.get("content-type") ?? "";

    // No content documented (204): the body must actually be empty.
    if (content === undefined) {
      const empty = body === undefined || body === null || (isRecord(body) && Object.keys(body).length === 0);
      return {
        pass: empty,
        message: () => `expected an empty body for ${String(status)}, got: ${preview(body)}`,
      };
    }

    const textSchema = dig(content, "text/plain", "schema");
    if (textSchema !== undefined) {
      const pass = contentType.includes("text/plain") && typeof body === "string" && body.length > 0;
      return {
        pass,
        message: () =>
          `expected a non-empty text/plain body (content-type: ${contentType}, body type: ${typeof body})`,
      };
    }

    const jsonSchema = dig(content, "application/json", "schema");
    if (!isRecord(jsonSchema)) {
      return {
        pass: false,
        message: () => `no application/json schema documented for ${method.toUpperCase()} ${apiPath} ${String(status)}`,
      };
    }
    if (!contentType.includes("application/json")) {
      return {
        pass: false,
        message: () => `expected application/json, got content-type: ${contentType}`,
      };
    }

    const cacheKey = `${method} ${apiPath} ${String(status)}`;
    let validate = validatorCache.get(cacheKey);
    if (!validate) {
      validate = ajv.compile(jsonSchema);
      validatorCache.set(cacheKey, validate);
    }

    const valid = validate(body);
    return {
      pass: valid,
      message: () =>
        `response body does not match the contract for ${method.toUpperCase()} ${apiPath} ${String(status)}:\n` +
        `${ajv.errorsText(validate.errors)}\nbody: ${preview(body)}`,
    };
  },
});

declare module "vitest" {
  // Vitest's own Matchers interface uses `any`; augmentation must match.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Matchers<T = any> {
    toMatchApiSchema(apiPath: ApiPath, method: HttpMethod, status: number): Promise<T>;
  }
}
