// ===============================================================
// Shadow Realms RP Backend v7.0 (Canon Reloaded)
// Integración total: Jugadores + Razas + Reputación + Pactos + Rituales + Líderes
// ===============================================================

import express from "express";
import pkg from "pg";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;
const app = express();
app.use(bodyParser.json());

// ===============================================================
// DATABASE
// ===============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ Database connection error:", err));

// ===============================================================
// PLAYER REGISTRATION
// ===============================================================

// Registro de nuevo jugador (mundano por defecto)
app.post("/api/player/register", async (req, res) => {
  const { owner_key, display_name } = req.body;
  if (!owner_key || !display_name)
    return res.status(400).json({ error: "owner_key and display_name required" });

  try {
    await pool.query(
      `INSERT INTO players (owner_key, display_name, race, level, xp, created_at)
       VALUES ($1, $2, 'mundano', 1, 0, NOW())
       ON CONFLICT (owner_key) DO NOTHING`,
      [owner_key, display_name]
    );
    res.status(200).json({ message: "Player registered as mundano." });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Obtener datos del jugador
app.get("/api/player/:owner_key", async (req, res) => {
  const { owner_key } = req.params;
  try {
    const result = await pool.query("SELECT * FROM players WHERE owner_key=$1::uuid", [owner_key]);
    res.status(200).json(result.rows[0] || {});
  } catch (err) {
    console.error("GET PLAYER ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===============================================================
// ADMIN / LÍDERES Y FUENTES RACIALES
// ===============================================================

// Asignar raza a un jugador
app.post("/api/admin/setrace", async (req, res) => {
  const { owner_key, race } = req.body;
  if (!owner_key || !race)
    return res.status(400).json({ error: "owner_key and race required" });

  try {
    await pool.query("UPDATE players SET race=$1 WHERE owner_key=$2::uuid", [race, owner_key]);
    res.status(200).json({ message: `Race set to ${race}` });
  } catch (err) {
    console.error("SET RACE ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Registrar líder de facción o fuente original
app.post("/api/admin/register_source", async (req, res) => {
  const { owner_key, display_name, title, race, artifact_name } = req.body;
  if (!owner_key || !display_name || !title || !race)
    return res.status(400).json({ error: "Missing parameters" });

  try {
    await pool.query(
      `INSERT INTO mundane_sources (owner_key, display_name, notes, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (owner_key) DO UPDATE SET notes=$3`,
      [owner_key, display_name, `${title} (${race}) portador de ${artifact_name || "Artefacto Desconocido"}`]
    );
    await pool.query("UPDATE players SET race=$1 WHERE owner_key=$2::uuid", [race, owner_key]);
    res.status(200).json({ message: `Source ${title} registered successfully` });
  } catch (err) {
    console.error("REGISTER SOURCE ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===============================================================
// RITUALES Y CONVERSIONES
// ===============================================================

app.post("/api/rituals/convert", async (req, res) => {
  const { actor_key, target_key, lineage_type, clan_name } = req.body;
  if (!actor_key || !target_key || !lineage_type)
    return res.status(400).json({ error: "actor_key, target_key, and lineage_type required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const target = await client.query("SELECT race FROM players WHERE owner_key=$1::uuid", [target_key]);
    if (target.rows[0]?.race && target.rows[0].race !== "mundano") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Target already has a race." });
    }

    await client.query("UPDATE players SET race=$1 WHERE owner_key=$2::uuid", [lineage_type, target_key]);
    await client.query(
      "INSERT INTO ritual_logs (actor_key, target_key, ritual_type, details) VALUES ($1,$2,$3,$4)",
      [actor_key, target_key, "conversion", JSON.stringify({ lineage_type, clan_name })]
    );

    await client.query("COMMIT");
    res.status(200).json({ message: `Conversion successful to ${lineage_type}` });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CONVERT ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// ===============================================================
// REPUTACIÓN
// ===============================================================
app.post("/api/reputation/update", async (req, res) => {
  const { owner_key, honor, fear, influence } = req.body;
  try {
    await pool.query(
      `INSERT INTO reputation_logs (owner_key, honor, fear, influence, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (owner_key) DO UPDATE
       SET honor=$2, fear=$3, influence=$4, updated_at=NOW()`,
      [owner_key, honor, fear, influence]
    );
    res.status(200).json({ message: "Reputation updated." });
  } catch (err) {
    console.error("REPUTATION ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===============================================================
// MUERTE Y RESURRECCIÓN
// ===============================================================
app.post("/api/death", async (req, res) => {
  const { uuid } = req.body;
  if (!uuid) return res.status(400).json({ error: "uuid required" });

  try {
    await pool.query(
      "UPDATE players SET race='ghost' WHERE owner_key=$1::uuid",
      [uuid]
    );
    res.status(200).json({ message: "Player marked as ghost." });
  } catch (err) {
    console.error("DEATH ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===============================================================
// LISTADO Y DIAGNÓSTICO
// ===============================================================
app.get("/api/admin/players", async (req, res) => {
  try {
    const result = await pool.query("SELECT owner_key, display_name, race, level, xp FROM players ORDER BY created_at DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("ADMIN LIST ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===============================================================
// SERVER START
// ===============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⚔️ Shadow Realms RP API v7.0 running on port ${PORT}`));
