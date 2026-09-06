// Phần VIẾT TAY (không generated) của @ecommerce/contracts:
//   - fetch wrapper + ApiErrorClient (mirror RFC 7807 problem+json của common-lib ApiError)
//   - type helpers suy ra args/response từ `operations` của schema generated
//   - createServiceClient: dựng client typed từ route map (operationId -> [method, path, headerParams?])
// Framework-portable (D16): KHÔNG browser API ở module top-level — crypto/fetch chỉ
// được chạm trong hàm, qua globalThis, luôn có try/catch fallback.

export interface ApiClientOptions {
  /** Origin của service, vd "http://localhost:8080" — không có "/" cuối. */
  baseURL: string;
  /** Trả access token hiện tại — có token → tự gắn `Authorization: Bearer`. */
  getToken?: () => string | null | undefined;
  /** Headers tĩnh gắn mọi request (vd `X-API-Key` cho partner-api). */
  headers?: Record<string, string>;
  /** Inject fetch (test / runtime không có global fetch). Mặc định globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

/** 1 phần tử trong `errors[]` — mirror common-lib ApiError. */
export interface ApiFieldError {
  field?: string;
  message?: string;
}

/** Shape RFC 7807 problem+json — mirror backend shared common-lib `ApiError`. */
export interface ApiErrorShape {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  timestamp?: string;
  requestId?: string;
  errors?: ApiFieldError[];
}

/** Error do client ném khi service trả non-2xx — fields mirror ApiError. */
export class ApiErrorClient extends Error {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly timestamp?: string;
  readonly requestId?: string;
  readonly errors: ApiFieldError[];

