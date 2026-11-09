import { createServer } from "node:http";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { athleteId, newcomerId, previewData } from "./dev-preview-data.mjs";

const WRITABLE = new Set([
  "profiles", "coach_reports", "planned_tests", "run_feedback", "activity_feedback",
  "session_activity_links", "activities", "runs", "health_checkins", "today_checks",
]);
const QUERY_OPTIONS = new Set(["select", "order", "limit", "offset", "on_conflict", "or"]);

function match(row, col, filter) {
  if (filter.startsWith("not.")) return !match(row, col, filter.slice(4));
  const at = filter.indexOf(".");
  const op = filter.slice(0, at);
  const value = filter.slice(at + 1);
  const cell = row[col] ?? null;
  const item = String(cell);
  switch (op) {
    case "eq": return item === value;
    case "neq": return item !== value;
    case "is": return item === value;
    case "gte": return cell !== null && (typeof cell === "number" ? cell >= Number(value) : item >= value);
    case "gt": return cell !== null && (typeof cell === "number" ? cell > Number(value) : item > value);
    case "lte": return cell !== null && (typeof cell === "number" ? cell <= Number(value) : item <= value);
    case "lt": return cell !== null && (typeof cell === "number" ? cell < Number(value) : item < value);
    case "in": return value.slice(1, -1).split(",").some(v => v.replace(/^"|"$/g, "") === item);
    case "ilike": return item.toLowerCase().includes(value.replaceAll("%", "").toLowerCase());
    default: return false;
  }
}

function filterRows(rows, params) {
  return rows.filter(row => [...params].every(([key, value]) => {
    if (key === "or") return value.slice(1, -1).split(",").some(term => {
      const at = term.indexOf(".");
      return at > 0 && match(row, term.slice(0, at), term.slice(at + 1));
    });
    return QUERY_OPTIONS.has(key) || match(row, key, value);
  }));
}

async function readJSON(request) {
  let content = "";
  for await (const chunk of request) {
    content += chunk;
    if (content.length > 100_000) throw new Error("Request too large");
  }
  return content ? JSON.parse(content) : null;
}

