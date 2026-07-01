import { mkdir, rm, writeFile } from 'node:fs/promises';

const DEFAULT_SERVER_URL = 'https://api.txtoken.cn';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * Foreign → domestic model identifier rewrite map.
 *
 * Scope: ONLY applied to
 *   (a) bare string values that look like model identifiers (see
 *       `looksLikeModelId` — short, lowercase alphanum + `-_.`, no Chinese /
 *       whitespace / punctuation), and
 *   (b) `?model=<id>` / `&model=<id>` query parameters inside any string
 *       (covers WSS / HTTPS URLs in descriptions and examples).
 *
 * NOT applied to free-form prose inside `description` / `summary` fields
 * (e.g. "可使用 gemini-2.5-flash-preview-tts 等模型" or
 * "用于图像生成的模型。`dall-e-2`、`dall-e-3` 或 `gpt-image-1` 之一" stays as-is)
 * — that's intentional: prose that distinguishes between sibling models
 * would lose semantic info if blindly rewritten.
 *
 * Keys are sorted longest-first inside `renameId` to avoid prefix collisions
 * (e.g. `gpt-image-2-2026-04-21` before `gpt-image-2`).
 *
 * Vendor / protocol / tag strings (e.g. "OpenAI", "原生OpenAI格式",
 * "Sora格式", "/v1/chat/completions") are NOT rewritten because they don't
 * match any key.
 */
const MODEL_RENAME_MAP: ReadonlyArray<readonly [string, string]> = [
  // OpenAI — chat 旗舰 / 轻量 / 实时
  ['gpt-5.4', 'qwen3-max'],
  ['gpt-4o-mini', 'qwen-plus'],
  ['gpt-4o-realtime-preview', 'qwen-omni-realtime'],
  ['gpt-4o-realtime', 'qwen-omni-realtime'],
  ['gpt-4o', 'qwen3-max'],
  ['gpt-4', 'qwen3-max'],
  // OpenAI — image（保留 3 档区分：base / 旗舰 / pro）
  ['gpt-image-2-2026-04-21', 'qwen-image-2.0-2025-snapshot'],
  ['gpt-image-2', 'qwen-image-2.0'],
  ['gpt-image-1.5', 'qwen-image'],
  ['gpt-image-1', 'qwen-image-pro'],
  ['dall-e-3', 'qwen-image-2.0'],
  ['dall-e-2', 'qwen-image-base'],
  // Anthropic
  ['claude-3-opus-20240229', 'kimi-k2'],
  ['claude-sonnet-4-20250514', 'kimi-k2'],
  ['claude-opus-4.6', 'glm-4.6'],
  // Google — multimodal / vision
  ['gemini-2.5-pro', 'qwen3-vl-plus'],
  ['gemini-2.5-flash-preview-tts', 'qwen-omni-tts'],
  ['gemini-2.5-flash-image', 'qwen-image'],
  ['gemini-3-pro-image-preview', 'qwen-image-2.0'],
  ['gemini-3.1-flash-image-preview', 'qwen-image'],
  ['gemini-2.0-flash-exp-image-generation', 'qwen-image'],
  // OpenAI — audio
  ['whisper-1', 'qwen-asr'],
  ['tts-1', 'qwen-tts'],
  // OpenAI — video
  ['sora-2', 'doubao-seedance'],
  ['sora', 'doubao-seedance'],
  // OpenAI — embedding / moderation / rerank
  ['text-embedding-ada-002', 'qwen3-embedding'],
  ['text-moderation-latest', 'qwen-safety'],
  // Cohere — rerank
  ['rerank-english-v2.0', 'qwen-rerank'],
];

/**
 * Pre-sorted by key length descending so longer identifiers are matched first
 * (prevents `gpt-image-2` from greedily eating the prefix of
 * `gpt-image-2-2026-04-21`).
 */
const SORTED_RENAMES = [...MODEL_RENAME_MAP].sort(
  (a, b) => b[0].length - a[0].length
);

/**
 * Heuristic: a "bare" model id is short, only `[a-z0-9._-]`, no whitespace
 * or Chinese / punctuation. Strings that fail this (e.g. URLs, prose) are
 * treated more carefully (see `rewriteStringValue`).
 */
const BARE_ID = /^[a-z0-9._-]+$/;

/** True iff `s` looks like a model identifier that should be fully rewritten. */
function looksLikeModelId(s: string): boolean {
  return s.length > 0 && s.length <= 60 && BARE_ID.test(s);
}

