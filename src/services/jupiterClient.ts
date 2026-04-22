import { JUPITER_API_KEY, JUPITER_API_URL } from "../config/env";
import { ErrorType, SwapError } from "../types/errors";

const API_ROOT = JUPITER_API_URL;
const LITE_ROOT = "https://lite-api.jup.ag";

/** Recognised path prefixes and whether they require an API key. */
type PathPrefix = "/swap/" | "/tokens/" | "/ultra/";

function getPathPrefix(path: string): PathPrefix {
  if (path.startsWith("/swap/")) return "/swap/";
  if (path.startsWith("/tokens/")) return "/tokens/";
  if (path.startsWith("/ultra/")) return "/ultra/";
  throw new Error(
    `[jupiterClient] Unrecognised path prefix for "${path}". ` +
      `Expected one of: /swap/*, /tokens/*, /ultra/*`,
  );
}

/**
 * Resolves the base URL for a given path, enforcing the key-optional policy:
 * - /swap/*  — key required; throws ConfigError when absent.
 * - /tokens/* and /ultra/* — key present → api.jup.ag; absent → lite-api.jup.ag.
 *
 * Throws a dev-time error for unrecognised path prefixes.
 */
function resolveBaseUrl(path: string): string {
  const prefix = getPathPrefix(path); // throws for unknown prefix

  if (prefix === "/swap/") {
    if (!JUPITER_API_KEY) {
      throw new SwapError(
        ErrorType.ConfigError,
        "Jupiter API key required for swap execution. Get one at https://portal.jup.ag",
        undefined,
        false,
      );
    }
    return API_ROOT;
  }

  // /tokens/* and /ultra/*
  return JUPITER_API_KEY ? API_ROOT : LITE_ROOT;
}

function buildHeaders(baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (JUPITER_API_KEY && baseUrl === API_ROOT) {
    headers["x-api-key"] = JUPITER_API_KEY;
  }
  return headers;
}

async function parseBody<T>(response: Response, url: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new SwapError(
      ErrorType.UnknownError,
      `Failed to parse response from ${url}`,
      response.status,
      false,
      { url },
    );
  }
}

async function handleResponse<T>(response: Response, url: string): Promise<T> {
  if (response.ok) {
    return parseBody<T>(response, url);
  }

  const retryable = response.status >= 500 || response.status === 429;
  if (retryable) {
    throw new SwapError(
      ErrorType.NetworkError,
      `Request failed with status ${response.status}`,
      response.status,
      true,
      { url, httpStatus: response.status },
    );
  }

  throw new SwapError(
    ErrorType.UnknownError,
    `Request failed with status ${response.status}`,
    response.status,
    false,
    { url, httpStatus: response.status },
  );
}

function handleFetchError(err: unknown, url: string): never {
  if (err instanceof DOMException && err.name === "AbortError") {
    throw err;
  }
  throw new SwapError(
    ErrorType.NetworkError,
    "Network error. Check your connection.",
    undefined,
    true,
    { url, fetchError: String(err) },
  );
}

export const jupiterClient = {
  async get<T>(
    path: string,
    params?: Record<string, string | number>,
    signal?: AbortSignal,
  ): Promise<T> {
    const base = resolveBaseUrl(path); // may throw ConfigError synchronously
    const headers = buildHeaders(base);

    const qs = params
      ? "?" + new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ).toString()
      : "";
    const url = `${base}${path}${qs}`;

    let response: Response;
    try {
      response = await fetch(url, { headers, signal });
    } catch (err) {
      handleFetchError(err, url);
    }

    return handleResponse<T>(response, url);
  },

  async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const base = resolveBaseUrl(path); // may throw ConfigError synchronously
    const headers: Record<string, string> = {
      ...buildHeaders(base),
      "Content-Type": "application/json",
    };

    const url = `${base}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      handleFetchError(err, url);
    }

    return handleResponse<T>(response, url);
  },
};
