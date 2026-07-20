const express = require("express");
const helmet = require("helmet");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_API_TOKEN = process.env.API_TOKEN || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 1209600);
const CLAIM_TTL_SECONDS = Number(process.env.CLAIM_TTL_SECONDS || 300);
const ALLOWED_FACTION_ID = Number(process.env.ALLOWED_FACTION_ID || 56966);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://www.torn.com";

for (const key of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be present and at least 32 characters.");
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PGPOOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function b64(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function sign(encoded) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
}
function issueSession(player) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(player.playerId),
    name: player.playerName,
    factionId: ALLOWED_FACTION_ID,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
  const encoded = b64(payload);
  return { token: `${encoded}.${sign(encoded)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, suppliedSig] = token.split(".");
  if (!encoded || !suppliedSig) return null;
  const expectedSig = sign(encoded);
  const supplied = Buffer.from(suppliedSig);
  const expected = Buffer.from(expectedSig);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.name || Number(payload.factionId) !== ALLOWED_FACTION_ID || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
function requireSession(req, res, next) {
  const match = (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const session = verifyToken(match?.[1] || "");
  if (!session) return res.status(401).json({ success: false, error: "invalid_session" });
  req.session = session;
  next();
}
function requireAdmin(req, res, next) {
  if (!ADMIN_API_TOKEN || (req.get("authorization") || "") !== `Bearer ${ADMIN_API_TOKEN}`) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  next();
}

// Session-based admin check — player ID must be in ADMIN_PLAYER_IDS
const ADMIN_PLAYER_IDS = new Set(["3647423","3917106","3658650","3855001","3926412","4152155","4157019"]);
function requireSessionAdmin(req, res, next) {
  const match = (req.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const session = verifyToken(match?.[1] || "");
  if (!session) return res.status(401).json({ success: false, error: "invalid_session" });
  if (!ADMIN_PLAYER_IDS.has(String(session.sub))) {
    return res.status(403).json({ success: false, error: "admin_only" });
  }
  req.session = session;
  next();
}

// Cache verified Torn user results keyed by API key — 5 min TTL.
// Prevents burning 2 Torn API calls per /auth when users re-authenticate
// frequently (e.g. rapid page navigation, session expiry retries).
const tornVerifyCache = new Map();
const TORN_VERIFY_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchTornEndpoint(path, apiKey) {
  const url = new URL(`https://api.torn.com/v2${path}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("comment", "TWI_Faction_Calls");
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "TWI-Faction-Calls/1.0" },
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    console.error(`Torn API request failed for ${path}:`, error.message);
    return { ok: false, status: 503, error: "torn_api_unavailable" };
  }
  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, status: 502, error: "invalid_torn_response" };
  }
  if (data.error) {
    return { ok: false, status: 401, error: "torn_api_error", tornCode: data.error.code, tornMessage: data.error.error };
  }
  return { ok: true, data };
}

async function verifyTornUser(apiKey) {
  const key = String(apiKey || "").trim();
  if (key.length !== 16) return { ok: false, status: 400, error: "invalid_api_key_format" };

  // Return cached result if still fresh — avoids burning Torn API quota on repeated auths
  const cached = tornVerifyCache.get(key);
  if (cached && Date.now() - cached.ts < TORN_VERIFY_CACHE_TTL_MS) {
    return cached.result;
  }

  const [basicResult, factionResult] = await Promise.all([
    fetchTornEndpoint("/user/basic", key),
    fetchTornEndpoint("/user/faction", key)
  ]);
  if (!basicResult.ok) return basicResult;
  if (!factionResult.ok) return factionResult;
  const basic = basicResult.data;
  const faction = factionResult.data;
  const playerId = String(basic.id ?? basic.player_id ?? basic.profile?.id ?? "");
  const playerName = String(basic.name ?? basic.profile?.name ?? `Player ${playerId}`);
  const factionId = Number(faction.faction_id ?? faction.id ?? faction.faction?.id ?? faction.faction?.faction_id ?? 0);
  if (!playerId) {
    console.error("Unable to identify Torn player:", JSON.stringify(basic));
    return { ok: false, status: 502, error: "invalid_torn_user_response" };
  }
  if (factionId !== ALLOWED_FACTION_ID) return { ok: false, status: 403, error: "wrong_faction", factionId };
  const result = { ok: true, playerId, playerName, factionId };
  // Cache only successful verifications — don't cache errors (key typos, wrong faction etc.)
  tornVerifyCache.set(key, { result, ts: Date.now() });
  return result;
}

