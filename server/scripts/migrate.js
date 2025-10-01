const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Please set DATABASE_URL environment variable before running migrations.');
    process.exit(1);
  }

  const migrationsDir = path.join(__dirname, '..', 'sql', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Running migration ${file}...`);
      await client.query(sql);
      console.log(`Migration ${file} applied.`);
    }
    console.log('All migrations applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('Unexpected error running migrations:', err);
  process.exit(1);
});
