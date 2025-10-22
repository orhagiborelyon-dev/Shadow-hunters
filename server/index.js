// index.js - Shadowhunters API Server
// Version 3.0 - Fully organized, complete, and debug-ready.

// --- 1. SETUP ---
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// --- 2. DATABASE CONNECTION ---
if (!process.env.DATABASE_URL) {
    console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
} else {
    console.log("Database URL is configured. Attempting to connect...");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- 3. API ENDPOINTS ---

// ======== A. PUBLIC & PLAYER ENDPOINTS ========

// --- PING TEST ENDPOINT ---
app.get('/api/ping', (req, res) => {
  console.log("PING received.");
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// --- REGISTER PLAYER ENDPOINT ---
app.post('/api/players/register', async (req, res) => {
  const { owner_key, display_name, language } = req.body;
  const lang = (language === 'es') ? 'es' : 'en';
  try {
    await pool.query(
      'INSERT INTO players (owner_key, display_name, language) VALUES ($1::uuid, $2, $3)',
      [owner_key, display_name, lang]
    );
    console.log(`Player registered: ${display_name}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(201).json({ message: 'Player registered successfully' });
  } catch (error) {
    if (error.code === '23505') {
      console.warn(`Registration failed: Player already exists (${display_name})`);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(409).json({ error: 'Player already registered', code: 'ALREADY_REGISTERED' });
    }
    console.error('CRITICAL ERROR during registration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- GET PLAYER ABILITIES ENDPOINT ---
// Obtiene todas las habilidades que un jugador ha aprendido.
app.get('/api/players/abilities/:owner_key', async (req, res) => {
    const { owner_key } = req.params;
    console.log(`Fetching abilities for key: ${owner_key}`);

    try {
        const query = `
            SELECT a.* FROM abilities a
            JOIN player_abilities pa ON a.id = pa.ability_id
            JOIN players p ON p.id = pa.player_id
            WHERE p.owner_key = $1::uuid`;
            
        const result = await pool.query(query, [owner_key]);
        
        console.log(`Database query found ${result.rows.length} abilities for ${owner_key}.`);
        
        // No hay razón para que esto no devuelva todas las filas.
        // Lo devolvemos directamente.
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).json(result.rows); 

    } catch (error) {
        console.error('CRITICAL ERROR fetching abilities:', error);
        res.status(500).json({ error: 'Internal server error' });
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

// --- GET PLAYER ABILITY NAMES ENDPOINT ---
app.get('/api/players/abilities/names/:owner_key', async (req, res) => {
    const { owner_key } = req.params;
    try {
        const result = await pool.query(
            `SELECT a.ability_code FROM abilities a
             JOIN player_abilities pa ON a.id = pa.ability_id
             JOIN players p ON p.id = pa.player_id
             WHERE p.owner_key = $1::uuid`, [owner_key]
        );
        const abilityCodes = result.rows.map(row => row.ability_code);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).json(abilityCodes);
    } catch (error) {
        console.error('CRITICAL ERROR fetching ability names:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- UPDATE PLAYER PROFILE ENDPOINT ---
app.post('/api/players/profile/update', async (req, res) => {
    const { owner_key, health, stamina, energy, xp, level, strength, agility, vitality, magic, intelligence, willpower, faith, luck } = req.body;
    if (!owner_key) { return res.status(400).json({ error: 'owner_key is required.' }); }
    const fieldsToUpdate = [];
    const values = [];
    let queryIndex = 1;
    if (health !== undefined) { fieldsToUpdate.push(`health = $${queryIndex++}`); values.push(health); }
    if (stamina !== undefined) { fieldsToUpdate.push(`stamina = $${queryIndex++}`); values.push(stamina); }
    if (energy !== undefined) { fieldsToUpdate.push(`energy = $${queryIndex++}`); values.push(energy); }
    if (xp !== undefined) { fieldsToUpdate.push(`xp = $${queryIndex++}`); values.push(xp); }
    if (level !== undefined) { fieldsToUpdate.push(`level = $${queryIndex++}`); values.push(level); }
    if (strength !== undefined) { fieldsToUpdate.push(`strength = $${queryIndex++}`); values.push(strength); }
    if (agility !== undefined) { fieldsToUpdate.push(`agility = $${queryIndex++}`); values.push(agility); }
    if (vitality !== undefined) { fieldsToUpdate.push(`vitality = $${queryIndex++}`); values.push(vitality); }
    if (magic !== undefined) { fieldsToUpdate.push(`magic = $${queryIndex++}`); values.push(magic); }
    if (intelligence !== undefined) { fieldsToUpdate.push(`intelligence = $${queryIndex++}`); values.push(intelligence); }
    if (willpower !== undefined) { fieldsToUpdate.push(`willpower = $${queryIndex++}`); values.push(willpower); }
    if (faith !== undefined) { fieldsToUpdate.push(`faith = $${queryIndex++}`); values.push(faith); }
    if (luck !== undefined) { fieldsToUpdate.push(`luck = $${queryIndex++}`); values.push(luck); }
    if (fieldsToUpdate.length === 0) { return res.status(400).json({ error: 'No valid fields to update.' }); }
    values.push(owner_key);
    const updateQuery = `UPDATE players SET ${fieldsToUpdate.join(', ')} WHERE owner_key = $${queryIndex}::uuid RETURNING *`;
    try {
        const result = await pool.query(updateQuery, values);
        if (result.rows.length > 0) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: `Player not found to update.` });
        }
    } catch (error) {
        console.error('CRITICAL ERROR updating profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ======== B. ADMIN & STORYTELLING ENDPOINTS ========

// Middleware to check for admin key on all routes starting with /api/admin
const checkAdminKey = (req, res, next) => {
    const admin_key = req.body.admin_key || req.headers['x-admin-key'];
    if (admin_key !== process.env.ADMIN_API_KEY) {
        console.warn(`Unauthorized attempt to use an admin endpoint.`);
        return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
    }
    next();
};

const adminRouter = express.Router();
adminRouter.use(checkAdminKey); // Apply the security check to all routes below

// --- ADMIN: SET PLAYER RACE ---
adminRouter.post('/setrace', async (req, res) => {
    const { target_key, new_race } = req.body;
    if (!target_key || !new_race) { return res.status(400).json({ error: 'target_key and new_race are required.' }); }
    const validRaces = ['Mundane', 'Nephilim', 'Vampire', 'Werewolf', 'Warlock', 'Faerie', 'Angel', 'Demon'];
    if (!validRaces.includes(new_race)) { return res.status(400).json({ error: `Invalid race: ${new_race}` }); }
    try {
        const result = await pool.query('UPDATE players SET race = $1 WHERE owner_key = $2::uuid RETURNING *', [new_race, target_key]);
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Player not found.' });
        }
    } catch (error) {
        console.error('CRITICAL ERROR during setrace:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- ADMIN: GRANT ABILITY ---
adminRouter.post('/grant_ability', async (req, res) => {
    const { target_key, ability_code } = req.body;
    if (!target_key || !ability_code) { return res.status(400).json({ error: 'target_key and ability_code are required.' }); }
    try {
        await pool.query(
            `INSERT INTO player_abilities (player_id, ability_id)
             SELECT p.id, a.id FROM players p, abilities a
             WHERE p.owner_key = $1::uuid AND a.ability_code = $2`,
            [target_key, ability_code]
        );
        res.status(200).json({ message: `Ability ${ability_code} granted.` });
    } catch (error) {
        if (error.code === '23505') { return res.status(409).json({ error: 'Player already has this ability.' }); }
        console.error('CRITICAL ERROR granting ability:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// (Aquí podrías añadir más rutas de admin como set_clan_rank, create_parabatai_bond, etc.)

// --- REGISTER ADMIN ROUTER ---
// Le decimos a nuestra app principal que use este router para todas las rutas que empiecen con /api/admin
app.use('/api/admin', adminRouter);


// --- 4. START SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadowhunters API server is running on port ${port}`);
});