async function removeExpired(client = pool) {
  await client.query("DELETE FROM torn_target_calls WHERE expires_at <= NOW()");
}

async function initialiseDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS torn_target_calls (
    target_id BIGINT PRIMARY KEY,
    target_name VARCHAR(64) NOT NULL,
    called_by_id BIGINT NOT NULL,
    called_by_name VARCHAR(64) NOT NULL,
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    priority BOOLEAN NOT NULL DEFAULT FALSE,
    assist_requested BOOLEAN NOT NULL DEFAULT FALSE
  )`);
  await pool.query(`ALTER TABLE torn_target_calls ADD COLUMN IF NOT EXISTS priority BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE torn_target_calls ADD COLUMN IF NOT EXISTS assist_requested BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS torn_target_calls_expires_at_idx ON torn_target_calls (expires_at)`);

  // ── Bonus assignments table ──────────────────────────────────────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS chain_bonus_assignments (
    bonus_number  INTEGER PRIMARY KEY,
    player_id     BIGINT NOT NULL,
    player_name   VARCHAR(64) NOT NULL,
    assigned_by   VARCHAR(64) NOT NULL,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

const callSelect = `SELECT
  target_id::text AS "targetId",
  target_name AS "targetName",
  called_by_id::text AS "calledById",
  called_by_name AS "calledByName",
  called_at AS "calledAt",
  expires_at AS "expiresAt",
  priority AS "priority",
  assist_requested AS "assistRequested"
