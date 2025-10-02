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

// AÑADE ESTA LÍNEA PARA VERIFICAR
console.log(`Database URL Status: ${process.env.DATABASE_URL ? 'Loaded' : 'NOT FOUND'}`);

// Helper: validar UUID v4 (acepta tanto mayúsculas como minúsculas)
function isUuid(value) {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// index.js (endpoint de registro MODIFICADO)
app.post('/api/players/register', async (req, res) => {
  // Ahora también esperamos 'language'
  const { owner_key, display_name, language } = req.body;

  if (!owner_key || !display_name) {
    return res.status(400).json({ error: 'owner_key and display_name are required' });
  }

  if (!isUuid(owner_key)) {
    return res.status(400).json({ error: 'owner_key must be a valid UUID' });
  }

  // Si el idioma no viene, lo ponemos en inglés por defecto
  const lang = (language === 'es') ? 'es' : 'en';

  try {
    const result = await pool.query(
      // Actualizamos la consulta para incluir el idioma
      'INSERT INTO players (owner_key, display_name, language) VALUES ($1::uuid, $2, $3) RETURNING id',
      [owner_key, display_name, lang]
    );
    console.log(`Player registered: ${display_name} (${owner_key}) in language: ${lang}`);
    res.status(201).json({ message: 'Player registered successfully' });
  } catch (error) {
    // If the error is a unique constraint violation (player already exists)
    if (error.code === '23505') { 
      console.log(`Registration failed: Player already exists (${display_name})`);
      // Return a 409 Conflict with a specific 'code' for the LSL script to parse.
      return res.status(409).json({ 
          error: 'Player already registered', 
          code: 'ALREADY_REGISTERED' 
      });
    }
    
    // For any other unexpected errors.
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint de Obtener Perfil (Corregido)
app.get('/api/players/profile/:owner_key', async (req, res) => {
    const { owner_key } = req.params;

    if (!isUuid(owner_key)) {
      return res.status(400).json({ error: 'owner_key must be a valid UUID' });
    }

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

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Shadowhunters API server is running on port ${port}`);
});