/** Apply the rename map (longest-key-first) to a single string. */
function renameId(s: string): string {
  let out = s;
  for (const [from, to] of SORTED_RENAMES) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

/**
 * Rewrite a single string value:
 *   - if it looks like a bare model id, apply the rename map wholesale;
 *   - otherwise, only touch `?model=<id>` / `&model=<id>` query parameters
 *     (covers WSS / HTTPS URLs in descriptions), and leave the rest alone.
 */
function rewriteStringValue(s: string): string {
  if (looksLikeModelId(s)) return renameId(s);
  // Non-bare: only rewrite the value of a `model=<id>` query param.
  return s.replace(/([?&]model=)([a-z0-9._-]+)/g, (_m, prefix, id) => {
    const rewritten = renameId(id);
    return prefix + rewritten;
  });
}

/** Recursively walk a JSON-compatible value, rewriting foreign model ids. */
function rewriteModelNames(value: unknown): unknown {
  if (typeof value === 'string') return rewriteStringValue(value);
  if (Array.isArray(value)) return value.map(rewriteModelNames);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = rewriteModelNames(v);
    }
    return out;
  }
  return value;
}

type HttpTxtRoot = {
  success: boolean;
  data: HttpEndpoint[];
};

type HttpEndpoint = {
  id: number;
  name: string;
  description?: string;
  operationId?: string;
  method: string;
  path: string;
  tags?: string[];
  moduleId?: number;
  requestBody?: {
    type?: string; // "none" | "application/json" | "multipart/form-data" ...
    parameters?: Array<{
      name: string;
      required?: boolean;
      description?: string;
      type?: string; // "file" | "string" | "integer" ...
      schema?: Record<string, unknown>;
    }>;
    jsonSchema?: Record<string, unknown>;
    mediaType?: string;
    required?: boolean;
    description?: string;
  };
  parameters?: {
    path?: Array<HttpParameter>;
    query?: Array<HttpParameter>;
    header?: Array<HttpParameter>;
    cookie?: Array<HttpParameter>;
  };
  responses?: Array<{
    code: number;
    name?: string;
    description?: string;
    contentType?: string; // "json" | "noContent" ...
    mediaType?: string;
    jsonSchema?: Record<string, unknown>;
    headers?: Array<unknown>;
  }>;
  auth?: {
    type?: string;
  };
  securityScheme?: {
    schemeGroups?: Array<{
      schemeIds?: number[];
    }>;
    required?: boolean;
  };
};

type HttpParameter = {
  name: string;
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
  type?: string;
};

type SchemaDefItem = {
  id?: string; // "#/definitions/224065305"
  schema?: { jsonSchema?: Record<string, unknown> };
  items?: SchemaDefItem[];
};

function sanitizePathPart(input: string): string {
  // Windows-safe file/folder names
  return input
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-') // illegal chars
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '') // no trailing dots
    .trim()
    .slice(0, 120);
}

function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'endpoint';
}

function toOpenApiParam(
  p: HttpParameter,
  where: 'path' | 'query' | 'header' | 'cookie'
) {
  const schema = p.schema ?? (p.type ? { type: p.type } : { type: 'string' });
  return {
    name: p.name,
    in: where,
    required: where === 'path' ? true : !!p.required,
    description: p.description || undefined,
    schema,
  };
}

