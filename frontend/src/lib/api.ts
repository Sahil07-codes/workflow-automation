export type ApiResult<T> = {
  data: T;
  status: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

export const isApiConfigured = Boolean(baseUrl);

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!baseUrl) return Promise.resolve(false);
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  if (!baseUrl) {
    throw new ApiError("The frontend API is not configured. Set VITE_API_BASE_URL to your backend API base URL.");
  }

  const requestOptions: RequestInit = {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  };
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, requestOptions);
  } catch {
    throw new ApiError(
      `Could not reach the API at ${baseUrl}. Make sure the API is running, then try again.`,
    );
  }

  if (response.status === 401 && path !== "/auth/refresh" && path !== "/auth/login") {
    try {
      if (await refreshSession()) {
        response = await fetch(`${baseUrl}${path}`, requestOptions);
      }
    } catch {
      // Preserve the original unauthorized response for the caller to handle.
    }
  }

  if (!response.ok) {
    let message = `The service returned an error (${response.status}).`;
    let requestId: string | undefined;
    try {
      const body: unknown = await response.json();
      if (isRecord(body)) {
        if (typeof body.message === "string") message = body.message;
        if (typeof body.detail === "string") message = body.detail;
        if (typeof body.requestId === "string") requestId = body.requestId;
      }
    } catch {
      // Non-JSON error responses use the safe status message above.
    }
    throw new ApiError(message, response.status, requestId);
  }

  if (response.status === 204) return { data: undefined as T, status: response.status };
  const data: T = await response.json();
  return { data, status: response.status };
}

export function resourceUrl(resource: string, params: Record<string, string>): string {
  let resolved = resource;
  for (const [key, value] of Object.entries(params)) {
    resolved = resolved.replace(`:${key}`, encodeURIComponent(value));
  }
  return resolved;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getDisplayableData(value: unknown): Array<{ label: string; value: string }> {
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item, index) => ({
      label: `Record ${index + 1}`,
      value: isRecord(item) ? Object.entries(item).filter(([key]) => !isSensitiveKey(key)).map(([key, itemValue]) => `${humanize(key)}: ${displayValue(itemValue)}`).join(" · ") : displayValue(item),
    }));
  }
  if (!isRecord(value)) return value == null ? [] : [{ label: "Response", value: displayValue(value) }];

  const entries = Object.entries(value)
    .filter(([key, item]) => !isSensitiveKey(key) && item !== null && item !== undefined && typeof item !== "object")
    .slice(0, 12)
    .map(([key, item]) => ({ label: humanize(key), value: displayValue(item) }));

  const collection = Object.entries(value).find(([, item]) => Array.isArray(item));
  if (collection && entries.length < 12) {
    (collection[1] as unknown[]).slice(0, 5).forEach((item, index) => {
      entries.push({
        label: `${humanize(collection[0])} ${index + 1}`,
        value: isRecord(item) ? Object.entries(item).filter(([key]) => !isSensitiveKey(key)).map(([key, child]) => `${humanize(key)}: ${displayValue(child)}`).join(" · ") : displayValue(item),
      });
    });
  }
  return entries;
}

function displayValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "Available";
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|password|cookie|authorization|credential|raw.?payload|embedding|session/i.test(key);
}

export function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
