// index.js - Shadowhunters API Server (v1.1 - Corregido tipo UUID)

const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Endpoint de Registro de Jugador (Corregido)
app.post('/api/players/register', async (req, res) => {
  const { owner_key, display_name } = req.body;

  if (!owner_key || !display_name) {
    return res.status(400).json({ error: 'owner_key and display_name are required' });
  }

  try {
    const result = await pool.query(
      // Se añade '::uuid' para asegurar la conversión de tipo correcta.
      'INSERT INTO players (owner_key, display_name) VALUES ($1::uuid, $2) RETURNING id',
      [owner_key, display_name]
    );
    console.log(`Player registered: ${display_name} (${owner_key})`);
    res.status(201).json({ message: 'Player registered successfully', playerId: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') {
      console.log(`Registration failed: Player already exists (${display_name})`);
      return res.status(409).json({ error: 'Player already registered' });
    }
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint de Obtener Perfil (Corregido)
app.get('/api/players/profile/:owner_key', async (req, res) => {
    const { owner_key } = req.params;

    try {
        const result = await pool.query(
            // Se añade '::uuid' para asegurar la conversión de tipo correcta.
            'SELECT * FROM players WHERE owner_key = $1::uuid',
            [owner_key]
        );
        
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Player not found' });
        }
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadowhunters API server is running on port ${port}`);
});