function extractDefinitionsFromApifoxProject(
  project: unknown
): Map<string, any> {
  const map = new Map<string, any>();

  function walk(node: any) {
    if (!node || typeof node !== 'object') return;
    const maybeId = typeof node.id === 'string' ? node.id : undefined;
    const match = maybeId?.match(/^#\/definitions\/(\d+)$/);
    const jsonSchema = node?.schema?.jsonSchema;
    if (match && jsonSchema && typeof jsonSchema === 'object') {
      map.set(match[1], jsonSchema);
    }
    const items = node.items;
    if (Array.isArray(items)) {
      for (const it of items) walk(it);
    }
  }

  const root = project as any;
  const schemaCollection = root?.schemaCollection;
  if (Array.isArray(schemaCollection)) {
    for (const top of schemaCollection) walk(top);
  }

  return map;
}

type OpenApiSecuritySchemeObject = Record<string, unknown>;

function extractSecuritySchemesFromApifoxProject(
  project: unknown
): Map<number, { name: string; scheme: OpenApiSecuritySchemeObject }> {
  const out = new Map<
    number,
    { name: string; scheme: OpenApiSecuritySchemeObject }
  >();
  const root = project as any;
  const collection = root?.securitySchemeCollection;
  if (!Array.isArray(collection)) return out;

  for (const group of collection) {
    const items = group?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const id = typeof item?.id === 'number' ? item.id : undefined;
      const name = typeof item?.name === 'string' ? item.name : undefined;
      const cfg = item?.authConfigs;
      if (!id || !name || !cfg || typeof cfg !== 'object') continue;

      // Apifox stores OAS-like shape in authConfigs
      // We map to OpenAPI 3.x Security Scheme Object.
      const type = cfg.type;
      let scheme: OpenApiSecuritySchemeObject | undefined;

      if (type === 'http') {
        scheme = {
          type: 'http',
          scheme: cfg.scheme,
          description: cfg.description || undefined,
        };
      } else if (type === 'apiKey') {
        scheme = {
          type: 'apiKey',
          in: cfg.in,
          name: cfg.name,
          description: cfg.description || undefined,
        };
      } else if (type === 'oauth2') {
        scheme = {
          type: 'oauth2',
          flows: cfg.flows,
          description: cfg.description || undefined,
        };
      } else {
        // Unknown type; keep minimal so UI can still render
        scheme = {
          type: String(type || 'http'),
          description: cfg.description || undefined,
        };
      }

      out.set(id, { name, scheme });
    }
  }

  return out;
}

function deepClone<T>(x: T): T {
  return x ? (JSON.parse(JSON.stringify(x)) as T) : x;
}

function resolveSchemaRefs(
  schema: any,
  defs: Map<string, any>,
  visiting = new Set<string>()
): any {
  if (!schema || typeof schema !== 'object') return schema;

  // Resolve direct $ref
  const ref = typeof schema.$ref === 'string' ? schema.$ref : undefined;
  const match = ref?.match(/^#\/definitions\/(\d+)$/);
  if (match) {
    const id = match[1];
    if (visiting.has(id)) {
      // cycle protection
      return {
        type: 'object',
        description: `Cyclic $ref to #/definitions/${id}`,
      };
    }
    const def = defs.get(id);
    if (!def) {
      return {
        type: 'object',
        description: `Unresolved $ref: #/definitions/${id}`,
      };
    }
    visiting.add(id);
    const resolved = resolveSchemaRefs(deepClone(def), defs, visiting);
    visiting.delete(id);
    return resolved;
  }

  // Recurse into composite keywords / properties / items etc.
  const out: any = Array.isArray(schema) ? [] : { ...schema };
  const keys = Object.keys(out);
  for (const k of keys) {
    const v = out[k];
    if (Array.isArray(v)) {
      out[k] = v.map((it) => resolveSchemaRefs(it, defs, visiting));
    } else if (v && typeof v === 'object') {
      out[k] = resolveSchemaRefs(v, defs, visiting);
    }
  }
  return out;
}

function buildRequestBody(ep: HttpEndpoint, defs: Map<string, any>) {
  const rb = ep.requestBody;
  if (!rb) return undefined;
  const t = rb.type?.toLowerCase();
  if (!t || t === 'none') return undefined;

  const mediaType =
    rb.mediaType ||
    (t.includes('/') ? rb.type : undefined) ||
    'application/json';

  // multipart/form-data etc: build schema from parameters
  if (
    Array.isArray(rb.parameters) &&
    rb.parameters.length > 0 &&
    !rb.jsonSchema
  ) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const p of rb.parameters) {
      if (!p?.name) continue;
      const propSchema =
        p.schema ??
        (p.type === 'file'
          ? { type: 'string', format: 'binary' }
          : p.type
            ? { type: p.type }
            : { type: 'string' });
      properties[p.name] = {
        ...propSchema,
        description: p.description || propSchema.description,
      };
      if (p.required) required.push(p.name);
    }

    return {
      required: !!rb.required,
      description: rb.description || undefined,
      content: {
        [mediaType]: {
          schema: {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {}),
          },
        },
      },
    };
  }

  if (rb.jsonSchema && typeof rb.jsonSchema === 'object') {
    return {
      required: !!rb.required,
      description: rb.description || undefined,
      content: {
        [mediaType]: {
          schema: resolveSchemaRefs(deepClone(rb.jsonSchema), defs),
        },
      },
    };
  }

  return {
    required: !!rb.required,
    content: {
      [mediaType]: {
        schema: { type: 'object' },
      },
    },
  };
}

