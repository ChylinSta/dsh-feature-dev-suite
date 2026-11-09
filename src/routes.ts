import type { IncomingMessage, ServerResponse } from "node:http";
import { isTrustedRequest, readJsonObject, writeJson } from "./http.js";
import type { FeatureApi } from "./service.js";

export const API_PREFIX = "/api/dsh-feature-dev";

interface WebRoute {
  kind: "prefix";
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

export function makeFeatureDevRoutes(service: FeatureApi): WebRoute[] {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isTrustedRequest(req)) {
      writeJson(res, 403, { error: "This endpoint only answers same-origin requests from the local DSH page." });
      return;
    }
    const parsed = parseRequest(req);
    if (parsed === null) {
      writeJson(res, 400, { error: "Malformed request URL." });
      return;
    }
    try {
      await dispatch(service, req, res, parsed.path);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      const message = error instanceof Error ? error.message : "Feature Dev request failed.";
      writeJson(res, missing ? 404 : 400, { error: missing ? "Unknown run." : message });
    }
  };
  return [{ kind: "prefix", path: API_PREFIX, handler }];
}

function parseRequest(req: IncomingMessage): { path: string } | null {
  if (typeof req.url !== "string") return null;
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) return null;
    return { path: url.pathname.slice(API_PREFIX.length) || "/" };
  } catch {
    return null;
  }
}

async function dispatch(service: FeatureApi, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const method = req.method ?? "GET";
  if (pathname === "/runs" && method === "GET") {
    writeJson(res, 200, { runs: service.listRuns() });
    return;
  }
  if (pathname === "/runs" && method === "POST") {
    const body = await readJsonObject(req);
    if (body === null) {
      writeJson(res, 400, { error: "Expected a JSON object." });
      return;
    }
    writeJson(res, 201, await service.start(body));
    return;
  }
  const match = /^\/runs\/([^/]+)(?:\/(advance|approve|reject))?$/.exec(pathname);
  if (match === null) {
    writeJson(res, 404, { error: "Unknown Feature Dev route." });
    return;
  }
  const runId = decodeURIComponent(match[1] ?? "");
  const action = match[2];
  if (action === undefined && method === "GET") {
    writeJson(res, 200, { run: service.getStatus(runId) });
    return;
  }
  if (method !== "POST" || action === undefined) {
    writeJson(res, 405, { error: "Method not allowed." });
    return;
  }
  const body = await readJsonObject(req);
  if (body === null) {
    writeJson(res, 400, { error: "Expected a JSON object." });
    return;
  }
  if (action === "advance") {
    writeJson(res, 200, await service.advance(runId));
    return;
  }
  if (action === "approve") {
    writeJson(res, 200, await service.approve(runId, body.note ?? body.reason));
    return;
  }
  writeJson(res, 200, await service.reject(runId, body.reason));
}
