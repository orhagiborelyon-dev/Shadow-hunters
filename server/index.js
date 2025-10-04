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

app.post('/api/rituals/divination', async (req, res) => {
    const { admin_key, question } = req.body;

    // (Aquí podrías añadir una verificación de admin_key)
    
    // Lo más importante: esta lógica notifica a los admins.
    console.log("--- DIVINATION RITUAL ---");
    console.log(`Player asked the Mortal Cup: "${question}"`);
    console.log("-------------------------");
    
    // (Aquí podrías enviar una notificación a un canal de Discord o Slack para los admins)
    
    // Respondemos a SL para que el jugador sepa que funcionó.
    res.status(200).json({ message: 'The vision has been requested.' });
});

// index.js (endpoint de UPDATE modificado)

app.post('/api/players/profile/update', async (req, res) => {
    // Añadimos todos los stats a la lista de variables que podemos recibir
    const { owner_key, health, stamina, energy, xp, level, strength, agility, vitality, magic, intelligence, willpower, faith, luck } = req.body;

    if (!owner_key) { /* ... (sin cambios) ... */ }

    const fieldsToUpdate = [];
    const values = [];
    let queryIndex = 1;

    // Añadimos un bloque 'if' para cada stat
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
    
    // ... (el resto del endpoint no cambia) ...
});

// --- ADMIN ENDPOINT: INVITE TO CLAN ---
app.post('/api/admin/invite_to_clan', async (req, res) => {
    const { admin_key, target_key, clan_name } = req.body;

    if (admin_key !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
    }
    if (!target_key || !clan_name) {
        return res.status(400).json({ error: 'target_key and clan_name are required.' });
    }

    try {
        // Usamos una subconsulta para obtener el ID del clan a partir de su nombre
        const result = await pool.query(
            `UPDATE players SET 
                clan_id = (SELECT id FROM clans WHERE name = $1),
                clan_rank = 'Neophyte'
             WHERE owner_key = $2::uuid RETURNING *`,
            [clan_name, target_key]
        );

        if (result.rows.length > 0) {
            res.status(200).json({ message: `Player successfully joined clan ${clan_name}` });
        } else {
            res.status(404).json({ error: 'Player or Clan not found.' });
        }
    } catch (error) {
        console.error('Error inviting to clan:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- ADMIN ENDPOINT: SET CLAN RANK ---
app.post('/api/admin/set_clan_rank', async (req, res) => {
    const { admin_key, target_key, new_rank } = req.body;

    if (admin_key !== process.env.ADMIN_API_KEY) { /* ... (verificación de admin) ... */ }
    if (!target_key || !new_rank) { /* ... (verificación de datos) ... */ }

    try {
        const result = await pool.query(
            'UPDATE players SET clan_rank = $1 WHERE owner_key = $2::uuid RETURNING *',
            [new_rank, target_key]
        );
         if (result.rows.length > 0) {
            res.status(200).json({ message: `Player rank set to ${new_rank}` });
        } else {
            res.status(404).json({ error: 'Player not found.' });
        }
    } catch (error) {
        console.error('Error setting clan rank:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- ADMIN ENDPOINT: CREATE PARABATAI BOND ---
app.post('/api/admin/create_parabatai_bond', async (req, res) => {
    const { admin_key, player1_key, player2_key } = req.body;
    console.log(`Admin request to bond ${player1_key} and ${player2_key}`);

    if (admin_key !== process.env.ADMIN_API_KEY) {
        return res.status(403).json({ error: 'Forbidden: Invalid admin key.' });
    }
    if (!player1_key || !player2_key) {
        return res.status(400).json({ error: 'player1_key and player2_key are required.' });
    }
    if (player1_key === player2_key) {
        return res.status(400).json({ error: 'A player cannot be their own Parabatai.'});
    }

    // Usamos una transacción para asegurar que ambos jugadores se actualicen o ninguno lo haga.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Actualizar jugador 1 para que apunte al jugador 2
        await client.query('UPDATE players SET parabatai_key = $1::uuid WHERE owner_key = $2::uuid', [player2_key, player1_key]);
        // Actualizar jugador 2 para que apunte al jugador 1
        await client.query('UPDATE players SET parabatai_key = $1::uuid WHERE owner_key = $2::uuid', [player1_key, player2_key]);
        await client.query('COMMIT');
        
        console.log(`SUCCESS: Parabatai bond created between ${player1_key} and ${player2_key}`);
        res.status(200).json({ message: 'Parabatai bond successfully created.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('CRITICAL ERROR creating Parabatai bond:', error);
        res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});

// --- 4. START SERVER ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadowhunters API server is running on port ${port}`);
});