function buildResponses(ep: HttpEndpoint, defs: Map<string, any>) {
  const res: Record<string, any> = {};
  for (const r of ep.responses ?? []) {
    const code = String(r.code);
    const mediaType = r.mediaType || 'application/json';
    const isNoContent = (r.contentType || '').toLowerCase() === 'nocontent';

    if (isNoContent || !r.jsonSchema) {
      res[code] = { description: r.description || r.name || 'Response' };
      continue;
    }

    res[code] = {
      description: r.description || r.name || 'Response',
      content: {
        [mediaType]: {
          schema: resolveSchemaRefs(deepClone(r.jsonSchema), defs),
        },
      },
    };
  }

  // OpenAPI requires at least one response
  if (Object.keys(res).length === 0) {
    res['200'] = { description: 'OK' };
  }

  return res;
}

function normalizeMethod(method: string): string {
  return method.trim().toLowerCase();
}

function groupByModuleId(moduleId?: number) {
  // From observed data:
  // - 6656265: AI 模型接口
  // - 6660656: 后台管理接口
  if (moduleId === 6660656) return 'management';
  return 'ai-model';
}

async function readHttpSource(): Promise<HttpTxtRoot> {
  const DEFAULT_URL =
    'https://api.apifox.com/api/v1/projects/7484041/http-apis';
  const url = process.env.HTTP_SOURCE_URL?.trim() || DEFAULT_URL;
  if (url) {
    const headersRaw = process.env.HTTP_SOURCE_HEADERS?.trim();
    const headers = headersRaw
      ? (JSON.parse(headersRaw) as Record<string, string>)
      : undefined;
    const res = await fetch(url, headers ? { headers } : undefined);
    if (!res.ok) throw new Error(`HTTP_SOURCE_URL fetch failed: ${res.status}`);
    return (await res.json()) as HttpTxtRoot;
  }
  throw new Error('No http source configured.');
}

async function tryReadApifoxProjectDefs(): Promise<Map<string, any>> {
  const p =
    process.env.APIFOX_PROJECT_FILE?.trim() || './openapi/TxToken.apifox.json';
  try {
    const raw = await readFile(p, 'utf8');
    const project = JSON.parse(raw) as unknown;
    const defs = extractDefinitionsFromApifoxProject(project);
    const schemes = extractSecuritySchemesFromApifoxProject(project);
    if (defs.size > 0) {
      console.log(`✅ Loaded ${defs.size} schema definitions from ${p}`);
    } else {
      console.log(`⚠ No schema definitions found in ${p}`);
    }
    if (schemes.size > 0) {
      console.log(`✅ Loaded ${schemes.size} security scheme(s) from ${p}`);
    } else {
      console.log(`⚠ No security schemes found in ${p}`);
    }
    return defs;
  } catch {
    console.log(`⚠ Apifox project file not found or unreadable: ${p}`);
    return new Map();
  }
}

async function tryReadApifoxProjectSecuritySchemes(): Promise<
  Map<number, { name: string; scheme: OpenApiSecuritySchemeObject }>
> {
  const p =
    process.env.APIFOX_PROJECT_FILE?.trim() || './openapi/TxToken.apifox.json';
  try {
    const raw = await readFile(p, 'utf8');
    const project = JSON.parse(raw) as unknown;
    return extractSecuritySchemesFromApifoxProject(project);
  } catch {
    return new Map();
  }
}

