// ===============================================
// 🌑 Shadow Realms API - CommonJS Version
// Version 6.0 — “Heavenly Codex Integration”
// ===============================================
// index.js — Shadow Realms API (CommonJS) v5.1
const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Helper
function respondError(res, err) {
  console.error(err);
  return res.status(500).json({ status: "error", error: err.message || err });
}

// ----------------------
// 1) Players / registration / core
// ----------------------
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;
    await pool.query(
      `INSERT INTO players (uuid, name, race, level, xp, honor, fear, influence, created_at)
       VALUES ($1,$2,$3,1,0,0,0,0,NOW())
       ON CONFLICT (uuid) DO UPDATE SET name = EXCLUDED.name, race = EXCLUDED.race`,
      [uuid, name, race]
    );
    res.json({ status: "ok", message: "registered", uuid, name, race });
  } catch (err) {
    respondError(res, err);
  }
});

app.get("/api/player/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const result = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Player not found" });
    res.json(result.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

app.delete("/api/reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM players");
    res.json({ status: "ok", message: "players reset" });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 2) Economy (basic)
// ----------------------
app.post("/api/economy/update", async (req, res) => {
  try {
    const { uuid, goldDelta } = req.body;
    await pool.query("UPDATE players SET gold = COALESCE(gold,0) + $1 WHERE uuid = $2", [goldDelta, uuid]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

app.get("/api/economy/get/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const r = await pool.query("SELECT gold FROM players WHERE uuid = $1", [uuid]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Player not found" });
    res.json({ gold: r.rows[0].gold || 0 });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 3) Crafting / Market / Auctions / Artifacts / Crowns
// ----------------------
// Crafting: add crafted item to player's inventory
app.post("/api/crafting", async (req, res) => {
  try {
    const { uuid, recipe, resultItem } = req.body;
    await pool.query(`INSERT INTO crafting_log (uuid, recipe, result_item, created_at) VALUES ($1,$2,$3,NOW())`, [
      uuid,
      recipe,
      resultItem,
    ]);
    // you may want to update inventory table here
    res.json({ status: "ok", message: "crafted", resultItem });
  } catch (err) {
    respondError(res, err);
  }
});

// Market listing
app.post("/api/market/list", async (req, res) => {
  try {
    const { uuid, item_code, qty, price } = req.body;
    const r = await pool.query(
      `INSERT INTO market (seller_uuid, item_code, qty, price, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id`,
      [uuid, item_code, qty, price]
    );
    res.json({ status: "ok", listingId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

// Auctions (simple)
app.post("/api/auctions/create", async (req, res) => {
  try {
    const { uuid, item_code, reserve } = req.body;
    const r = await pool.query(`INSERT INTO auctions (seller_uuid, item_code, reserve, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id`, [
      uuid,
      item_code,
      reserve,
    ]);
    res.json({ status: "ok", auctionId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

// Artifacts claim (crown etc.)
app.post("/api/artifacts/claim", async (req, res) => {
  try {
    const { artifact_name, owner_uuid } = req.body;
    const existing = await pool.query("SELECT * FROM artifacts WHERE name = $1", [artifact_name]);
    if (existing.rows.length > 0 && existing.rows[0].owner_uuid) {
      return res.status(400).json({ error: "artifact already owned" });
    }
    await pool.query(
      `INSERT INTO artifacts (name, owner_uuid, date_claimed)
       VALUES ($1,$2,NOW())
       ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed`,
      [artifact_name, owner_uuid]
    );
    res.json({ status: "ok", artifact_name, owner_uuid });
  } catch (err) {
    respondError(res, err);
  }
});

app.get("/api/artifacts/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const r = await pool.query("SELECT * FROM artifacts WHERE name = $1", [name]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

// Crowns endpoint
app.post("/api/crowns/claim", async (req, res) => {
  try {
    const { crown_name, owner_uuid } = req.body;
    await pool.query(
      `INSERT INTO crowns (name, owner_uuid, date_claimed)
       VALUES ($1,$2,NOW())
       ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed`,
      [crown_name, owner_uuid]
    );
    res.json({ status: "ok", crown_name, owner_uuid });
  } catch (err) {
    respondError(res, err);
  }
});

app.get("/api/crowns/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const r = await pool.query("SELECT * FROM crowns WHERE name = $1", [name]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 4) Packs / Guilds / Secret Societies
// ----------------------
app.post("/api/packs/create", async (req, res) => {
  try {
    const { pack_name, leader_uuid } = req.body;
    const r = await pool.query(`INSERT INTO packs (name, leader_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id`, [
      pack_name,
      leader_uuid,
    ]);
    res.json({ status: "ok", packId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/guilds/create", async (req, res) => {
  try {
    const { guild_name, leader_uuid } = req.body;
    const r = await pool.query(`INSERT INTO guilds (name, leader_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id`, [
      guild_name,
      leader_uuid,
    ]);
    res.json({ status: "ok", guildId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/secret/create", async (req, res) => {
  try {
    const { secret_name, founder_uuid } = req.body;
    const r = await pool.query(`INSERT INTO secret_societies (name, founder_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id`, [
      secret_name,
      founder_uuid,
    ]);
    res.json({ status: "ok", secretId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 5) Packs/Warlock/Faerie/Celestial endpoints (module APIs)
// ----------------------
app.post("/api/pack/xp", async (req, res) => {
  try {
    const { packId, xpDelta } = req.body;
    // Simple: update pack xp (table: packs has xp)
    await pool.query("UPDATE packs SET xp = COALESCE(xp,0) + $1 WHERE id = $2", [xpDelta, packId]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/faerie/diplomacy", async (req, res) => {
  try {
    const { action, data } = req.body;
    await pool.query("INSERT INTO faerie_actions (action, data, created_at) VALUES ($1,$2,NOW())", [action, JSON.stringify(data)]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/warlock/pact", async (req, res) => {
  try {
    const { owner_uuid, demon_name, price } = req.body;
    await pool.query("INSERT INTO warlock_pacts (owner_uuid, demon_name, price, created_at) VALUES ($1,$2,$3,NOW())", [owner_uuid, demon_name, price]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/celestial/vault/store", async (req, res) => {
  try {
    const { owner_uuid, relic_name } = req.body;
    await pool.query("INSERT INTO celestial_vault (owner_uuid, relic_name, date_stored) VALUES ($1,$2,NOW())", [owner_uuid, relic_name]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 6) Hunter Trials / Portal Network / Events / World exposure
// ----------------------
app.post("/api/hunter/trial/complete", async (req, res) => {
  try {
    const { uuid, trial_id, result } = req.body;
    await pool.query("INSERT INTO hunter_trials_log (uuid, trial_id, result, created_at) VALUES ($1,$2,$3,NOW())", [uuid, trial_id, result]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/portal/teleport", async (req, res) => {
  try {
    const { uuid, portal_name, target } = req.body;
    // server stores a teleport request for LSL to poll
    await pool.query("INSERT INTO portal_requests (uuid, portal_name, target, created_at) VALUES ($1,$2,$3,NOW())", [uuid, portal_name, target]);
    res.json({ status: "ok", message: "request recorded" });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/world/events", async (req, res) => {
  try {
    const { name, payload } = req.body;
    await pool.query("INSERT INTO world_events (name, payload, created_at) VALUES ($1,$2,NOW())", [name, JSON.stringify(payload)]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/world/exposure", async (req, res) => {
  try {
    const { delta } = req.body;
    await pool.query("UPDATE world_state SET exposure = COALESCE(exposure,0) + $1", [delta]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 7) Bonding / Bloodlines / Love systems
// ----------------------
app.post("/api/bond/create", async (req, res) => {
  try {
    const { uuid1, uuid2, bond_type, initiator } = req.body;
    const r = await pool.query("INSERT INTO bonds (uuid1, uuid2, bond_type, initiator, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id", [
      uuid1,
      uuid2,
      bond_type,
      initiator,
    ]);
    res.json({ status: "ok", bondId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/bloodlines/register", async (req, res) => {
  try {
    const { family_name, founder_uuid } = req.body;
    const r = await pool.query("INSERT INTO bloodlines (family_name, founder_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id", [
      family_name,
      founder_uuid,
    ]);
    res.json({ status: "ok", bloodlineId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.get("/api/bloodlines/:family", async (req, res) => {
  try {
    const { family } = req.params;
    const r = await pool.query("SELECT * FROM bloodlines WHERE family_name = $1", [family]);
    if (r.rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 8) Combat endpoints (damage/revive)
app.post("/api/combat/damage", async (req, res) => {
  try {
    const { target_uuid, amount, source_uuid } = req.body;
    await pool.query("INSERT INTO combat_log (target_uuid, amount, source_uuid, created_at) VALUES ($1,$2,$3,NOW())", [
      target_uuid,
      amount,
      source_uuid,
    ]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/combat/revive", async (req, res) => {
  try {
    const { uuid } = req.body;
    await pool.query("UPDATE players SET dead = FALSE WHERE uuid = $1", [uuid]);
    res.json({ status: "ok" });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 9) Misc: Mortal mirror, raziel blessing (server-side triggers)
app.post("/api/mirror/scan", async (req, res) => {
  try {
    const { uuid, name } = req.body;
    // Return whether hidden entities are present - simple mock
    const hasHidden = Math.random() < 0.25;
    res.json({ result: "ok", hiddenFound: hasHidden });
  } catch (err) {
    respondError(res, err);
  }
});

app.post("/api/raziel/bless", async (req, res) => {
  try {
    const { uuid, blessing } = req.body;
    await pool.query("INSERT INTO raziel_blessings (uuid, blessing, created_at) VALUES ($1,$2,NOW())", [uuid, blessing]);
    res.json({ status: "ok", message: "blessing recorded" });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// Root
app.get("/", (req, res) => {
  res.send("Shadow Realms API v5.1 (CommonJS) - OK");
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Shadow Realms API listening on ${PORT}`));