FROM torn_target_calls`;

// ── Health / readiness ──────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ready" }); }
  catch (error) { console.error("Readiness failed:", error.message); res.status(503).json({ status: "not_ready" }); }
});

// ── Auth ────────────────────────────────────────────────────────────────────

app.post("/api/v1/auth", async (req, res) => {
  const verified = await verifyTornUser(req.body?.apiKey);
  if (!verified.ok) return res.status(verified.status).json({ success: false, ...verified });
  const session = issueSession(verified);
  res.json({ success: true, sessionToken: session.token, expiresAt: session.expiresAt,
    player: { id: verified.playerId, name: verified.playerName, factionId: verified.factionId } });
});
app.get("/api/v1/session", requireSession, (req, res) => {
  res.json({ success: true, player: { id: req.session.sub, name: req.session.name, factionId: req.session.factionId },
    expiresAt: new Date(req.session.exp * 1000).toISOString() });
});

// ── Target calls ────────────────────────────────────────────────────────────

app.get("/api/v1/calls", requireSession, async (_req, res) => {
  try {
    await removeExpired();
    const result = await pool.query(`${callSelect} ORDER BY priority DESC, assist_requested DESC, called_at ASC`);
    res.json({ success: true, calls: result.rows });
  } catch (error) { console.error("GET calls failed:", error); res.status(500).json({ success: false, error: "database_error" }); }
});
app.post("/api/v1/calls", requireSession, async (req, res) => {
  const { targetId, targetName, priority = false, assistRequested = false, expiresAt } = req.body || {};
  if (!/^\d+$/.test(String(targetId || "")) || !String(targetName || "").trim() || typeof priority !== "boolean" || typeof assistRequested !== "boolean") {
    return res.status(400).json({ success: false, error: "invalid_request" });
  }
  const MAX_TTL_SECONDS = 4 * 60 * 60;
  let ttlSeconds = CLAIM_TTL_SECONDS;
  if (expiresAt) {
    const clientExpiry = Date.parse(expiresAt);
    if (!isNaN(clientExpiry)) {
      const clientTtl = Math.round((clientExpiry - Date.now()) / 1000);
      if (clientTtl > 0) ttlSeconds = Math.min(clientTtl, MAX_TTL_SECONDS);
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await removeExpired(client);
    const result = await client.query(`INSERT INTO torn_target_calls
      (target_id,target_name,called_by_id,called_by_name,expires_at,priority,assist_requested)
      VALUES ($1,$2,$3,$4,NOW()+($5*INTERVAL '1 second'),$6,$7)
      ON CONFLICT (target_id) DO NOTHING
      RETURNING target_id::text AS "targetId", target_name AS "targetName",
      called_by_id::text AS "calledById", called_by_name AS "calledByName",
      called_at AS "calledAt", expires_at AS "expiresAt", priority AS "priority",
      assist_requested AS "assistRequested"`, [String(targetId), String(targetName).trim().slice(0,64), req.session.sub, req.session.name.slice(0,64), ttlSeconds, priority, assistRequested]);
    if (result.rowCount === 0) {
      const existing = await client.query(`${callSelect} WHERE target_id=$1`, [String(targetId)]);
      await client.query("COMMIT");
      return res.status(409).json({ success: false, error: "already_called", call: existing.rows[0] || null });
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, call: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST call failed:", error);
    res.status(500).json({ success: false, error: "database_error" });
  } finally { client.release(); }
});
app.patch("/api/v1/calls/:targetId", requireSession, async (req, res) => {
  const targetId = String(req.params.targetId || "");
  const { priority, assistRequested } = req.body || {};
  if (!/^\d+$/.test(targetId)) return res.status(400).json({ success: false, error: "invalid_target_id" });
  if (priority === undefined && assistRequested === undefined) return res.status(400).json({ success: false, error: "no_updates_supplied" });
  if ((priority !== undefined && typeof priority !== "boolean") || (assistRequested !== undefined && typeof assistRequested !== "boolean")) {
    return res.status(400).json({ success: false, error: "invalid_request" });
  }
  try {
    await removeExpired();
    const result = await pool.query(`UPDATE torn_target_calls SET
      priority=COALESCE($2,priority), assist_requested=COALESCE($3,assist_requested)
      WHERE target_id=$1 RETURNING target_id::text AS "targetId", target_name AS "targetName",
      called_by_id::text AS "calledById", called_by_name AS "calledByName",
      called_at AS "calledAt", expires_at AS "expiresAt", priority AS "priority",
      assist_requested AS "assistRequested"`, [targetId, priority ?? null, assistRequested ?? null]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: "call_not_found" });
    res.json({ success: true, call: result.rows[0] });
  } catch (error) { console.error("PATCH call failed:", error); res.status(500).json({ success: false, error: "database_error" }); }
});
app.delete("/api/v1/calls/:targetId", requireSession, async (req, res) => {
  const targetId = String(req.params.targetId || "");
  if (!/^\d+$/.test(targetId)) return res.status(400).json({ success: false, error: "invalid_target_id" });
  const takeover = req.query.takeover === "1";
  try {
    if (takeover) {
      const result = await pool.query(
        "DELETE FROM torn_target_calls WHERE target_id=$1 AND called_by_id=ANY($2::bigint[]) RETURNING target_id",
        [targetId, [...ADMIN_PLAYER_IDS]]
      );
      if (!result.rowCount) {
        const existing = await pool.query("SELECT called_by_id::text AS id FROM torn_target_calls WHERE target_id=$1", [targetId]);
        if (existing.rowCount) return res.status(403).json({ success: false, error: "not_admin_call" });
        return res.status(404).json({ success: false, error: "call_not_found" });
      }
      return res.json({ success: true, released: true });
    }
    const result = await pool.query(
      "DELETE FROM torn_target_calls WHERE target_id=$1 AND called_by_id=$2 RETURNING target_id",
      [targetId, req.session.sub]
    );
    if (!result.rowCount) {
      const existing = await pool.query("SELECT 1 FROM torn_target_calls WHERE target_id=$1", [targetId]);
      if (existing.rowCount) return res.status(403).json({ success: false, error: "not_your_call" });
      return res.status(404).json({ success: false, error: "call_not_found" });
    }
    res.json({ success: true, released: true });
  } catch (error) { console.error("DELETE call failed:", error); res.status(500).json({ success: false, error: "database_error" }); }
});
app.delete("/api/v1/admin/calls", requireAdmin, async (_req, res) => {
  try { const result = await pool.query("DELETE FROM torn_target_calls"); res.json({ success: true, cleared: result.rowCount }); }
  catch (error) { res.status(500).json({ success: false, error: "database_error" }); }
});

// ── Bonus assignments ───────────────────────────────────────────────────────
// GET  /api/v1/bonus-assignments        — any valid session, returns all assignments
// PUT  /api/v1/bonus-assignments/:bonus — admin session only, upsert assignment
// DELETE /api/v1/bonus-assignments/:bonus — admin session only, remove assignment

const VALID_BONUS_NUMBERS = new Set([10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]);

app.get("/api/v1/bonus-assignments", requireSession, async (_req, res) => {
  try {
    const result = await pool.query(`SELECT
      bonus_number  AS "bonusNumber",
      player_id::text AS "playerId",
      player_name   AS "playerName",
      assigned_by   AS "assignedBy",
      assigned_at   AS "assignedAt"
    FROM chain_bonus_assignments
    ORDER BY bonus_number ASC`);
    res.json({ success: true, assignments: result.rows });
  } catch (error) {
    console.error("GET bonus-assignments failed:", error);
    res.status(500).json({ success: false, error: "database_error" });
  }
});

app.put("/api/v1/bonus-assignments/:bonus", requireSessionAdmin, async (req, res) => {
  const bonusNumber = Number(req.params.bonus);
  if (!VALID_BONUS_NUMBERS.has(bonusNumber)) {
    return res.status(400).json({ success: false, error: "invalid_bonus_number" });
  }
  const { playerId, playerName } = req.body || {};
  if (!/^\d+$/.test(String(playerId || "")) || !String(playerName || "").trim()) {
    return res.status(400).json({ success: false, error: "invalid_request", detail: "playerId (numeric) and playerName required" });
  }
  try {
    const result = await pool.query(`INSERT INTO chain_bonus_assignments
      (bonus_number, player_id, player_name, assigned_by, assigned_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (bonus_number) DO UPDATE SET
        player_id   = EXCLUDED.player_id,
        player_name = EXCLUDED.player_name,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = NOW()
      RETURNING
        bonus_number AS "bonusNumber",
        player_id::text AS "playerId",
        player_name AS "playerName",
        assigned_by AS "assignedBy",
        assigned_at AS "assignedAt"`,
      [bonusNumber, String(playerId), String(playerName).trim().slice(0, 64), req.session.name.slice(0, 64)]
    );
    res.json({ success: true, assignment: result.rows[0] });
  } catch (error) {
    console.error("PUT bonus-assignment failed:", error);
    res.status(500).json({ success: false, error: "database_error" });
  }
});

app.delete("/api/v1/bonus-assignments/:bonus", requireSessionAdmin, async (req, res) => {
  const bonusNumber = Number(req.params.bonus);
  if (!VALID_BONUS_NUMBERS.has(bonusNumber)) {
    return res.status(400).json({ success: false, error: "invalid_bonus_number" });
  }
  try {
    const result = await pool.query(
      "DELETE FROM chain_bonus_assignments WHERE bonus_number=$1 RETURNING bonus_number",
      [bonusNumber]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: "assignment_not_found" });
    res.json({ success: true, removed: bonusNumber });
  } catch (error) {
    console.error("DELETE bonus-assignment failed:", error);
    res.status(500).json({ success: false, error: "database_error" });
  }
});

// ── Boot ────────────────────────────────────────────────────────────────────

async function start() {
  try {
    await initialiseDatabase();
    app.listen(PORT, "0.0.0.0", () => console.log(`TWI Faction Calls API listening on port ${PORT}`));
  } catch (error) { console.error("Startup failed:", error); process.exit(1); }
}
process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
start();
