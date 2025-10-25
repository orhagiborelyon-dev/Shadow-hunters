// 🌑 Shadow Realms API v3.0 (Node.js + Express + PostgreSQL)
// Módulos integrados: bloodlines, rituals, parabatai, families, abilities, buffs, world
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ----- Helpers comunes -----
async function queryDb(text, params) {
  const res = await pool.query(text, params);
  return res;
}

// ----- ENDPOINTS CORE (jugadores) -----
app.get('/api/ping', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.post('/api/register', async (req, res) => {
  const { owner_key, display_name, race } = req.body;
  if (!owner_key || !display_name) {
    return res.status(400).json({ error: 'owner_key and display_name required.' });
  }
  try {
    await queryDb(
      'INSERT INTO players (owner_key, display_name, race, level, xp, health, stamina, energy) VALUES ($1::uuid, $2, $3, 1, 0, 100, 100, 100)',
      [owner_key, display_name, race || 'Mundane']
    );
    res.status(201).json({ message: 'Player registered successfully.' });
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Player already exists.' });
    } else {
      console.error('REGISTER ERROR:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
});

app.get('/api/profile/:owner_key', async (req, res) => {
  const { owner_key } = req.params;
  try {
    const result = await queryDb(
      'SELECT display_name AS name, race, level, xp, health, stamina, energy FROM players WHERE owner_key = $1::uuid',
      [owner_key]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found.' });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('GET PROFILE ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/stats/update', async (req, res) => {
  const { owner_key, health, stamina, energy, xp, level } = req.body;
  if (!owner_key) {
    return res.status(400).json({ error: 'owner_key required.' });
  }
  const fields = [];
  const values = [];
  let i = 1;
  if (health !== undefined) { fields.push(`health = $${i++}`); values.push(health); }
  if (stamina !== undefined) { fields.push(`stamina = $${i++}`); values.push(stamina); }
  if (energy !== undefined) { fields.push(`energy = $${i++}`); values.push(energy); }
  if (xp !== undefined) { fields.push(`xp = $${i++}`); values.push(xp); }
  if (level !== undefined) { fields.push(`level = $${i++}`); values.push(level); }
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update.' });
  }
  values.push(owner_key);
  const query = `UPDATE players SET ${fields.join(', ')} WHERE owner_key = $${i}::uuid RETURNING *`;
  try {
    const result = await queryDb(query, values);
    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'Player not found.' });
    }
  } catch (error) {
    console.error('UPDATE STATS ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----- ENDPOINTS PARABATAI -----
app.post('/api/parabatai/create', async (req, res) => {
  const { admin_key, key1, key2 } = req.body;
  if (admin_key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
  }
  if (!key1 || !key2 || key1 === key2) {
    return res.status(400).json({ error: 'Valid distinct keys required.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT owner_key, parabatai_key FROM players WHERE owner_key = $1::uuid OR owner_key = $2::uuid`,
      [key1, key2]
    );
    for (const row of check.rows) {
      if (row.parabatai_key) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Player ${row.owner_key} already has a Parabatai.` });
      }
    }
    await client.query(
      `UPDATE players SET parabatai_key = $1::uuid WHERE owner_key = $2::uuid`,
      [key2, key1]
    );
    await client.query(
      `UPDATE players SET parabatai_key = $1::uuid WHERE owner_key = $2::uuid`,
      [key1, key2]
    );
    await client.query('COMMIT');
    res.status(200).json({ message: `Parabatai bond established between ${key1} and ${key2}.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CREATE PARABATAI ERROR:', error);
    res.status(500).json({ error: 'Internal server error during bond creation.' });
  } finally {
    client.release();
  }
});

app.post('/api/parabatai/break', async (req, res) => {
  const { admin_key, key1, key2 } = req.body;
  if (admin_key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
  }
  try {
    const result = await queryDb(
      `UPDATE players SET parabatai_key = NULL WHERE owner_key = $1::uuid OR owner_key = $2::uuid RETURNING *`,
      [key1, key2]
    );
    res.status(200).json({ message: `Parabatai bond broken between ${key1} and ${key2}.`, result: result.rows });
  } catch (error) {
    console.error('BREAK PARABATAI ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----- ENDPOINTS RITUALS -----
app.post('/api/ritual/start', async (req, res) => {
  const { owner_key, ritual_code } = req.body;
  if (!owner_key || !ritual_code) {
    return res.status(400).json({ error: 'owner_key and ritual_code required.' });
  }
  try {
    await queryDb(
      'INSERT INTO rituals (owner_key, ritual_code, started_at, status) VALUES ($1::uuid, $2, NOW(), \'in_progress\') RETURNING id',
      [owner_key, ritual_code]
    );
    res.status(200).json({ message: `Ritual '${ritual_code}' started.`, status: 'in_progress' });
  } catch (error) {
    if (error.code === '42P01') {
      console.warn("Table 'rituals' not found.");
      return res.status(200).json({ message: `Ritual '${ritual_code}' simulated (no table).`, status: 'in_progress' });
    }
    console.error('START RITUAL ERROR:', error);
    res.status(500).json({ error: 'Internal server error starting ritual.' });
  }
});

app.post('/api/ritual/complete', async (req, res) => {
  const { ritual_id, result } = req.body;
  if (!ritual_id || !result) {
    return res.status(400).json({ error: 'ritual_id and result required.' });
  }
  try {
    const update = await queryDb(
      'UPDATE rituals SET completed_at = NOW(), status = $1 WHERE id = $2 RETURNING *',
      [result, ritual_id]
    );
    if (update.rows.length === 0) {
      return res.status(404).json({ error: 'Ritual not found.' });
    }
    res.status(200).json({ message: `Ritual ${ritual_id} completed with result: ${result}`, ritual: update.rows[0] });
  } catch (error) {
    console.error('COMPLETE RITUAL ERROR:', error);
    res.status(500).json({ error: 'Internal server error completing ritual.' });
  }
});

// ----- ENDPOINTS BLOODLINES -----
app.get('/api/bloodlines/vampire', async (req, res) => {
  try {
    const result = await queryDb('SELECT * FROM bloodlines_vampire ORDER BY generation ASC', []);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('GET BLOODLINES VAMPIRE ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/api/bloodlines/werewolf', async (req, res) => {
  try {
    const result = await queryDb('SELECT * FROM bloodlines_werewolf ORDER BY generation ASC', []);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('GET BLOODLINES WEREWOLF ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/bloodlines/vampire/add', async (req, res) => {
  const { admin_key, name, generation, sire_key } = req.body;
  if (admin_key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Invalid admin key.' });
  }
  try {
    await queryDb(
      'INSERT INTO bloodlines_vampire (name, generation, sire_key) VALUES ($1, $2, $3::uuid)',
      [name, generation, sire_key]
    );
    res.status(201).json({ message: 'Vampire bloodline added.' });
  } catch (error) {
    console.error('ADD VAMPIRE BLOODLINE ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/bloodlines/werewolf/add', async (req, res) => {
  const { admin_key, name, generation, sire_key } = req.body;
  if (admin_key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Invalid admin key.' });
  }
  try {
    await queryDb(
      'INSERT INTO bloodlines_werewolf (name, generation, sire_key) VALUES ($1, $2, $3::uuid)',
      [name, generation, sire_key] 
    );
    res.status(201).json({ message: 'Werewolf bloodline added.' });
  } catch (error) {
    console.error('ADD WEREWOLF BLOODLINE ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----- ENDPOINTS FAMILIES NEPHILIM -----
app.post('/api/families/register', async (req, res) => {
  const { admin_key, patriarch_key, family_name } = req.body;
  if (admin_key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Invalid admin key.' });
  }
  if (!patriarch_key || !family_name) {
    return res.status(400).json({ error: 'patriarch_key and family_name required.' });
  }
  try {
    await queryDb(
      'INSERT INTO families (family_name, patriarch_key) VALUES ($1, $2::uuid)',
      [family_name, patriarch_key]
    );
    res.status(201).json({ message: 'Family registered.' });
  } catch (error) {
    console.error('REGISTER FAMILY ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/api/families/tree/:family_name', async (req, res) => {
  const { family_name } = req.params;
  try {
    const result = await queryDb(
      'SELECT * FROM family_members WHERE family_name = $1 ORDER BY generation ASC',
      [family_name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Family not found.' });
    }
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('GET FAMILY TREE ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----- ENDPOINTS HABILIDADES -----
app.get('/api/abilities/:race', async (req, res) => {
  const { race } = req.params;
  try {
    const result = await queryDb(
      'SELECT * FROM abilities WHERE race = $1',
      [race]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('GET ABILITIES ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/abilities/grant', async (req, res) => {
  const { admin_key, target_key, ability_code } = req.body;
  if (admin_key !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Invalid admin key.' });
  }
  try {
    await queryDb(
      `INSERT INTO player_abilities (player_id, ability_id)
       SELECT p.id, a.id FROM players p, abilities a
       WHERE p.owner_key = $1::uuid AND a.ability_code = $2`,
      [target_key, ability_code]
    );
    res.status(200).json({ message: `Ability ${ability_code} granted to ${target_key}.` });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Player already has this ability.' });
    }
    console.error('GRANT ABILITY ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----- ENDPOINTS BUFFS -----
app.post('/api/buffs/apply', async (req, res) => {
  const { owner_key, buff_code, duration } = req.body;
  if (!owner_key || !buff_code || !duration) {
    return res.status(400).json({ error: 'owner_key, buff_code and duration required.' });
  }
  try {
    await queryDb(
      'INSERT INTO active_buffs (owner_key, buff_code, end_time) VALUES ($1::uuid, $2, NOW() + ($3 * INTERVAL \'1 second\'))',
      [owner_key, buff_code, duration]
    );
    res.status(200).json({ message: `Buff ${buff_code} applied to ${owner_key}.` });
  } catch (error) {
    console.error('APPLY BUFF ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/buffs/remove', async (req, res) => {
  const { owner_key, buff_code } = req.body;
  if (!owner_key || !buff_code) {
    return res.status(400).json({ error: 'owner_key and buff_code required.' });
  }
  try {
    await queryDb(
      'DELETE FROM active_buffs WHERE owner_key = $1::uuid AND buff_code = $2',
      [owner_key, buff_code]
    );
    res.status(200).json({ message: `Buff ${buff_code} removed from ${owner_key}.` });
  } catch (error) {
    console.error('REMOVE BUFF ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----- ENDPOINTS MUNDO / RADAR -----
app.get('/api/world/nearby/:owner_key', async (req, res) => {
  const { owner_key } = req.params;
  // Ejemplo simplificado: en producción necesitarás registrar localizaciones de jugadores
  try {
    const result = await queryDb(
      `SELECT owner_key, display_name, race FROM players
       WHERE owner_key != $1::uuid LIMIT 10`,
      [owner_key]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('GET WORLD NEARBY ERROR:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ----- INICIAR SERVIDOR -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌌 Shadow Realms API v3.0 running on port ${PORT}`);
});
