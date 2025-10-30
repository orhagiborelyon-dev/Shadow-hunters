// ==========================================
// 🌑 Shadow Realms - API Server (CommonJS)
// Version 6.0 — Unified + Extended Modules
// ==========================================

const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ==========================================
// 🔹 PostgreSQL Connection
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==========================================
// 🔹 ECONOMY SYSTEM
// ==========================================

app.post("/api/economy/update", async (req, res) => {
  try {
    const { uuid, gold, silver, essence } = req.body;
    await pool.query(
      `UPDATE players
       SET gold = COALESCE(gold,0) + $2,
           silver = COALESCE(silver,0) + $3,
           essence = COALESCE(essence,0) + $4
       WHERE uuid = $1`,
      [uuid, gold || 0, silver || 0, essence || 0]
    );
    res.json({ status: "ok", message: "Economy updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/economy/get/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const result = await pool.query(
      "SELECT uuid, gold, silver, essence FROM players WHERE uuid=$1",
      [uuid]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Player not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 QUESTS SYSTEM
// ==========================================

app.get("/api/quests/list", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM quests ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/quests/accept", async (req, res) => {
  try {
    const { uuid, quest_id } = req.body;
    await pool.query(
      `INSERT INTO player_quests (player_uuid, quest_id, started_at)
       VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`,
      [uuid, quest_id]
    );
    res.json({ status: "ok", message: "Quest accepted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 COMBAT SYSTEM
// ==========================================

app.post("/api/combat/damage", async (req, res) => {
  try {
    const { uuid, damage } = req.body;
    await pool.query(
      "UPDATE players SET hp = GREATEST(hp - $2, 0) WHERE uuid=$1",
      [uuid, damage]
    );
    res.json({ status: "ok", message: `Damage applied: ${damage}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/combat/revive", async (req, res) => {
  try {
    const { uuid } = req.body;
    await pool.query("UPDATE players SET hp = 100 WHERE uuid=$1", [uuid]);
    res.json({ status: "ok", message: "Player revived" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 CRAFTING SYSTEM
// ==========================================

app.post("/api/crafting", async (req, res) => {
  try {
    const { uuid, recipe, result_item } = req.body;
    await pool.query(
      `INSERT INTO crafting_log (uuid, recipe, result_item, crafted_at)
       VALUES ($1,$2,$3,NOW())`,
      [uuid, recipe, result_item]
    );
    res.json({ status: "ok", message: `${result_item} crafted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 MARKET SYSTEM
// ==========================================

app.post("/api/market", async (req, res) => {
  try {
    const { seller_uuid, item, price } = req.body;
    await pool.query(
      `INSERT INTO market (seller_uuid, item, price, posted_at)
       VALUES ($1,$2,$3,NOW())`,
      [seller_uuid, item, price]
    );
    res.json({ status: "ok", message: "Item listed on market" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 ARTIFACT SYSTEM
// ==========================================

app.get("/api/artifacts", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM artifacts ORDER BY fecha_claim DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 CROWNS / LEADERSHIP SYSTEM
// ==========================================

app.post("/api/crowns", async (req, res) => {
  try {
    const { uuid, title } = req.body;
    await pool.query(
      `INSERT INTO crowns (uuid, title, granted_at) VALUES ($1,$2,NOW())`,
      [uuid, title]
    );
    res.json({ status: "ok", message: `${title} crown granted to ${uuid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 EVENTS SYSTEM
// ==========================================

app.post("/api/world/events", async (req, res) => {
  try {
    const { name, effect } = req.body;
    await pool.query(
      `INSERT INTO world_events (name, effect, date)
       VALUES ($1,$2,NOW())`,
      [name, effect]
    );
    res.json({ status: "ok", message: "World event registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 AUCTIONS SYSTEM
// ==========================================

app.post("/api/auctions", async (req, res) => {
  try {
    const { seller_uuid, item, starting_bid, duration } = req.body;
    await pool.query(
      `INSERT INTO auctions (seller_uuid, item, starting_bid, end_time)
       VALUES ($1,$2,$3,NOW() + interval '${duration} seconds')`,
      [seller_uuid, item, starting_bid]
    );
    res.json({ status: "ok", message: "Auction created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 ROOT TEST ENDPOINT
// ==========================================
app.get("/", (req, res) => {
  res.send("🌘 Shadow Realms API v6.0 — CommonJS server running.");
});

// ==========================================
// 🚀 START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌑 Shadow Realms API running on port ${PORT}`)
);
