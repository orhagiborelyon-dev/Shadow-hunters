// ===============================================
// 🌑 Shadow Realms API - CommonJS Version
// Version 6.0 — “Heavenly Codex Integration”
// ===============================================
const express = require("express");
const { Pool }   = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// -----------------------------------------------
// 🔹 Database connection
// -----------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==========================================
// 1️⃣ CORE PLAYER SYSTEM
// ==========================================
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;
    await pool.query(
      `INSERT INTO players (uuid, name, race, level, xp, honor, fear, influence, created_at)
       VALUES ($1, $2, $3, 1, 0, 0, 0, 0, NOW())
       ON CONFLICT (uuid) DO NOTHING`,
      [uuid, name, race]
    );
    res.json({ status: "ok", message: `Player ${name} registered as ${race}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/player/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const result = await pool.query("SELECT * FROM players WHERE uuid=$1", [uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 2️⃣ ECONOMY & MARKET
// ==========================================
app.post("/api/economy/update", async (req, res) => {
  try {
    const { uuid, gold_delta } = req.body;
    await pool.query("UPDATE players SET gold = COALESCE(gold,0) + $1 WHERE uuid=$2", [gold_delta, uuid]);
    res.json({ status: "ok", message: "Economy updated" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/economy/get/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const r = await pool.query("SELECT gold FROM players WHERE uuid=$1", [uuid]);
    if (r.rows.length === 0) return res.json({ gold: 0 });
    res.json({ gold: r.rows[0].gold });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/market", async (req, res) => {
  try {
    const { seller, item, price } = req.body;
    await pool.query(
      `INSERT INTO market (seller, item, price, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [seller, item, price]
    );
    res.json({ status: "ok", message: `${item} listed for ${price}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 3️⃣ COMBAT & STATS
// ==========================================
app.post("/api/combat/damage", async (req, res) => {
  try {
    const { target, amount } = req.body;
    await pool.query("UPDATE players SET hp = GREATEST(hp - $1, 0) WHERE uuid=$2", [amount, target]);
    res.json({ status: "ok", message: `Damage ${amount} applied to ${target}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/combat/revive", async (req, res) => {
  try {
    const { uuid } = req.body;
    await pool.query("UPDATE players SET hp = 100 WHERE uuid=$1", [uuid]);
    res.json({ status: "ok", message: "Player revived" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 4️⃣ CRAFTING & RELICS
// ==========================================
app.post("/api/crafting", async (req, res) => {
  try {
    const { uuid, item } = req.body;
    await pool.query(
      `INSERT INTO inventory (uuid, item, created_at)
       VALUES ($1, $2, NOW())`,
      [uuid, item]
    );
    res.json({ status: "ok", message: `Crafted ${item}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/relics/store", async (req, res) => {
  try {
    const { uuid } = req.body;
    await pool.query("UPDATE players SET relics_stored = COALESCE(relics_stored,0) + 1 WHERE uuid=$1", [uuid]);
    res.json({ status: "ok", message: "Relic stored" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 5️⃣ WORLD & EVENTS
// ==========================================
app.post("/api/world/events", async (req, res) => {
  try {
    const { title, description } = req.body;
    await pool.query(
      `INSERT INTO world_events (title, description, date)
       VALUES ($1, $2, NOW())`,
      [title, description]
    );
    res.json({ status: "ok", message: "Event recorded" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 6️⃣ MYSTIC ITEMS (Mortal Mirror, Fire, Silent City etc.)
// ==========================================
app.post("/api/mortalmirror/use", async (req, res) => {
  // Reveal hidden entities logic can be added
  res.json({ status: "ok", message: "Hidden entities revealed nearby." });
});

app.post("/api/heavenlyfire/use", async (req, res) => {
  res.json({ status: "ok", message: "Heavenly Fire ignites your essence." });
});

app.post("/api/silentcity/visit", async (req, res) => {
  res.json({ status: "ok", message: "Silent City visit processed." });
});

app.post("/api/raziel/bless", async (req, res) => {
  res.json({ status: "ok", blessing: "Angelic Strength" });
});

// ==========================================
// 7️⃣ PORTALS & TRAVEL
// ==========================================
app.post("/api/portal/travel", async (req, res) => {
  try {
    const { uuid, dest } = req.body;
    res.json({ status: "ok", message: `Teleported to ${dest}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 8️⃣ BLOODLINES, RANKING & FAITH
// ==========================================
app.post("/api/bloodline/get", async (req, res) => {
  try {
    const { uuid } = req.body;
    // example placeholder
    res.json({ status: "ok", bloodline: "First Line Nephilim" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/ranking/top", async (req, res) => {
  try {
    const result = await pool.query("SELECT name, xp, level FROM players ORDER BY xp DESC LIMIT 10");
    res.json({ status: "ok", rankings: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/faith/pray", async (req, res) => {
  try {
    const { uuid } = req.body;
    res.json({ status: "ok", message: "Your devotion is acknowledged." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 9️⃣ MAIL & JOURNAL
// ==========================================
app.post("/api/mail/send", async (req, res) => {
  try {
    const { from, to, msg } = req.body;
    await pool.query(
      `INSERT INTO mail (sender, receiver, content, sent_at)
       VALUES ($1, $2, $3, NOW())`,
      [from, to, msg]
    );
    res.json({ status: "ok", message: "Mail sent" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/journal/update", async (req, res) => {
  try {
    const { uuid, quest } = req.body;
    await pool.query(
      `INSERT INTO journal (uuid, quest, date)
       VALUES ($1, $2, NOW())`,
      [uuid, quest]
    );
    res.json({ status: "ok", message: `Quest ${quest} recorded` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 🔟 PETS & CROWNS
// ==========================================
app.post("/api/pet/summon", async (req, res) => {
  try {
    const { uuid } = req.body;
    res.json({ status: "ok", message: "Your familiar has arrived." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/crowns", async (req, res) => {
  try {
    const { uuid, title } = req.body;
    await pool.query("UPDATE players SET title=$2 WHERE uuid=$1", [uuid, title]);
    res.json({ status: "ok", message: `Crowned ${title}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// 🔁 CLANS & GENEALOGY
// ==========================================
app.post("/api/clans/register", async (req, res) => {
  try {
    const { clan_type, clan_name, leader_uuid, leader_name } = req.body;
    const result = await pool.query(
      `INSERT INTO clans (clan_type, clan_name, leader_uuid, leader_name, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, clan_name, clan_type`,
      [clan_type, clan_name, leader_uuid, leader_name]
    );
    res.json({ status: "ok", clan: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/clans/join", async (req, res) => {
  try {
    const { clan_id, uuid, name } = req.body;
    await pool.query(
      `INSERT INTO clan_members (clan_id, uuid, name, joined_at)
       VALUES ($1,$2,$3,NOW())`,
      [clan_id, uuid, name]
    );
    res.json({ status: "ok", message: `${name} joined clan ${clan_id}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/clans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const clan = await pool.query("SELECT * FROM clans WHERE id = $1", [id]);
    if (clan.rows.length === 0) return res.status(404).json({ error: "Clan not found" });
    const members = await pool.query("SELECT uuid, name, joined_at FROM clan_members WHERE clan_id = $1", [id]);
    res.json({ status: "ok", clan: clan.rows[0], members: members.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/genealogy/add", async (req, res) => {
  try {
    const { uuid, name, clan_id, generation, sire_uuid, note } = req.body;
    await pool.query(
      `INSERT INTO genealogy (uuid, name, clan_id, generation, sire_uuid, note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [uuid, name, clan_id, generation, sire_uuid, note]
    );
    res.json({ status: "ok", message: "Genealogy record added" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/genealogy/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const rows = await pool.query("SELECT * FROM genealogy WHERE uuid = $1 ORDER BY created_at DESC", [uuid]);
    res.json({ status: "ok", records: rows.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
app.get("/", (req, res) => {
  res.send("🌘 Shadow Realms API v6.0 — CommonJS Edition");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌑 Shadow Realms API listening on port ${PORT}`);
});