export async function startPreviewBackend(appOrigin) {
  const data = previewData();
  const secret = randomBytes(32);
  const adminKey = randomBytes(24).toString("hex");
  const anonKey = randomBytes(24).toString("hex");
  const sessions = new Map();
  const refreshSessions = new Map();
  const emptyProfile = { ...data.profiles.find(profile => profile.id === newcomerId) };
  const users = new Map([["atleta", athleteId], ["novo", newcomerId]].map(([scenario, id]) => [scenario, {
    id, aud: "authenticated", role: "authenticated", email: `${scenario}@limiar.example`,
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
    created_at: new Date().toISOString(),
  }]));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const { pathname, searchParams } = url;
    const method = req.method;
    res.setHeader("cache-control", "no-store");
    if (req.headers.origin === appOrigin) {
      res.setHeader("access-control-allow-origin", appOrigin);
      res.setHeader("access-control-allow-methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] || "authorization, apikey, content-type");
      res.setHeader("access-control-expose-headers", "content-range");
    }
    const send = (status, payload) => {
      res.statusCode = status;
      if (payload === undefined || method === "HEAD") { res.end(); return; }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
    };
    const failure = (status, message) => send(status, { code: String(status), error_code: String(status), message });
    if (method === "OPTIONS") return send(204);
    if (req.headers.apikey !== anonKey && req.headers.apikey !== adminKey) return failure(401, "Invalid preview key");

    try {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
      const user = sessions.get(token);
      if (pathname === "/auth/v1/user" && method === "GET") {
        return user ? send(200, user) : failure(401, "Preview session missing");
      }
      if (pathname === "/auth/v1/logout" && method === "POST") {
        sessions.delete(token);
        return send(204);
      }
      if (pathname === "/auth/v1/token" && method === "POST") {
        const body = await readJSON(req);
        const scenario = body?.email?.endsWith("@limiar.example") ? body.email.split("@")[0] : null;
        const refreshing = searchParams.get("grant_type") === "refresh_token";
        let account = refreshing
          ? refreshSessions.get(body?.refresh_token) : body?.password === "limiar-preview" ? users.get(scenario) : null;
        if (!account) return failure(401, "Invalid preview scenario");
        if (refreshing) refreshSessions.delete(body.refresh_token);
        if (!refreshing && scenario === "novo") {
          const previousId = account.id;
          // A new account also gets a fresh browser draft key. Keep the other
          // scenario untouched and discard only the previous onboarding fixture.
          data.profiles = data.profiles.filter(profile => profile.id !== previousId);
          for (const table of WRITABLE) {
            if (table !== "profiles" && Object.hasOwn(data, table)) {
              data[table] = data[table].filter(row => row.user_id !== previousId);
            }
          }
          for (const sessionsByToken of [sessions, refreshSessions]) {
            for (const [key, owner] of sessionsByToken) {
              if (owner.id === previousId) sessionsByToken.delete(key);
            }
          }
          account = { ...account, id: randomUUID() };
          data.profiles.push({ ...emptyProfile, id: account.id });
          users.set(scenario, account);
        }
        const iat = Math.floor(Date.now() / 1000);
        const expiresIn = 24 * 60 * 60;
        const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
        const payload = encode({ sub: account.id, aud: "authenticated", role: "authenticated", iat, exp: iat + expiresIn, jti: randomUUID() });
        const unsigned = encode({ alg: "HS256", typ: "JWT" }) + "." + payload;
        const access = unsigned + "." + createHmac("sha256", secret).update(unsigned).digest("base64url");
        const refresh = randomUUID();
        sessions.set(access, account);
        refreshSessions.set(refresh, account);
        return send(200, { access_token: access, refresh_token: refresh, expires_in: expiresIn, token_type: "bearer", user: account });
      }

      const table = /^\/rest\/v1\/([a-z][a-z0-9_]*)$/.exec(pathname)?.[1];
      if (!table) return failure(404, "Not implemented in local preview");
      if (!user && token !== adminKey) return failure(401, "Preview session missing");
      const rows = Object.hasOwn(data, table) ? data[table] : [];
      let result = filterRows(rows, searchParams);
      const reading = method === "GET" || method === "HEAD";
      if (!reading) {
        if (!WRITABLE.has(table)) return failure(405, "Read-only preview table");
        if (!Object.hasOwn(data, table)) data[table] = rows;
        const canMutate = row => token === adminKey || (table === "profiles" ? row.id : row.user_id) === user?.id;
        const patch = await readJSON(req);
        if (method === "PATCH" && patch && !Array.isArray(patch)) {
          result = result.filter(canMutate).map(row => Object.assign(row, patch));
        } else if (method === "DELETE") {
          result = result.filter(canMutate);
          data[table] = rows.filter(row => !result.includes(row));
        } else if (method === "POST" && patch) {
          const keys = searchParams.get("on_conflict")?.split(",") ?? ["id"];
          result = (Array.isArray(patch) ? patch : [patch]).map(entry => {
            if (!canMutate(entry)) throw new Error("Invalid preview record owner");
            const existing = rows.find(row => keys.every(key => entry[key] != null && row[key] === entry[key]));
            if (existing) return Object.assign(existing, entry);
            const row = { id: randomUUID(), created_at: new Date().toISOString(), deleted_at: null, ...entry };
            rows.push(row);
            return row;
          });
        } else return failure(405, "Unsupported preview operation");
        if (!req.headers.prefer?.includes("return=representation")) return send(204);
      }
      const count = result.length;
      const orders = (searchParams.get("order") ?? "").split(",").filter(Boolean);
      if (orders.length) {
        result.sort((a, b) => {
          for (const entry of orders) {
            const [col, direction] = entry.split(".");
            if (a[col] === b[col]) continue;
            return (a[col] < b[col] ? -1 : 1) * (direction === "desc" ? -1 : 1);
          }
          return 0;
        });
      }
      const offset = Number(searchParams.get("offset")) || 0;
      const limit = searchParams.get("limit");
      result = result.slice(offset, limit == null ? undefined : offset + Number(limit));
      if (req.headers.prefer?.includes("count=")) {
        res.setHeader("content-range", result.length ? `${offset}-${offset + result.length - 1}/${count}` : `*/${count}`);
      }
      if (req.headers.accept?.includes("vnd.pgrst.object")) {
        if (result.length !== 1) return send(406, {
          code: "PGRST116", details: `The result contains ${result.length} rows`, message: "Cannot coerce to a single JSON object",
        });
        return send(200, result[0]);
      }
      return send(200, result);
    } catch {
      return failure(400, "Invalid request to the local preview service");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}`, anonKey, adminKey };
}