function buildSecurity(
  ep: HttpEndpoint,
  schemes: Map<number, { name: string; scheme: OpenApiSecuritySchemeObject }>
): {
  security?: Array<Record<string, string[]>>;
  securitySchemes?: Record<string, any>;
} {
  const usedSchemeIds =
    ep.securityScheme?.schemeGroups?.flatMap((g) => g.schemeIds ?? []) ?? [];

  const uniqueIds = Array.from(new Set(usedSchemeIds)).filter(
    (x) => typeof x === 'number'
  );

  const authType = (ep.auth?.type || '').toLowerCase();
  const needsAuthExplicit =
    authType === 'securityscheme' || ep.securityScheme?.required === true;

  // Some items in `http-apis` rely on inherited auth settings and may return `{}`.
  // Infer auth requirement from module + description conventions.
  const desc = (ep.description || '').trim();
  const isExplicitNoAuth = desc.includes('🔓') || desc.includes('无需鉴权');
  const isManagement = ep.moduleId === 6660656;
  const isAiModel = ep.moduleId === 6656265;

  const needsAuthInferred =
    !needsAuthExplicit &&
    !isExplicitNoAuth &&
    (isAiModel ||
      // management endpoints are mostly protected unless explicitly marked public
      isManagement);

  const needsAuth = needsAuthExplicit || needsAuthInferred;

  const idsToUse =
    uniqueIds.length > 0
      ? uniqueIds
      : needsAuth
        ? // prefer the canonical BearerAuth (571886) when available
          schemes.has(571886)
          ? [571886]
          : schemes.has(583570)
            ? [583570]
            : Array.from(schemes.keys())
        : [];

  if (!needsAuth || idsToUse.length === 0) return {};

  const securitySchemes: Record<string, any> = {};
  const securityObj: Record<string, string[]> = {};

  for (const id of idsToUse) {
    const entry = schemes.get(id);
    if (!entry) continue;
    securitySchemes[entry.name] = entry.scheme;
    securityObj[entry.name] = [];
  }

  if (Object.keys(securityObj).length === 0) return {};

  return { security: [securityObj], securitySchemes };
}

async function main() {
  const outRoot = process.env.OPENAPI_OUT_DIR?.trim() || './openapi/generated';

  // Clean old output to prevent stale files
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const defs = await tryReadApifoxProjectDefs();
  const securitySchemes = await tryReadApifoxProjectSecuritySchemes();
  const root = await readHttpSource();
  if (!root?.success || !Array.isArray(root.data)) {
    throw new Error(
      'Invalid http source: expected { success: true, data: [] }'
    );
  }

  let count = 0;
  const usedOperationIds = new Set<string>();

  for (const ep of root.data) {
    const group = groupByModuleId(ep.moduleId);
    const tags = (ep.tags && ep.tags.length > 0 ? ep.tags : ['default']).map(
      (t) => t || 'default'
    );
    const tagPathParts = tags[0].split('/').map(sanitizePathPart);

    const method = normalizeMethod(ep.method || 'get');
    const opBase =
      ep.operationId?.trim() ||
      `${method}-${ep.path}`.replace(/[{}]/g, '').replace(/\/+/g, '-');
    let operationId = slugify(opBase).replace(/-+/g, '-');
    if (usedOperationIds.has(operationId)) {
      operationId = `${operationId}-${ep.id}`;
    }
    usedOperationIds.add(operationId);

    const fileBase = `${method}-${slugify(ep.path)}-${operationId}-${ep.id}`;
    const fileName = `${sanitizePathPart(fileBase)}.json`;

    const outDir = path.join(outRoot, group, ...tagPathParts);
    await mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, fileName);

    const sec = buildSecurity(ep, securitySchemes);

    const doc = {
      openapi: '3.1.0',
      info: {
        title: ep.name || operationId,
        version: '1.0.0',
        description: ep.description || undefined,
      },
      servers: [{ url: DEFAULT_SERVER_URL }],
      tags: [{ name: tags[0] }],
      ...(sec.securitySchemes
        ? { components: { securitySchemes: sec.securitySchemes } }
        : {}),
      paths: {
        [ep.path]: {
          [method]: {
            tags,
            summary: ep.name || undefined,
            description: ep.description || undefined,
            operationId,
            parameters: [
              ...(ep.parameters?.path ?? []).map((p) =>
                toOpenApiParam(p, 'path')
              ),
              ...(ep.parameters?.query ?? []).map((p) =>
                toOpenApiParam(p, 'query')
              ),
              ...(ep.parameters?.header ?? []).map((p) =>
                toOpenApiParam(p, 'header')
              ),
              ...(ep.parameters?.cookie ?? []).map((p) =>
                toOpenApiParam(p, 'cookie')
              ),
            ],
            ...(buildRequestBody(ep, defs)
              ? { requestBody: buildRequestBody(ep, defs) }
              : {}),
            ...(sec.security ? { security: sec.security } : {}),
            responses: buildResponses(ep, defs),
          },
        },
      },
    };

    await writeFile(
      outFile,
      JSON.stringify(rewriteModelNames(doc), null, 2) + '\n',
      'utf8'
    );
    count++;
  }

  console.log(
    `✅ Generated ${count} per-endpoint OpenAPI files into ${outRoot}`
  );
  console.log('Tip: set HTTP_SOURCE_URL to override the default Apifox URL.');
}

main().catch((err) => {
  console.error('❌ Failed to generate OpenAPI from http source:', err);
  process.exit(1);
});
