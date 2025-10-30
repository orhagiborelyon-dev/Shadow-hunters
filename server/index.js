// ==========================================
// 🌑 Shadow Realms - API Server (CommonJS)
// Version: 6.0 — Canon Stable and Complete
// ==========================================

const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ==========================================
// 🔹 Database Connection
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==========================================
// 🔹 1. Player Registration and Management
// ==========================================
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;

    await pool.query(
      `INSERT INTO players (uuid, name, race, level, xp, honor, fear, influence, created_at)
       VALUES ($1, $2, $3, 1, 0, 0, 0, 0, NOW())
       ON CONFLICT (uuid)
       DO UPDATE SET name=$2, race=$3`,
      [uuid, name, race]
    );

    res.json({
      status: "ok",
      message: `🌒 ${name}, you have awakened as a ${race}.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.post("/api/update", async (req, res) => {
  try {
    const { uuid, xp, level } = req.body;
    await pool.query("UPDATE players SET xp = $1, level = $2 WHERE uuid = $3", [
      xp,
      level,
      uuid,
    ]);
    res.json({ status: "ok", message: "Progress updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM players");
    res.json({ status: "ok", message: "All players deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 2. Pacts & Relationships
// ==========================================
app.post("/api/pactos", async (req, res) => {
  try {
    const { player1, player2, tipo, fuerza } = req.body;
    await pool.query(
      `INSERT INTO pactos (player1, player2, tipo, fuerza, fecha)
       VALUES ($1, $2, $3, $4, NOW())`,
      [player1, player2, tipo, fuerza]
    );
    res.json({ status: "ok", message: `Pact ${tipo} created.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 3. Reputation System
// ==========================================
app.post("/api/reputacion", async (req, res) => {
  try {
    const { uuid, honor, fear, influence } = req.body;
    await pool.query(
      `UPDATE players
       SET honor = honor + $1, fear = fear + $2, influence = influence + $3
       WHERE uuid = $4`,
      [honor, fear, influence, uuid]
    );
    res.json({ status: "ok", message: "Reputation updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 4. Laws & Politics
// ==========================================
app.post("/api/leyes", async (req, res) => {
  try {
    const { nombre, descripcion, propuesto_por, estado } = req.body;
    await pool.query(
      `INSERT INTO leyes (nombre, descripcion, propuesto_por, estado, fecha)
       VALUES ($1, $2, $3, $4, NOW())`,
      [nombre, descripcion, propuesto_por, estado || "pendiente"]
    );
    res.json({ status: "ok", message: "Law proposed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/leyes/voto", async (req, res) => {
  try {
    const { ley_id, jugador, voto } = req.body;
    await pool.query("INSERT INTO votos (ley_id, jugador, voto) VALUES ($1, $2, $3)", [
      ley_id,
      jugador,
      voto,
    ]);
    res.json({ status: "ok", message: "Vote recorded" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 5. Artifacts & Leadership
// ==========================================
app.post("/api/artifact/claim", async (req, res) => {
  try {
    const { artifact_name, owner_uuid } = req.body;

    const existing = await pool.query("SELECT * FROM artifacts WHERE name = $1", [artifact_name]);
    if (existing.rows.length > 0 && existing.rows[0].owner_uuid)
      return res.status(400).json({ error: "Artifact already claimed." });

    await pool.query(
      `INSERT INTO artifacts (name, owner_uuid, fecha_claim)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET owner_uuid = $2, fecha_claim = NOW()`,
      [artifact_name, owner_uuid]
    );

    res.json({ status: "ok", message: `${artifact_name} assigned to ${owner_uuid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 6. Mortal Cup
// ==========================================
app.post("/api/mortalcup/use", async (req, res) => {
  try {
    const { uuid, name } = req.body;

    const player = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);
    if (player.rows.length === 0)
      return res.json({ outcome: "Indeterminate", message: `${name} not registered.` });

    const data = player.rows[0];

    if (data.race && data.race.toLowerCase() === "nephilim") {
      return res.json({
        outcome: "Nephilim",
        message: `${name}, the Cup has already blessed you.`,
      });
    }

    const fate = Math.random();
    if (fate < 0.7) {
      await pool.query("UPDATE players SET race = 'Nephilim', level = level + 1 WHERE uuid = $1", [
        uuid,
      ]);
      res.json({
        outcome: "Nephilim",
        message: `${name}, your soul is accepted by the Mortal Cup.`,
      });
    } else {
      await pool.query("DELETE FROM players WHERE uuid = $1", [uuid]);
      res.json({
        outcome: "Spiritual Death",
        message: `${name}, the Cup rejects your essence.`,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 7. Lake Lynn
// ==========================================
app.post("/api/lakelynn/use", async (req, res) => {
  try {
    const { uuid, name } = req.body;
    const player = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);
    if (player.rows.length === 0)
      return res.status(404).json({ error: "Player not found" });

    await pool.query("UPDATE players SET xp = xp + 5, fear = GREATEST(fear - 3, 0) WHERE uuid = $1", [
      uuid,
    ]);
    res.json({
      status: "ok",
      message: `${name} bathed in Lake Lynn and was purified.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 8. World Events
// ==========================================
app.post("/api/world/exposure", async (req, res) => {
  try {
    const { delta } = req.body;
    await pool.query("UPDATE world_state SET exposure = exposure + $1", [delta]);
    res.json({ status: "ok", message: `World exposure adjusted by ${delta}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 9. Status Test
// ==========================================
app.get("/", (req, res) => {
  res.send("🌘 Shadow Realms API v6.0 — Server online and stable.");
});

// ==========================================
// 🚀 Start Server
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌑 Shadow Realms API listening on port ${PORT}`));
