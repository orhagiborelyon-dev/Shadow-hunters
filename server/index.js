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

// --- ADMIN ENDPOINT: SET PLAYER RACE ---
// Este endpoint está protegido por una clave secreta.
app.post('/api/admin/setrace', async (req, res) => {
    // 1. Extraemos los datos y la clave de admin
    const { admin_key, target_key, new_race } = req.body;
    console.log(`Admin request to set race for ${target_key} to ${new_race}`);

    // 2. Verificación de Seguridad
    if (admin_key !== process.env.ADMIN_API_KEY) {
        console.warn(`Unauthorized attempt to use setrace endpoint. Key provided: ${admin_key}`);
        return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
    }

    // 3. Validación de Datos
    if (!target_key || !new_race) {
        return res.status(400).json({ error: 'target_key and new_race are required.' });
    }

    // (Opcional) Lista de razas válidas para evitar datos basura
    const validRaces = ['Mundane', 'Nephilim', 'Vampire', 'Werewolf', 'Warlock', 'Faerie'];
    if (!validRaces.includes(new_race)) {
        return res.status(400).json({ error: `Invalid race: ${new_race}` });
    }

    // 4. Ejecución de la Actualización en la Base de Datos
    try {
        const result = await pool.query(
            'UPDATE players SET race = $1 WHERE owner_key = $2::uuid RETURNING *',
            [new_race, target_key]
        );

        if (result.rows.length > 0) {
            console.log(`SUCCESS: Race for ${target_key} changed to ${new_race}`);
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: `Player with key ${target_key} not found.` });
        }
    } catch (error) {
        console.error('CRITICAL ERROR during setrace:', error);
        res.status(500).json({ error: 'Internal server error during setrace.' });
    }
});

// --- GET PLAYER ABILITIES ENDPOINT ---
// Obtiene todas las habilidades que un jugador ha aprendido.
app.get('/api/players/abilities/:owner_key', async (req, res) => {
    const { owner_key } = req.params;
    console.log(`Fetching abilities for key: ${owner_key}`);

    try {
        // Hacemos una consulta compleja (JOIN) para obtener los detalles de las habilidades
        const result = await pool.query(
            `SELECT a.* FROM abilities a
             JOIN player_abilities pa ON a.id = pa.ability_id
             JOIN players p ON p.id = pa.player_id
             WHERE p.owner_key = $1::uuid`,
            [owner_key]
        );
        
        console.log(`Found ${result.rows.length} abilities for ${owner_key}`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).json(result.rows); // Devuelve un array de objetos de habilidad
    } catch (error) {
        console.error('CRITICAL ERROR fetching abilities:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- ADMIN ENDPOINT: GRANT ABILITY ---
// Permite a un admin enseñar una habilidad a un jugador.
app.post('/api/admin/grant_ability', async (req, res) => {
    const { admin_key, target_key, ability_code } = req.body;
    console.log(`Admin request to grant ability '${ability_code}' to ${target_key}`);

    if (admin_key !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
    }
    if (!target_key || !ability_code) {
        return res.status(400).json({ error: 'target_key and ability_code are required.' });
    }

    try {
        // Usamos una subconsulta para obtener los IDs correctos y hacer la inserción
        await pool.query(
            `INSERT INTO player_abilities (player_id, ability_id)
             SELECT p.id, a.id FROM players p, abilities a
             WHERE p.owner_key = $1::uuid AND a.ability_code = $2`,
            [target_key, ability_code]
        );
        
        console.log(`SUCCESS: Granted ability '${ability_code}' to ${target_key}`);
        res.status(200).json({ message: `Ability ${ability_code} granted successfully.` });
    } catch (error) {
        // Si la habilidad ya fue aprendida, dará un error de unicidad
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Player has already learned this ability.' });
        }
        console.error('CRITICAL ERROR granting ability:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- ENDPOINT PARA ESTUDIAR UN LIBRO ---
app.post('/api/players/study_book', async (req, res) => {
    const { owner_key, book_code } = req.body;
    console.log(`Received study request from ${owner_key} for book ${book_code}`);

    if (!owner_key || !book_code) {
        return res.status(400).json({ error: 'owner_key and book_code are required.' });
    }

    // (Aquí irá la lógica real de dar el +1 STR, etc.)
    
    console.log(`Player ${owner_key} has studied the book ${book_code}. Granting reward (simulation).`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ message: 'Knowledge absorbed.' });
});

// --- 4. START SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadowhunters API server is running on port ${port}`);
});
