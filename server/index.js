// index.js v6.0 — Shadow Realms RP Backend
// Integración completa: RaceManager + BloodlineManager + Nephilim Families + Rituals
// Versión reparada (CommonJS / require) para compatibilidad con entornos LSL y HUDs externos.

const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");

// ================== INIT ==================
dotenv.config();
const app = express();
app.use(bodyParser.json());

// ================== DATABASE ==================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("Database connection error:", err));

// ================== PLAYER BASE ==================
app.post("/api/player/register", async (req, res) => {
  const { owner_key, display_name } = req.body;
  if (!owner_key || !display_name)
    return res.status(400).json({ error: "owner_key and display_name required" });

  try {
    await pool.query(
      `INSERT INTO players (owner_key, display_name, race, level, xp, registered_at)
       VALUES ($1, $2, 'human', 1, 0, NOW())
       ON CONFLICT (owner_key) DO NOTHING`,
      [owner_key, display_name]
    );
    res.status(200).json({ message: "Player registered." });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/player/:owner_key", async (req, res) => {
  const { owner_key } = req.params;
  try {
    const player = await pool.query(
      "SELECT * FROM players WHERE owner_key=$1::uuid",
      [owner_key]
    );
    res.status(200).json(player.rows[0] || {});
  } catch (err) {
    console.error("GET PLAYER ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== ADMINISTRATION ==================
app.post("/api/admin/setrace", async (req, res) => {
  const { owner_key, race } = req.body;
  if (!owner_key || !race)
    return res.status(400).json({ error: "owner_key and race required" });

  try {
    await pool.query("UPDATE players SET race=$1 WHERE owner_key=$2::uuid", [
      race,
      owner_key,
    ]);
    res.status(200).json({ message: `Race set to ${race}` });
  } catch (err) {
    console.error("SET RACE ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== BLOODLINES ==================
app.post("/api/rituals/convert", async (req, res) => {
  const { actor_key, target_key, lineage_type, clan_name } = req.body;
  if (!actor_key || !target_key || !lineage_type)
    return res.status(400).json({
      error: "actor_key, target_key, and lineage_type required",
    });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const target = await client.query(
      "SELECT race FROM players WHERE owner_key=$1::uuid",
      [target_key]
    );
    if (target.rows[0]?.race && target.rows[0].race !== "human") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Target already has a race." });
    }

    const actorLine = await client.query(
      "SELECT generation, clan_name FROM bloodlines WHERE root_key=$1::uuid OR parent_key=$1::uuid ORDER BY generation ASC LIMIT 1",
      [actor_key]
    );

    const generation =
      actorLine.rows.length > 0 ? actorLine.rows[0].generation + 1 : 0;
    const clan =
      clan_name ||
      actorLine.rows[0]?.clan_name ||
      `${lineage_type}_clan`;

    await client.query(
      "INSERT INTO bloodlines (root_key, parent_key, generation, clan_name, lineage_type) VALUES ($1,$2,$3,$4,$5)",
      [target_key, actor_key, generation, clan, lineage_type]
    );

    await client.query(
      "UPDATE players SET race=$1 WHERE owner_key=$2::uuid",
      [lineage_type, target_key]
    );

    await client.query(
      "INSERT INTO ritual_logs (actor_key, target_key, ritual_type, details) VALUES ($1,$2,$3,$4)",
      [
        actor_key,
        target_key,
        lineage_type + "_conversion",
        JSON.stringify({ clan, generation }),
      ]
    );

    await client.query("COMMIT");
    res.status(200).json({ message: `Conversion successful`, clan, generation });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CONVERT ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// ================== NEPHILIM FAMILIES ==================
app.post("/api/rituals/nephilim_union", async (req, res) => {
  const { male_key, female_key, child_key } = req.body;
  if (!male_key || !female_key || !child_key)
    return res.status(400).json({
      error: "male_key, female_key, child_key required",
    });

  try {
    const family = await pool.query(
      "SELECT family_name FROM nephilim_families WHERE patriarch_key=$1::uuid",
      [male_key]
    );
    const family_name = family.rows[0]?.family_name || "Unknown";

    await pool.query(
      "UPDATE players SET race=$1 WHERE owner_key=$2::uuid",
      ["nephilim", child_key]
    );
    await pool.query(
      "INSERT INTO nephilim_families (patriarch_key, family_name, parent_family) VALUES ($1,$2,$3)",
      [child_key, family_name, family_name]
    );
    await pool.query(
      "INSERT INTO ritual_logs (actor_key, target_key, ritual_type, details) VALUES ($1,$2,$3,$4)",
      [
        male_key,
        child_key,
        "nephilim_birth",
        JSON.stringify({ family_name }),
      ]
    );

    res.status(200).json({
      message: `Child registered in ${family_name} family`,
    });
  } catch (err) {
    console.error("NEPHILIM UNION ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== LINEAGE QUERY ==================
app.get("/api/lineage/:owner_key", async (req, res) => {
  const { owner_key } = req.params;
  try {
    const blood = await pool.query(
      "SELECT * FROM bloodlines WHERE root_key=$1::uuid OR parent_key=$1::uuid ORDER BY generation ASC",
      [owner_key]
    );
    const family = await pool.query(
      "SELECT * FROM nephilim_families WHERE patriarch_key=$1::uuid",
      [owner_key]
    );
    res.status(200).json({ bloodline: blood.rows, family: family.rows });
  } catch (err) {
    console.error("LINEAGE QUERY ERROR:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ================== SERVER START ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`⚔️ Shadow Realms RP API v6.0 running on port ${PORT}`)
);
