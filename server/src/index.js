// index.js - Shadowhunters API Server
// Version 2.1 - Unified, Debug-Ready, and Fully Functional

// --- 1. SETUP ---
require('dotenv').config(); // Carga las variables de entorno
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json()); // Middleware para parsear cuerpos JSON

// --- 2. DATABASE CONNECTION ---
// Verificamos que la URL de la base de datos esté configurada
if (!process.env.DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
    // En un entorno real, podríamos cerrar el proceso: process.exit(1);
} else {
    console.log("Database URL is configured. Attempting to connect...");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Esta configuración es necesaria para servicios como Render o Heroku
  ssl: {
    rejectUnauthorized: false
  }
});

// --- 3. API ENDPOINTS ---

// --- PING TEST ENDPOINT ---
// Usado para verificar si el servidor está vivo y respondiendo.
app.get('/api/ping', (req, res) => {
  console.log("PING received. Sending response.");
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// --- REGISTER PLAYER ENDPOINT ---
// Crea un nuevo jugador en la base de datos.
app.post('/api/players/register', async (req, res) => {
  const { owner_key, display_name, language } = req.body;
  console.log(`Attempting to register player: ${display_name} (${owner_key})`);

  if (!owner_key || !display_name) {
    return res.status(400).json({ error: 'owner_key and display_name are required' });
  }

  const lang = (language === 'es') ? 'es' : 'en';

  try {
    const result = await pool.query(
      'INSERT INTO players (owner_key, display_name, language) VALUES ($1::uuid, $2, $3) RETURNING id',
      [owner_key, display_name, lang]
    );
    console.log(`Player registered successfully: ${display_name}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(201).json({ message: 'Player registered successfully', playerId: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') { // Error de 'unique constraint violation'
      console.warn(`Registration failed: Player already exists (${display_name})`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(409).json({ error: 'Player already registered', code: 'ALREADY_REGISTERED' });
    }
    console.error('CRITICAL ERROR during registration:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// --- GET PLAYER PROFILE ENDPOINT ---
// Obtiene los datos de un jugador existente.
app.get('/api/players/profile/:owner_key', async (req, res) => {
    const { owner_key } = req.params;
    console.log(`Fetching profile for key: ${owner_key}`);

    try {
        const result = await pool.query('SELECT * FROM players WHERE owner_key = $1::uuid', [owner_key]);
        
        if (result.rows.length > 0) {
            const playerData = result.rows[0];
            console.log("Player data found:", playerData.display_name);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.status(200).json(playerData);
        } else {
            console.warn(`Player with key ${owner_key} not found in database.`);
            res.status(404).json({ error: 'Player not found' });
        }
    } catch (error) {
        console.error('CRITICAL ERROR fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- UPDATE PLAYER PROFILE ENDPOINT ---
// Actualiza los datos de un jugador (ej. guardar progreso).
app.post('/api/players/profile/update', async (req, res) => {
    const { owner_key, health, stamina, xp, level } = req.body;
    console.log(`Attempting to update profile for key: ${owner_key}`);

    if (!owner_key) {
        return res.status(400).json({ error: 'owner_key is required in the request body.' });
    }

    const fieldsToUpdate = [];
    const values = [];
    let queryIndex = 1;

    if (health !== undefined) { fieldsToUpdate.push(`health = $${queryIndex++}`); values.push(health); }
    if (stamina !== undefined) { fieldsToUpdate.push(`stamina = $${queryIndex++}`); values.push(stamina); }
    if (xp !== undefined) { fieldsToUpdate.push(`xp = $${queryIndex++}`); values.push(xp); }
    if (level !== undefined) { fieldsToUpdate.push(`level = $${queryIndex++}`); values.push(level); }

    if (fieldsToUpdate.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update were provided.' });
    }

    values.push(owner_key);
    const updateQuery = `UPDATE players SET ${fieldsToUpdate.join(', ')} WHERE owner_key = $${queryIndex}::uuid RETURNING *`;

    try {
        const result = await pool.query(updateQuery, values);
        if (result.rows.length > 0) {
            console.log(`Profile updated successfully for ${owner_key}`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.status(200).json(result.rows[0]);
        } else {
            console.warn(`Player with key ${owner_key} not found to update.`);
            res.status(404).json({ error: `Player not found to update.` });
        }
    } catch (error) {
        console.error('CRITICAL ERROR updating profile:', error);
        res.status(500).json({ error: 'Internal server error during profile update.' });
    }
});


// --- 4. START SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadowhunters API server is running on port ${port}`);
});
