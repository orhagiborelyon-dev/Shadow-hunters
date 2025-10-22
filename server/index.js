// index.js - Shadowhunters API Server
// Version 5.0 - Stable and Complete. Corrected Abilities Endpoint.

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
    console.log("Database URL is configured.");
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- 3. API ENDPOINTS ---

// ======== A. PUBLIC & PLAYER ENDPOINTS ========

app.get('/api/ping', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ status: 'alive' });
});

app.post('/api/players/register', async (req, res) => {
  const { owner_key, display_name, language } = req.body;
  const lang = (language === 'es') ? 'es' : 'en';
  try {
    await pool.query('INSERT INTO players (owner_key, display_name, language) VALUES ($1::uuid, $2, $3)', [owner_key, display_name, lang]);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(201).json({ message: 'Player registered' });
  } catch (error) {
    if (error.code === '23505') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(409).json({ code: 'ALREADY_REGISTERED' });
    }
    console.error('REGISTRATION ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/players/profile/:owner_key', async (req, res) => {
    const { owner_key } = req.params;
    try {
        const result = await pool.query('SELECT * FROM players WHERE owner_key = $1::uuid', [owner_key]);
        if (result.rows.length > 0) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Player not found' });
        }
    } catch (error) {
        console.error('GET PROFILE ERROR:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- GET PLAYER ABILITIES ENDPOINT (CORRECTED FORMAT) ---
app.get('/api/players/abilities/:owner_key', async (req, res) => {
    const { owner_key } = req.params;
    try {
        const result = await pool.query(
            `SELECT a.* FROM abilities a
             JOIN player_abilities pa ON a.id = pa.ability_id
             JOIN players p ON p.id = pa.player_id
             WHERE p.owner_key = $1::uuid`,
            [owner_key]
        );
        
        // Transform the array of objects into a single object
        const abilitiesObject = {};
        result.rows.forEach(ability => {
            abilitiesObject[ability.ability_code] = ability;
        });
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).json(abilitiesObject); // Return an object, not an array
    } catch (error) {
        console.error('GET ABILITIES ERROR:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/players/profile/update', async (req, res) => {
    const { owner_key, health, stamina, energy, xp, level } = req.body;
    if (!owner_key) { return res.status(400).json({ error: 'owner_key is required.' }); }
    const fieldsToUpdate = [];
    const values = [];
    let queryIndex = 1;
    if (health !== undefined) { fieldsToUpdate.push(`health = $${queryIndex++}`); values.push(health); }
    if (stamina !== undefined) { fieldsToUpdate.push(`stamina = $${queryIndex++}`); values.push(stamina); }
    if (energy !== undefined) { fieldsToUpdate.push(`energy = $${queryIndex++}`); values.push(energy); }
    if (xp !== undefined) { fieldsToUpdate.push(`xp = $${queryIndex++}`); values.push(xp); }
    if (level !== undefined) { fieldsToUpdate.push(`level = $${queryIndex++}`); values.push(level); }
    if (fieldsToUpdate.length === 0) { return res.status(400).json({ error: 'No fields to update.' }); }
    values.push(owner_key);
    const updateQuery = `UPDATE players SET ${fieldsToUpdate.join(', ')} WHERE owner_key = $${queryIndex}::uuid RETURNING *`;
    try {
        const result = await pool.query(updateQuery, values);
        if (result.rows.length > 0) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Player not found to update.' });
        }
    } catch (error) {
        console.error('UPDATE PROFILE ERROR:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ======== B. ADMIN ENDPOINTS ========

app.post('/api/admin/setrace', async (req, res) => {
    const { admin_key, target_key, new_race } = req.body;
    if (admin_key !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
    }
    if (!target_key || !new_race) { return res.status(400).json({ error: 'target_key and new_race are required.' }); }
    try {
        const result = await pool.query('UPDATE players SET race = $1 WHERE owner_key = $2::uuid RETURNING *', [new_race, target_key]);
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Player not found.' });
        }
    } catch (error) {
        console.error('SETRACE ERROR:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/grant_ability', async (req, res) => {
    const { admin_key, target_key, ability_code } = req.body;
    if (admin_key !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
    }
    if (!target_key || !ability_code) { return res.status(400).json({ error: 'target_key and ability_code are required.' }); }
    try {
        await pool.query(
            `INSERT INTO player_abilities (player_id, ability_id) SELECT p.id, a.id FROM players p, abilities a WHERE p.owner_key = $1::uuid AND a.ability_code = $2`,
            [target_key, ability_code]
        );
        res.status(200).json({ message: `Ability ${ability_code} granted.` });
    } catch (error) {
        if (error.code === '23505') { return res.status(409).json({ error: 'Player already has this ability.' }); }
        console.error('GRANT ABILITY ERROR:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// --- 4. START SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadowhunters API server is running on port ${port}`);
});
