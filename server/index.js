// ===============================================
// 🌑 Shadow Realms API - CommonJS Version
// Version 6.0 — “Heavenly Codex Integration”
// ===============================================
// index.js — Shadow Realms API (CommonJS) v6.0 — "Heavenly Codex Integration"
// Single-file, CommonJS, Express + Postgres
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const APP_NAME = 'Shadow Realms API';
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres pool (CommonJS-safe)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/shadowrealms',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Helper
function respondError(res, err) {
  console.error(err && err.stack ? err.stack : err);
  return res.status(500).json({ status: 'error', error: err && err.message ? err.message : String(err) });
}
async function run(q, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(q, params);
  } finally {
    client.release();
  }
}

// ----------------------
// Root & health
// ----------------------
app.get('/', (req, res) => res.send(`${APP_NAME} v6.0 — Heavenly Codex Integration — OK`));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ----------------------
// 1) Players / registration / core
// ----------------------
app.post('/api/register', async (req, res) => {
  try {
    const { uuid, name, race } = req.body;
    if (!uuid || !name || !race) return res.status(400).json({ error: 'missing uuid,name,race' });
    await run(
      `INSERT INTO players (uuid, name, race, level, xp, honor, fear, influence, gold, dead, created_at)
       VALUES ($1,$2,$3,1,0,0,0,0,0,false,NOW())
       ON CONFLICT (uuid) DO UPDATE SET name = EXCLUDED.name, race = EXCLUDED.race`,
      [uuid, name, race]
    );
    res.json({ status: 'ok', uuid, name, race });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/player/:uuid', async (req, res) => {
  try {
    const r = await run('SELECT * FROM players WHERE uuid = $1', [req.params.uuid]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Player not found' });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/player/update', async (req, res) => {
  try {
    const { uuid, updates } = req.body; // updates: { level: 2, xp: 100 }
    if (!uuid || !updates || typeof updates !== 'object') return res.status(400).json({ error: 'missing params' });
    const keys = Object.keys(updates);
    if (keys.length === 0) return res.status(400).json({ error: 'no updates' });
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const params = [uuid].concat(keys.map(k => updates[k]));
    await run(`UPDATE players SET ${set} WHERE uuid = $1`, params);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.delete('/api/reset', async (req, res) => {
  try {
    await run('DELETE FROM players');
    res.json({ status: 'ok', message: 'players reset' });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 2) Economy (basic + shop helpers)
// ----------------------
app.post('/api/economy/update', async (req, res) => {
  try {
    const { uuid, goldDelta } = req.body;
    if (!uuid || typeof goldDelta === 'undefined') return res.status(400).json({ error: 'missing params' });
    await run('UPDATE players SET gold = COALESCE(gold,0) + $1 WHERE uuid = $2', [goldDelta, uuid]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/economy/get/:uuid', async (req, res) => {
  try {
    const r = await run('SELECT gold FROM players WHERE uuid = $1', [req.params.uuid]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Player not found' });
    res.json({ gold: r.rows[0].gold || 0 });
  } catch (err) {
    respondError(res, err);
  }
});

// Shop purchase helper (simple)
app.post('/api/shop/purchase', async (req, res) => {
  try {
    const { uuid, item_code, price } = req.body;
    if (!uuid || !item_code || typeof price === 'undefined') return res.status(400).json({ error: 'missing params' });
    // Deduct and record a sale in market_sales (create table if needed)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query('SELECT gold FROM players WHERE uuid = $1 FOR UPDATE', [uuid]);
      if (r.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Player not found' }); }
      const gold = r.rows[0].gold || 0;
      if (gold < price) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'insufficient funds' }); }
      await client.query('UPDATE players SET gold = gold - $1 WHERE uuid = $2', [price, uuid]);
      await client.query('INSERT INTO market_sales (buyer_uuid, item_code, price, created_at) VALUES ($1,$2,$3,NOW())', [uuid, item_code, price]);
      await client.query('COMMIT');
      res.json({ status: 'ok', item_code });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 3) Crafting / Market / Auctions / Artifacts / Crowns
// ----------------------
app.post('/api/crafting', async (req, res) => {
  try {
    const { uuid, recipe, resultItem } = req.body;
    await run('INSERT INTO crafting_log (uuid, recipe, result_item, created_at) VALUES ($1,$2,$3,NOW())', [uuid, recipe, resultItem]);
    res.json({ status: 'ok', message: 'crafted', resultItem });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/market/list', async (req, res) => {
  try {
    const { uuid, item_code, qty, price } = req.body;
    const r = await run('INSERT INTO market (seller_uuid, item_code, qty, price, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [uuid, item_code, qty, price]);
    res.json({ status: 'ok', listingId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/auctions/create', async (req, res) => {
  try {
    const { uuid, item_code, reserve } = req.body;
    const r = await run('INSERT INTO auctions (seller_uuid, item_code, reserve, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id', [uuid, item_code, reserve]);
    res.json({ status: 'ok', auctionId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/artifacts/claim', async (req, res) => {
  try {
    const { artifact_name, owner_uuid } = req.body;
    if (!artifact_name || !owner_uuid) return res.status(400).json({ error: 'missing params' });
    const existing = await run('SELECT * FROM artifacts WHERE name = $1', [artifact_name]);
    if (existing.rowCount > 0 && existing.rows[0].owner_uuid) return res.status(400).json({ error: 'artifact already owned' });
    await run(`INSERT INTO artifacts (name, owner_uuid, date_claimed) VALUES ($1,$2,NOW()) ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed`, [artifact_name, owner_uuid]);
    res.json({ status: 'ok', artifact_name, owner_uuid });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/artifacts/:name', async (req, res) => {
  try {
    const r = await run('SELECT * FROM artifacts WHERE name = $1', [req.params.name]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/crowns/claim', async (req, res) => {
  try {
    const { crown_name, owner_uuid } = req.body;
    if (!crown_name || !owner_uuid) return res.status(400).json({ error: 'missing params' });
    await run(`INSERT INTO crowns (name, owner_uuid, date_claimed) VALUES ($1,$2,NOW()) ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed`, [crown_name, owner_uuid]);
    res.json({ status: 'ok', crown_name, owner_uuid });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/crowns/:name', async (req, res) => {
  try {
    const r = await run('SELECT * FROM crowns WHERE name = $1', [req.params.name]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 4) Packs / Guilds / Secret Societies
// ----------------------
app.post('/api/packs/create', async (req, res) => {
  try {
    const { pack_name, leader_uuid } = req.body;
    const r = await run('INSERT INTO packs (name, leader_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [pack_name, leader_uuid]);
    res.json({ status: 'ok', packId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/guilds/create', async (req, res) => {
  try {
    const { guild_name, leader_uuid } = req.body;
    const r = await run('INSERT INTO guilds (name, leader_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [guild_name, leader_uuid]);
    res.json({ status: 'ok', guildId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/secret/create', async (req, res) => {
  try {
    const { secret_name, founder_uuid } = req.body;
    const r = await run('INSERT INTO secret_societies (name, founder_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [secret_name, founder_uuid]);
    res.json({ status: 'ok', secretId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 5) Packs/Warlock/Faerie/Celestial endpoints (module APIs)
// ----------------------
app.post('/api/pack/xp', async (req, res) => {
  try {
    const { packId, xpDelta } = req.body;
    await run('UPDATE packs SET xp = COALESCE(xp,0) + $1 WHERE id = $2', [xpDelta, packId]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/faerie/diplomacy', async (req, res) => {
  try {
    const { action, data } = req.body;
    await run('INSERT INTO faerie_actions (action, data, created_at) VALUES ($1,$2,NOW())', [action, JSON.stringify(data)]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/warlock/pact', async (req, res) => {
  try {
    const { owner_uuid, demon_name, price } = req.body;
    await run('INSERT INTO warlock_pacts (owner_uuid, demon_name, price, created_at) VALUES ($1,$2,$3,NOW())', [owner_uuid, demon_name, price]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/celestial/vault/store', async (req, res) => {
  try {
    const { owner_uuid, relic_name } = req.body;
    await run('INSERT INTO celestial_vault (owner_uuid, relic_name, date_stored) VALUES ($1,$2,NOW())', [owner_uuid, relic_name]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 6) Hunter Trials / Portal Network / Events / World exposure
// ----------------------
app.post('/api/hunter/trial/complete', async (req, res) => {
  try {
    const { uuid, trial_id, result } = req.body;
    await run('INSERT INTO hunter_trials_log (uuid, trial_id, result, created_at) VALUES ($1,$2,$3,NOW())', [uuid, trial_id, result]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/portal/teleport', async (req, res) => {
  try {
    const { uuid, portal_name, target } = req.body;
    await run('INSERT INTO portal_requests (uuid, portal_name, target, created_at) VALUES ($1,$2,$3,NOW())', [uuid, portal_name, target]);
    res.json({ status: 'ok', message: 'request recorded' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/world/events', async (req, res) => {
  try {
    const { name, payload } = req.body;
    await run('INSERT INTO world_events (name, payload, created_at) VALUES ($1,$2,NOW())', [name, JSON.stringify(payload)]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/world/exposure', async (req, res) => {
  try {
    const { delta } = req.body;
    await run('INSERT INTO world_state (id, exposure) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET exposure = world_state.exposure + $1', [delta]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 7) Bonding / Bloodlines / Love systems (Romance Module)
// ----------------------
app.post('/api/bond/create', async (req, res) => {
  try {
    const { uuid1, uuid2, bond_type, initiator } = req.body;
    const r = await run('INSERT INTO bonds (uuid1, uuid2, bond_type, initiator, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [uuid1, uuid2, bond_type, initiator]);
    res.json({ status: 'ok', bondId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

// Bloodlines register / query
app.post('/api/bloodlines/register', async (req, res) => {
  try {
    const { family_name, founder_uuid, description } = req.body;
    const r = await run('INSERT INTO nephilim_bloodlines (family_name, founder_uuid, description, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id', [family_name, founder_uuid, description || null]);
    res.json({ status: 'ok', bloodlineId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/bloodlines/:family', async (req, res) => {
  try {
    const r = await run('SELECT * FROM nephilim_bloodlines WHERE family_name = $1', [req.params.family]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/bloodlines', async (req, res) => {
  try {
    const r = await run('SELECT * FROM nephilim_bloodlines ORDER BY family_name');
    res.json({ bloodlines: r.rows });
  } catch (err) {
    respondError(res, err);
  }
});

// Romance endpoints (relationships, affinity, adopt, events, divine unions)
app.post('/api/romance/create', async (req, res) => {
  try {
    const { partner1_uuid, partner2_uuid, relationship_type } = req.body;
    const r = await run('INSERT INTO romance_relationships (partner1_uuid, partner2_uuid, relationship_type, status, start_date) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [partner1_uuid, partner2_uuid, relationship_type || 'hetero', 'active']);
    res.json({ status: 'ok', romanceId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/romance/:id', async (req, res) => {
  try {
    const r = await run('SELECT * FROM romance_relationships WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/romance/affinity', async (req, res) => {
  try {
    const { uuid1, uuid2, delta } = req.body;
    if (!uuid1 || !uuid2 || typeof delta === 'undefined') return res.status(400).json({ error: 'missing params' });

    const up = await run('UPDATE romance_affinity SET affinity_points = affinity_points + $1, last_interaction = NOW() WHERE uuid1 = $2 AND uuid2 = $3 RETURNING id', [delta, uuid1, uuid2]);
    if (up.rowCount === 0) {
      await run('INSERT INTO romance_affinity (uuid1, uuid2, affinity_points, last_interaction) VALUES ($1,$2,$3,NOW())', [uuid1, uuid2, delta]);
    }
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/romance/adopt', async (req, res) => {
  try {
    const { romanceId, child_uuid, bloodline_name } = req.body;
    if (!romanceId || !child_uuid || !bloodline_name) return res.status(400).json({ error: 'missing params' });

    const r = await run('SELECT * FROM romance_relationships WHERE id = $1', [romanceId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'romance not found' });
    const romance = r.rows[0];

    const bl = await run('SELECT * FROM nephilim_bloodlines WHERE family_name = $1', [bloodline_name]);
    if (bl.rowCount === 0) {
      await run('INSERT INTO nephilim_bloodlines (family_name, founder_uuid, description, created_at) VALUES ($1,$2,$3,NOW())', [bloodline_name, romance.partner1_uuid || null, null]);
    }

    await run('INSERT INTO family_children (parent1_uuid, parent2_uuid, child_uuid, bloodline_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [romance.partner1_uuid, romance.partner2_uuid, child_uuid, bloodline_name]);

    await run('INSERT INTO family_links (source_uuid, target_uuid, link_type, lineage_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [romance.partner1_uuid, child_uuid, 'parent', bloodline_name]);
    await run('INSERT INTO family_links (source_uuid, target_uuid, link_type, lineage_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [romance.partner2_uuid, child_uuid, 'parent', bloodline_name]);
    await run('INSERT INTO family_links (source_uuid, target_uuid, link_type, lineage_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [child_uuid, romance.partner1_uuid, 'child', bloodline_name]);

    res.json({ status: 'ok', message: 'child added', bloodline_name });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/romance/event', async (req, res) => {
  try {
    const { actor_uuid, partner_uuid, event_type, description } = req.body;
    await run('INSERT INTO romance_events (actor_uuid, partner_uuid, event_type, description, created_at) VALUES ($1,$2,$3,$4,NOW())', [actor_uuid, partner_uuid, event_type, description]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/romance/divine_union', async (req, res) => {
  try {
    const { couple_uuid1, couple_uuid2, officiant_uuid, blessing_name } = req.body;
    await run('INSERT INTO divine_unions (couple_uuid1, couple_uuid2, officiant_uuid, blessing_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [couple_uuid1, couple_uuid2, officiant_uuid, blessing_name]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 8) Combat endpoints (damage/revive)
// ----------------------
app.post('/api/combat/damage', async (req, res) => {
  try {
    const { target_uuid, amount, source_uuid } = req.body;
    await run('INSERT INTO combat_log (target_uuid, amount, source_uuid, created_at) VALUES ($1,$2,$3,NOW())', [target_uuid, amount, source_uuid]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/combat/revive', async (req, res) => {
  try {
    const { uuid } = req.body;
    await run('UPDATE players SET dead = FALSE WHERE uuid = $1', [uuid]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 9) Misc: Mortal mirror, raziel blessing (server-side triggers)
// ----------------------
app.post('/api/mirror/scan', async (req, res) => {
  try {
    const { uuid, name } = req.body;
    const hasHidden = Math.random() < 0.25;
    res.json({ result: 'ok', hiddenFound: hasHidden });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/raziel/bless', async (req, res) => {
  try {
    const { uuid, blessing } = req.body;
    await run('INSERT INTO raziel_blessings (uuid, blessing, created_at) VALUES ($1,$2,NOW())', [uuid, blessing]);
    res.json({ status: 'ok', message: 'blessing recorded' });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// Admin & Utils
// ----------------------
app.post('/api/admin/reset_all', async (req, res) => {
  try {
    // Danger: clears main game tables. Auth should be added in production.
    await run('DELETE FROM players');
    await run('DELETE FROM crafting_log');
    await run('DELETE FROM market');
    await run('DELETE FROM auctions');
    await run('DELETE FROM artifacts');
    await run('DELETE FROM crowns');
    await run('DELETE FROM packs');
    await run('DELETE FROM guilds');
    await run('DELETE FROM secret_societies');
    await run('DELETE FROM warlock_pacts');
    await run('DELETE FROM faerie_actions');
    await run('DELETE FROM celestial_vault');
    await run('DELETE FROM hunter_trials_log');
    await run('DELETE FROM portal_requests');
    await run('DELETE FROM world_events');
    await run('DELETE FROM bonds');
    await run('DELETE FROM nephilim_bloodlines');
    await run('DELETE FROM romance_relationships');
    await run('DELETE FROM family_children');
    await run('DELETE FROM family_links');
    await run('DELETE FROM romance_events');
    await run('DELETE FROM romance_affinity');
    await run('DELETE FROM divine_unions');
    await run('DELETE FROM combat_log');
    await run('DELETE FROM raziel_blessings');
    res.json({ status: 'ok', message: 'all core tables cleared (admin)' });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const r = await run('SELECT COUNT(*)::int as total_players FROM players');
    res.json({ stats: r.rows[0] });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// Helper lookups for LSL clients
// ----------------------
app.get('/api/packs', async (req, res) => {
  try {
    const r = await run('SELECT id, name, leader_uuid, xp FROM packs ORDER BY name');
    res.json({ packs: r.rows });
  } catch (err) {
    respondError(res, err);
  }
});
app.get('/api/guilds', async (req, res) => {
  try {
    const r = await run('SELECT id, name, leader_uuid FROM guilds ORDER BY name');
    res.json({ guilds: r.rows });
  } catch (err) {
    respondError(res, err);
  }
});
app.get('/api/bloodlines/:family/members', async (req, res) => {
  try {
    const { family } = req.params;
    const r = await run('SELECT * FROM family_children WHERE bloodline_name = $1 ORDER BY created_at DESC', [family]);
    res.json({ members: r.rows });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// Start server
// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${APP_NAME} v6.0 listening on port ${PORT}`));

// Export for tests if desired (still CommonJS)
module.exports = { app, pool };
