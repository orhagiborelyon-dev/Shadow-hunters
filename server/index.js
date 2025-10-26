// ==========================================
// 🌑 Shadow Realms - API Server (CommonJS)
// Versión 5.0.2 — Canon completo y estable
// ==========================================

const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ==========================================
// 🔹 Conexión a la Base de Datos
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==========================================
// 🔹 1. Registro y Jugadores
// ==========================================

// Crear jugador
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;

    await pool.query(
      `INSERT INTO players (uuid, name, race, level, xp, honor, fear, influence, created_at)
       VALUES ($1, $2, $3, 1, 0, 0, 0, 0, NOW())`,
      [uuid, name, race]
    );

    res.send(
  "🌒 Successful Registration 🌒\n" +
  `You have awakened into the Shadow World as a ${race}. Go now, and find your path...\n\n` +

  "🌑 Registro exitoso 🌑\n" +
  `Has despertado al mundo de las sombras como ${race}. Ve y encuentra tu camino...\n\n` +

  "🌘 Erfolgreiche Registrierung 🌘\n" +
  `Du bist in die Schattenwelt erwacht als ${race}. Gehe nun und finde deinen Weg...\n\n` +

  "🌗 Inscription réussie 🌗\n" +
  `Tu t’es éveillé dans le Monde des Ombres en tant que ${race}. Va maintenant, et trouve ta voie...`
);

  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Obtener datos de jugador
app.get("/api/player/:uuid", async (req, res) => {
  try {
    const { uuid } = req.params;
    const result = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Jugador no encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar XP o nivel
app.post("/api/update", async (req, res) => {
  try {
    const { uuid, xp, level } = req.body;

    await pool.query(
      "UPDATE players SET xp = $1, level = $2 WHERE uuid = $3",
      [xp, level, uuid]
    );

    res.json({ status: "ok", message: "Progreso actualizado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Borrar todos los registros (limpieza total)
app.delete("/api/reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM players");
    res.json({ status: "ok", message: "Todos los jugadores fueron eliminados" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 2. Pactos y Relaciones
// ==========================================
app.post("/api/pactos", async (req, res) => {
  try {
    const { player1, player2, tipo, fuerza } = req.body;

    await pool.query(
      `INSERT INTO pactos (player1, player2, tipo, fuerza, fecha)
       VALUES ($1, $2, $3, $4, NOW())`,
      [player1, player2, tipo, fuerza]
    );

    res.json({ status: "ok", message: `Pacto ${tipo} creado entre ${player1} y ${player2}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/pactos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM pactos WHERE id = $1", [id]);
    res.json({ status: "ok", message: "Pacto roto" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 3. Reputación (Honor, Miedo, Influencia)
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

    res.json({ status: "ok", message: "Reputación actualizada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 4. Leyes y Política
// ==========================================
app.post("/api/leyes", async (req, res) => {
  try {
    const { nombre, descripcion, propuesto_por, estado } = req.body;

    await pool.query(
      `INSERT INTO leyes (nombre, descripcion, propuesto_por, estado, fecha)
       VALUES ($1, $2, $3, $4, NOW())`,
      [nombre, descripcion, propuesto_por, estado || "pendiente"]
    );

    res.json({ status: "ok", message: "Ley propuesta correctamente" });
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

    res.json({ status: "ok", message: "Voto registrado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 5. Artefactos y Liderazgo
// ==========================================
app.post("/api/artifact/claim", async (req, res) => {
  try {
    const { artifact_name, owner_uuid } = req.body;

    const existing = await pool.query("SELECT * FROM artifacts WHERE name = $1", [artifact_name]);
    if (existing.rows.length > 0 && existing.rows[0].owner_uuid)
      return res.status(400).json({ error: `El artefacto ${artifact_name} ya tiene dueño.` });

    await pool.query(
      `INSERT INTO artifacts (name, owner_uuid, fecha_claim)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name)
       DO UPDATE SET owner_uuid = $2, fecha_claim = NOW()`,
      [artifact_name, owner_uuid]
    );

    res.json({ status: "ok", message: `Artefacto ${artifact_name} asignado a ${owner_uuid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/artifact/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const result = await pool.query("SELECT * FROM artifacts WHERE name = $1", [name]);

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Artefacto no encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 6. Eventos Mundiales
// ==========================================
app.post("/api/world/exposure", async (req, res) => {
  try {
    const { delta } = req.body;
    await pool.query("UPDATE world_state SET exposure = exposure + $1", [delta]);
    res.json({ status: "ok", message: `Exposición mundial ajustada en ${delta}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 7. Prueba del servidor
// ==========================================
app.get("/", (req, res) => {
  res.send("🌘 Shadow Realms API v5.0.2 — Servidor activo y estable.");
});

// ==========================================
// 🚀 Iniciar Servidor
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌑 Shadow Realms API escuchando en puerto ${PORT}`)
);
