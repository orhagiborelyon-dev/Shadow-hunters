// ==========================================
// 🌑 SHADOW REALMS - API SERVER v6.0
// ==========================================
// Full Integration: Player Core, Reputations, Mortal Cup,
// Lake Lynn, Artifacts, Pacts, Politics, and World Events.
// Compatible with current LSL scripts (HUD 6.0).
// ==========================================

const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ==========================================
// 🔹 DATABASE CONNECTION
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==========================================
// 🧬 1. PLAYER REGISTRATION & MANAGEMENT
// ==========================================

// Register new player
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;

    await pool.query(
      `INSERT INTO players (uuid, name, race, level, xp, honor, fear, influence, created_at)
       VALUES ($1, $2, $3, 1, 0, 0, 0, 0, NOW())
       ON CONFLICT (uuid) DO NOTHING`,
      [uuid, name, race]
    );

    res.send(
      `🌒 Registration Complete 🌒\nWelcome, ${name}. You awaken as a ${race}.\n` +
      "Go forth into the Shadow Realms...\n"
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Retrieve player info
app.get("/api/player/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const result = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Player not found" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update XP / Level
app.post("/api/update", async (req, res) => {
  try {
    const { uuid, xp, level } = req.body;
    await pool.query("UPDATE players SET xp = $1, level = $2 WHERE uuid = $3", [
      xp, level, uuid,
    ]);
    res.json({ status: "ok", message: "Progress updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset all players (Admin)
app.delete("/api/reset", async (_req, res) => {
  try {
    await pool.query("DELETE FROM players");
    res.json({ status: "ok", message: "All players have been deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ⚖️ 2. REPUTATION (HONOR / FEAR / INFLUENCE)
// ==========================================
app.post("/api/reputacion", async (req, res) => {
  try {
    const { uuid, honor, fear, influence } = req.body;

    await pool.query(
      `UPDATE players
       SET honor = honor + $1,
           fear = fear + $2,
           influence = influence + $3
       WHERE uuid = $4`,
      [honor, fear, influence, uuid]
    );

    res.json({ status: "ok", message: "Reputation updated." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 💍 3. PACTS & RELATIONSHIPS
// ==========================================
app.post("/api/pactos", async (req, res) => {
  try {
    const { player1, player2, tipo, fuerza } = req.body;
    await pool.query(
      `INSERT INTO pactos (player1, player2, tipo, fuerza, fecha)
       VALUES ($1, $2, $3, $4, NOW())`,
      [player1, player2, tipo, fuerza]
    );
    res.json({ status: "ok", message: `Pact ${tipo} created between ${player1} and ${player2}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/pactos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM pactos WHERE id = $1", [id]);
    res.json({ status: "ok", message: "Pact removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ⚔️ 4. MORTAL CUP (Ascension Ritual)
// ==========================================
app.post("/api/mortalcup/use", async (req, res) => {
  try {
    const { avatar_id, object } = req.body;

    const player = await pool.query("SELECT * FROM players WHERE uuid = $1", [avatar_id]);
    if (player.rows.length === 0)
      return res.json({
        outcome: "Unknown",
        message: `⚠️ Your soul is not registered in the Conclave.`,
      });

    const data = player.rows[0];
    const name = data.name || "Unknown Soul";

    if (data.race && data.race.toLowerCase() === "nephilim")
      return res.json({
        outcome: "Nephilim",
        message: `🌟 ${name}, the Mortal Cup has already blessed you.`,
      });

    const fate = Math.random();
    if (fate < 0.7) {
      await pool.query("UPDATE players SET race = 'Nephilim', level = level + 1 WHERE uuid = $1", [avatar_id]);
      res.json({
        outcome: "Nephilim",
        message: `✨ ${name}, the Cup accepts your essence. You ascend as a Nephilim.`,
      });
    } else {
      await pool.query("DELETE FROM players WHERE uuid = $1", [avatar_id]);
      res.json({
        outcome: "Spiritual Death",
        message: `💀 ${name}, your essence was rejected by the Cup.`,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 💧 5. LAKE LYNN (Purification)
// ==========================================
app.post("/api/lakelynn/use", async (req, res) => {
  try {
    const { uuid, name } = req.body;
    const player = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);

    if (player.rows.length === 0)
      return res.status(404).json({ error: "Player not found" });

    await pool.query(
      "UPDATE players SET xp = xp + 5, fear = GREATEST(fear - 3, 0) WHERE uuid = $1",
      [uuid]
    );

    res.json({
      status: "ok",
      message: `🌊 ${name} has bathed in Lake Lynn. Their spirit feels lighter.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🗡️ 6. ARTIFACTS MANAGEMENT
// ==========================================
app.post("/api/artifact/claim", async (req, res) => {
  try {
    const { artifact_name, owner_uuid } = req.body;
    const existing = await pool.query("SELECT * FROM artifacts WHERE name = $1", [artifact_name]);

    if (existing.rows.length > 0 && existing.rows[0].owner_uuid)
      return res.status(400).json({ error: `${artifact_name} already has an owner.` });

    await pool.query(
      `INSERT INTO artifacts (name, owner_uuid, fecha_claim)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name)
       DO UPDATE SET owner_uuid = $2, fecha_claim = NOW()`,
      [artifact_name, owner_uuid]
    );

    res.json({ status: "ok", message: `${artifact_name} claimed by ${owner_uuid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ⚖️ 7. POLITICS (LAWS & VOTES)
// ==========================================
app.post("/api/leyes", async (req, res) => {
  try {
    const { nombre, descripcion, propuesto_por, estado } = req.body;

    await pool.query(
      `INSERT INTO leyes (nombre, descripcion, propuesto_por, estado, fecha)
       VALUES ($1, $2, $3, $4, NOW())`,
      [nombre, descripcion, propuesto_por, estado || "pending"]
    );

    res.json({ status: "ok", message: "Law proposal created." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/leyes/voto", async (req, res) => {
  try {
    const { ley_id, jugador, voto } = req.body;
    await pool.query(
      "INSERT INTO votos (ley_id, jugador, voto) VALUES ($1, $2, $3)",
      [ley_id, jugador, voto]
    );
    res.json({ status: "ok", message: "Vote registered." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🌍 8. WORLD STATE
// ==========================================
app.post("/api/world/exposure", async (req, res) => {
  try {
    const { delta } = req.body;
    await pool.query("UPDATE world_state SET exposure = exposure + $1", [delta]);
    res.json({ status: "ok", message: `World exposure adjusted by ${delta}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🧩 SERVER CHECK
// ==========================================
app.get("/", (_req, res) => {
  res.send("🌘 Shadow Realms API v6.0 — Server online and synchronized with HUD.");
});

// ==========================================
// 🚀 START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌑 Shadow Realms API running on port ${PORT}`));
