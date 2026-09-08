import { readFileSync } from "node:fs";
import path from "node:path";

const runtimeDirectory = path.resolve(process.env.FLOW_LOCAL_DIRECTORY ?? path.resolve(import.meta.dirname, "../../../.artifacts/flow-local"));
const base = process.env.FLOW_BASE_URL ?? "http://127.0.0.1:8787";
const route = process.argv[2] ?? "/diagnostics";
const body = process.argv[3];
if (!/^\/(diagnostics|healthz|runs(?:\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?:\/(?:cancel|diagnostics))?)?)$/.test(route))
  throw new Error("用法：flow-local-client.mjs /diagnostics 或 /runs [JSON请求体]");
if (body !== undefined) JSON.parse(body);
const token = readFileSync(path.join(runtimeDirectory, "secrets/http-token"), "utf8").trim();
try {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body, signal: AbortSignal.timeout(10000),
  });
  console.log(JSON.stringify({ status: response.status, body: await response.json() }, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch {
  console.error("FLOW_HTTP_REQUEST_FAILED");
  process.exitCode = 1;
}
