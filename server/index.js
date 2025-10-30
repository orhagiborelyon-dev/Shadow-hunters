// ==========================================
// 🌑 Shadow Realms - API Server (CommonJS)
// Versión 5.0.3 — Canon extendido y estable
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
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ==========================================
// 🔹 1. Registro y Jugadores
// ==========================================

// Crear jugador
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;

    if (!uuid || !name || !race) {
      return res
        .status(400)
        .json({ status: "error", message: "Faltan parámetros obligatorios." });
    }

    await pool.query(
      `INSERT INTO players (uuid, name, race, level, xp, honor, fear, influence, created_at)
       VALUES ($1, $2, $3, 1, 0, 0, 0, 0, NOW())
       ON CONFLICT (uuid) DO NOTHING`,
      [uuid, name, race]
    );

    res.json({
      status: "ok",
      message: `🌒 Registro exitoso: ${name} ha despertado como ${race}.`,
    });
  } catch (err) {
    console.error("Error en /api/register:", err);
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
    console.error("Error en /api/player:", err);
    res.status(500).json({ error: err.message });
  }
});

// Actualizar XP o nivel
app.post("/api/update", async (req, res) => {
  try {
    const { uuid, xp, level } = req.body;

    if (!uuid) return res.status(400).json({ error: "uuid requerido" });

    await pool.query("UPDATE players SET xp = $1, level = $2 WHERE uuid = $3", [
      xp || 0,
      level || 1,
      uuid,
    ]);

    res.json({ status: "ok", message: "Progreso actualizado" });
  } catch (err) {
    console.error("Error en /api/update:", err);
    res.status(500).json({ error: err.message });
  }
});

// Borrar todos los registros
app.delete("/api/reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM players");
    res.json({ status: "ok", message: "Todos los jugadores fueron eliminados" });
  } catch (err) {
    console.error("Error en /api/reset:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 2. Pactos y Relaciones
// ==========================================
app.post("/api/pactos", async (req, res) => {
  try {
    const { player1, player2, tipo, fuerza } = req.body;

    if (!player1 || !player2 || !tipo) {
      return res.status(400).json({ error: "Datos insuficientes para crear pacto." });
    }

    await pool.query(
      `INSERT INTO pactos (player1, player2, tipo, fuerza, fecha)
       VALUES ($1, $2, $3, $4, NOW())`,
      [player1, player2, tipo, fuerza || 0]
    );

    res.json({ status: "ok", message: `Pacto ${tipo} creado entre ${player1} y ${player2}` });
  } catch (err) {
    console.error("Error en /api/pactos:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/pactos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM pactos WHERE id = $1", [id]);
    res.json({ status: "ok", message: "Pacto roto" });
  } catch (err) {
    console.error("Error en /api/pactos/:id:", err);
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
       SET honor = COALESCE(honor, 0) + $1,
           fear = COALESCE(fear, 0) + $2,
           influence = COALESCE(influence, 0) + $3
       WHERE uuid = $4`,
      [honor || 0, fear || 0, influence || 0, uuid]
    );

    res.json({ status: "ok", message: "Reputación actualizada" });
  } catch (err) {
    console.error("Error en /api/reputacion:", err);
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
    console.error("Error en /api/leyes:", err);
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
    res.json({ status: "ok", message: "Voto registrado" });
  } catch (err) {
    console.error("Error en /api/leyes/voto:", err);
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
    console.error("Error en /api/artifact/claim:", err);
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
    console.error("Error en /api/artifact/:name:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 6. Eventos Mundiales y Exposición
// ==========================================
app.post("/api/world/exposure", async (req, res) => {
  try {
    const { delta } = req.body;
    await pool.query("UPDATE world_state SET exposure = exposure + $1", [delta || 0]);
    res.json({ status: "ok", message: `Exposición mundial ajustada en ${delta}` });
  } catch (err) {
    console.error("Error en /api/world/exposure:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 7. Artefactos Divinos — Copa, Lago, Espada
// ==========================================

// ⚱️ Copa Mortal
app.post("/api/mortalcup/use", async (req, res) => {
  try {
    const { uuid, name } = req.body;
    if (!uuid) return res.status(400).json({ error: "uuid requerido" });

    const player = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);
    if (player.rows.length === 0) {
      return res.json({
        result: "error",
        message: `⚠️ ${name}, tu alma no figura en los registros del Cónclave.`,
        outcome: "Rechazado",
      });
    }

    const data = player.rows[0];

    if (data.race && data.race.toLowerCase() === "nephilim") {
      return res.json({
        result: "success",
        message: `🌟 ${name}, ya has bebido de la Copa. Tu sangre es Nephilim.`,
        outcome: "Sin cambio",
      });
    }

    const fate = Math.random();
    if (fate < 0.75) {
      await pool.query("UPDATE players SET race = 'Nephilim', level = level + 1 WHERE uuid = $1", [
        uuid,
      ]);
      return res.json({
        result: "success",
        message: `✨ ${name}, la Copa Mortal acepta tu alma. Eres ahora Nephilim.`,
        outcome: "Ascendido",
      });
    } else {
      await pool.query("DELETE FROM players WHERE uuid = $1", [uuid]);
      return res.json({
        result: "failure",
        message: `💀 ${name}, la Copa te rechaza. Tu alma se disuelve en el éter.`,
        outcome: "Muerte espiritual",
      });
    }
  } catch (err) {
    console.error("Error en /api/mortalcup/use:", err);
    res.status(500).json({ error: err.message });
  }
});

// 💧 Lago Lyn
app.post("/api/lakelynn/use", async (req, res) => {
  try {
    const { uuid, name } = req.body;

    const player = await pool.query("SELECT * FROM players WHERE uuid = $1", [uuid]);
    if (player.rows.length === 0)
      return res.status(404).json({ error: "Jugador no encontrado" });

    await pool.query("UPDATE players SET xp = xp + 5, fear = GREATEST(fear - 3, 0) WHERE uuid = $1", [
      uuid,
    ]);

    res.json({
      status: "ok",
      message: `🌊 ${name} se ha bañado en el Lago Lyn y su espíritu ha sido purificado.`,
    });
  } catch (err) {
    console.error("Error en /api/lakelynn/use:", err);
    res.status(500).json({ error: err.message });
  }
});

// ⚔️ Espada Mortal
app.post("/api/sword/claim", async (req, res) => {
  try {
    const { uuid, name } = req.body;

    const owner = await pool.query("SELECT * FROM artifacts WHERE name = 'Espada Mortal'");
    if (owner.rows.length > 0 && owner.rows[0].owner_uuid)
      return res
        .status(400)
        .json({ error: "La Espada Mortal ya pertenece a otro portador." });

    await pool.query(
      `INSERT INTO artifacts (name, owner_uuid, fecha_claim)
       VALUES ('Espada Mortal', $1, NOW())
       ON CONFLICT (name)
       DO UPDATE SET owner_uuid = $1, fecha_claim = NOW()`,
      [uuid]
    );

    res.json({
      status: "ok",
      message: `⚔️ ${name} ha reclamado la Espada Mortal. Su destino ha cambiado.`,
    });
  } catch (err) {
    console.error("Error en /api/sword/claim:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🔹 Prueba del servidor
// ==========================================
app.get("/", (req, res) => {
  res.send("🌘 Shadow Realms API v5.0.3 — Servidor activo y estable.");
});

// ==========================================
// 🚀 Iniciar Servidor
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌑 Shadow Realms API escuchando en puerto ${PORT}`)
);
