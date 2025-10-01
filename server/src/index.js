// 1. Importar las herramientas que necesitamos
const express = require('express');
const { Pool } = require('pg');

// 2. Crear la aplicación del servidor
const app = express();
app.use(express.json()); // Middleware para que entienda JSON

// 3. Configurar la conexión a la base de datos
// Usamos variables de entorno para la URL de conexión y el puerto
let connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || '';

// Si nos han dado un puerto (ej. PGPORT) y la connectionString no lo incluye,
// lo añadimos para forzar el puerto (útil cuando la DB escucha en 5432 explícitamente).
try {
  if (connectionString) {
    const parsed = new URL(connectionString);
    if (!parsed.port && process.env.PGPORT) {
      parsed.port = process.env.PGPORT;
      connectionString = parsed.toString();
    }
  }
} catch (e) {
  // Si falla el parseo, ignoramos y seguimos con la connectionString original
}

// Si no hay connectionString, permitimos usar variables sueltas (HOST/PORT/USER/...)
let poolConfig;
if (connectionString) {
  poolConfig = {
    connectionString,
    ssl: { rejectUnauthorized: false }
  };
} else {
  poolConfig = {
    host: process.env.PGHOST || process.env.PG_HOST || 'localhost',
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    user: process.env.PGUSER || process.env.PG_USER,
    password: process.env.PGPASSWORD || process.env.PG_PASSWORD,
    database: process.env.PGDATABASE || process.env.PG_DATABASE,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

const pool = new Pool(poolConfig);

// Helper: chequea conexión a la base de datos (no bloquea el arranque si falla)
async function checkDb() {
  if (!connectionString) {
    console.warn('DATABASE_URL no configurada — la app seguirá corriendo sin DB');
    return;
  }
  try {
    await pool.query('SELECT 1');
    console.log('Conexión a la base de datos OK');
  } catch (err) {
    console.warn('No se pudo conectar a la base de datos:', err.message || err);
  }
}

// 4. Definir nuestro primer endpoint: Registro de Jugador
app.post('/api/players/register', async (req, res) => {
  const { owner_key, display_name } = req.body;

  if (!owner_key || !display_name) {
    return res.status(400).json({ error: 'owner_key and display_name are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO players (owner_key, display_name) VALUES ($1, $2) RETURNING id',
      [owner_key, display_name]
    );
    console.log(`Player registered: ${display_name} (${owner_key})`);
    res.status(201).json({ message: 'Player registered successfully', playerId: result.rows[0].id });
  } catch (error) {
    if (error && error.code === '23505') {
      console.log(`Registration failed: Player already exists (${display_name})`);
      return res.status(409).json({ error: 'Player already registered' });
    }
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Definir nuestro segundo endpoint: Obtener Perfil
app.get('/api/players/profile/:owner_key', async (req, res) => {
  const { owner_key } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM players WHERE owner_key = $1',
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

// 6. Iniciar el servidor para que escuche peticiones
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0'; // En Replit es importante escuchar en 0.0.0.0
app.listen(port, host, async () => {
  console.log(`Shadowhunters API server is running on ${host}:${port}`);
  await checkDb();
});