  constructor(error: ApiErrorShape, fallbackStatus: number, fallbackStatusText: string) {
    super(error.detail ?? error.title ?? fallbackStatusText);
    this.name = 'ApiErrorClient';
    this.type = error.type ?? 'about:blank';
    this.title = error.title ?? fallbackStatusText;
    this.status = error.status ?? fallbackStatus;
    this.detail = error.detail;
    this.instance = error.instance;
    this.timestamp = error.timestamp;
    this.requestId = error.requestId;
    this.errors = error.errors ?? [];
  }
}

/**
 * Định nghĩa 1 operation runtime: [method, pathTemplate, headerParams?].
 * `headerParams` liệt kê tên param phải đi vào header (không query) — khớp spec.
 */
export type RouteDef = readonly [method: string, pathTemplate: string, headerParams?: readonly string[]];
export type RouteMap = Record<string, RouteDef>;

type RequestArgs = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Sinh X-Request-Id — crypto.randomUUID chỉ trong hàm + try/catch (D16). */
function newRequestId(): string | undefined {
  try {
    const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : undefined;
  } catch {
    return undefined;
  }
}

function pathParamNames(pathTemplate: string): Set<string> {
  const names = new Set<string>();
  for (const match of pathTemplate.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (name) names.add(name);
  }
  return names;
}

function buildRequestUrl(
  baseURL: string,
  pathTemplate: string,
  pathParams: Record<string, unknown>,
  query: ReadonlyArray<readonly [string, unknown]>,
): string {
  const path = pathTemplate.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathParams[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing path param "${name}" for ${pathTemplate}`);
    }
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [key, value] of query) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      // mảng query → form comma style (vd inventory ?variantIds=a,b,c)
      if (value.length > 0) search.append(key, value.map(String).join(','));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return `${baseURL.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}`;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

/** Thực thi 1 operation: build URL/headers/body → fetch → parse hoặc throw ApiErrorClient. */
export async function executeRequest(
  opts: ApiClientOptions,
  route: RouteDef,
  args: RequestArgs,
): Promise<unknown> {
  const [method, pathTemplate, headerParams = []] = route;
  const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
  const used = pathParamNames(pathTemplate);

  const headers: Record<string, string> = { ...opts.headers };
  const pathParams: Record<string, unknown> = {};
  const restArgs: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(args)) {
    if (used.has(key)) {
      pathParams[key] = value;
    } else if (headerParams.includes(key)) {
      if (value !== undefined && value !== null) headers[key] = String(value);
    } else {
      restArgs.push([key, value]);
    }
  }
  const token = opts.getToken?.();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const requestId = newRequestId();
  if (requestId) headers['X-Request-Id'] = requestId;

  // Body: POST/PUT/PATCH → các field flat còn lại là JSON body (hoặc multipart
  // khi có giá trị Blob/File — uploadAdminImage). GET/DELETE/HEAD → query string.
  let bodyInit: FormData | string | undefined;
  if (isBodyMethod) {
    const explicit = restArgs.find(([key]) => key === 'body')?.[1];
    if (explicit !== undefined) {
      bodyInit = typeof FormData !== 'undefined' && explicit instanceof FormData ? explicit : JSON.stringify(explicit);
      headers['Content-Type'] ??= 'application/json';
    } else if (restArgs.length > 0) {
      if (restArgs.some(([, v]) => isBlob(v))) {
        const form = new FormData();
        for (const [key, value] of restArgs) {
          if (value === undefined || value === null) continue;
          if (isBlob(value)) form.append(key, value);
          else form.append(key, String(value));
        }
        bodyInit = form; // multipart — runtime tự set Content-Type kèm boundary
      } else {
        bodyInit = JSON.stringify(Object.fromEntries(restArgs));
        headers['Content-Type'] ??= 'application/json';
      }
    }
  }
  const query = isBodyMethod ? [] : restArgs;

  const url = buildRequestUrl(opts.baseURL, pathTemplate, pathParams, query);
  const doFetch = opts.fetchImpl ?? ((input: string | URL | globalThis.Request, init?: RequestInit) => fetch(input, init));
  const response = await doFetch(url, { method, headers, body: bodyInit });

  // Đọc 1 lần dạng buffer để giữ nguyên binary (pdf) khi content-type không phải JSON
  const buffer = await response.arrayBuffer();
  if (!response.ok) {
    let parsed: unknown;
    try {
      const text = new TextDecoder().decode(buffer);
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined; // body không phải JSON → dùng fallback shape
    }
    const shape: ApiErrorShape = isRecord(parsed) ? (parsed as ApiErrorShape) : {};
    throw new ApiErrorClient(shape, response.status, response.statusText || 'Request failed');
  }
  if (response.status === 204 || buffer.byteLength === 0) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  }
  return new Blob([buffer], { type: contentType || 'application/octet-stream' });
}

/** Dựng client từ route map — keys khớp operationId, caller cast về type cụ thể. */
export function createServiceClient<T>(opts: ApiClientOptions, routes: RouteMap): T {
  const methods: Record<string, (args?: RequestArgs) => Promise<unknown>> = {};
  for (const [operationId, route] of Object.entries(routes)) {
    methods[operationId] = (args = {}) => executeRequest(opts, route, args);
  }
  return methods as T;
}

// ── Type helpers: suy args/response từ `operations` của schema generated ─────

type RawParams<Op> = Op extends { parameters: infer P } ? NonNullable<P> : Record<never, never>;

type PickParamGroup<P, K extends 'path' | 'query' | 'header'> =
  P extends { [G in K]?: infer V } ? ([NonNullable<V>] extends [never] ? Record<never, never> : NonNullable<V>) : Record<never, never>;

export type PathParamsOf<Op> = PickParamGroup<RawParams<Op>, 'path'>;
export type QueryParamsOf<Op> = PickParamGroup<RawParams<Op>, 'query'>;
export type HeaderParamsOf<Op> = PickParamGroup<RawParams<Op>, 'header'>;

/** Request body JSON; content khác (multipart/pdf) → unknown; không có body → undefined. */
export type BodyOf<Op> =
  Op extends { requestBody: infer RB }
    ? NonNullable<RB> extends { content: infer C }
      ? (C extends { 'application/json': infer B } ? B : unknown)
      : unknown
    : undefined;

type ResponseBody<T> = T extends { content: infer C } ? (C extends { 'application/json': infer B } ? B : unknown) : undefined;

type SuccessResponses<R> = { [K in Extract<keyof R, 200 | 201 | 202 | 206 | '200' | '201' | '202' | '206'>]: R[K] };

/** Union body JSON của mọi response 2xx; op chỉ có 204 → void. */
export type SuccessOf<Op> =
  Op extends { responses: infer R }
    ? SuccessResponses<R> extends infer S
      ? [keyof S] extends [never]
        ? void
        : ResponseBody<S[keyof S]>
      : never
    : unknown;

type BodyArg<Op> = BodyOf<Op> extends object ? BodyOf<Op> : { body?: BodyOf<Op> };

/** Args flat 1 method client: {...pathParams, ...queryParams, ...headerParams, ...bodyFields}. */
export type OpArgs<Op> = PathParamsOf<Op> & QueryParamsOf<Op> & HeaderParamsOf<Op> & BodyArg<Op>;

export type ServiceMethod<Op> = (args: OpArgs<Op>) => Promise<SuccessOf<Op>>;
