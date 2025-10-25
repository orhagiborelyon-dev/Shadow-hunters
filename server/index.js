// ==========================================
// Shadow Realms - API Server (CommonJS)
// ==========================================

const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ==========================================
// Database Connection
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==========================================
// Routes / Endpoints
// ==========================================

// Registro de jugador (mundano)
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;
    await pool.query(
      "INSERT INTO players (uuid, name, race, level, xp) VALUES ($1, $2, $3, 1, 0)",
      [uuid, name, race]
    );
    res.json({ status: "ok", message: `Jugador ${name} registrado como ${race}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Obtener datos de jugador
app.get("/api/player/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const result = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Jugador no encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar XP o nivel
app.post("/api/update", async (req, res) => {
  try {
    const { uuid, xp, level } = req.body;
    await pool.query("UPDATE players SET xp = $1, level = $2 WHERE uuid = $3", [
      xp,
      level,
      uuid,
    ]);
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Borrar todos los registros (limpieza total)
app.delete("/api/reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM players");
    res.json({ status: "ok", message: "Base de datos limpiada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Server Start
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌑 Shadow Realms API activa en puerto ${PORT}`));
