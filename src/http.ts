import type { IncomingMessage, ServerResponse } from "node:http";
import { isIPv4, isIPv6 } from "node:net";

export const JSON_BODY_MAX_BYTES = 32 * 1024;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined || address === "") return false;
  const normalized = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  if (isIPv4(normalized)) {
    const [a, b] = normalized.split(".").map((part) => Number(part));
    return a === 127 && b !== undefined && b >= 0 && b <= 255;
  }
  if (isIPv6(normalized)) return normalized === "::1";
  return false;
}

export function isLoopbackRequest(req: IncomingMessage): boolean {
  return isLoopbackAddress(req.socket?.remoteAddress ?? undefined);
}

export function isSameOriginRequest(req: IncomingMessage): boolean {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const host = req.headers.host;
  if (host === undefined || host === "") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return req.headers["sec-fetch-site"] === "same-origin";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Desktop proxies loopback calls without Origin or Sec-Fetch-Site, and keeps the session cookie. */
export function isDesktopShellRequest(req: IncomingMessage): boolean {
  if (req.headers.origin !== undefined) return false;
  if (req.headers["sec-fetch-site"] !== undefined) return false;
  const cookie = req.headers.cookie;
  return cookie !== undefined && cookie !== "";
}

export function isTrustedRequest(req: IncomingMessage): boolean {
  return isLoopbackRequest(req) && (isSameOriginRequest(req) || isDesktopShellRequest(req));
}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...JSON_HEADERS, "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

export async function readJsonObject(req: IncomingMessage, maxBytes = JSON_BODY_MAX_BYTES): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        req.destroy();
        return null;
      }
      chunks.push(buffer);
    }
    if (chunks.length === 0) return {};
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
