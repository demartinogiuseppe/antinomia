// Antinomia — local backend reachability ping (with short-TTL cache).
// Extracted from main.ts (refactor v1.5).

import { requestUrl } from "obsidian";

interface PingResult {
  ok: boolean;
  error?: string;
}
const _pingCache = new Map<string, PingResult & { expiresAt: number }>();
const PING_TIMEOUT_MS = 2000;
const PING_TTL_OK_MS = 30_000;
const PING_TTL_FAIL_MS = 5_000;

export async function pingLocalBackend(baseUrl: string): Promise<PingResult> {
  // Strip trailing slash AND a trailing `/v1` (common in OpenAI-compat base
  // URLs like `http://localhost:1234/v1`) so we don't end up requesting
  // `/v1/v1/models` — LM Studio used to log this as an error before being
  // lenient about it.
  const cleanBase = baseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
  const cached = _pingCache.get(cleanBase);
  if (cached && Date.now() < cached.expiresAt) {
    return { ok: cached.ok, error: cached.error };
  }

  const url = `${cleanBase}/v1/models`;
  let result: PingResult;

  try {
    const u = new URL(url);
    let nodeMod: any = null;
    try {
      nodeMod = (window as any).require
        ? (window as any).require(u.protocol === "https:" ? "https" : "http")
        : null;
    } catch {
      nodeMod = null;
    }

    if (nodeMod) {
      result = await new Promise<PingResult>((resolve) => {
        let resolved = false;
        const done = (r: PingResult) => {
          if (resolved) return;
          resolved = true;
          resolve(r);
        };
        const req = nodeMod.request(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === "https:" ? 443 : 80),
            path: u.pathname + u.search,
            method: "GET",
            timeout: PING_TIMEOUT_MS,
          },
          (res: any) => {
            res.on("data", () => undefined);
            res.on("end", () => undefined);
            // Any HTTP response = server alive (even 401/404)
            done({ ok: true });
          }
        );
        req.on("error", (e: Error) => done({ ok: false, error: e.message }));
        req.on("timeout", () => {
          try {
            req.destroy();
          } catch {
            /* ignore */
          }
          done({ ok: false, error: "timeout" });
        });
        req.end();
      });
    } else {
      try {
        const r = await requestUrl({ url, method: "GET", throw: false });
        result = { ok: r.status > 0 && r.status < 600 };
      } catch (e) {
        result = { ok: false, error: (e as Error).message };
      }
    }
  } catch (e) {
    result = { ok: false, error: (e as Error).message };
  }

  const ttl = result.ok ? PING_TTL_OK_MS : PING_TTL_FAIL_MS;
  _pingCache.set(cleanBase, { ...result, expiresAt: Date.now() + ttl });
  return result;
}
