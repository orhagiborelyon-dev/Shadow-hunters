// ===============================================
// Shadow Realms API — CommonJS Full — v6.3
// Monolithic index.js with full endpoints for Shadow Realms project
// Uses CommonJS (require) and pg Pool
// ===============================================

const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const APP_NAME = 'Shadow Realms API';
const app = express();
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL pool (uses TEXT UUIDs by default compatibility)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/shadowrealms',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Basic helpers
function respondError(res, err) {
  console.error(err && err.stack ? err.stack : err);
  return res.status(500).json({ status: 'error', error: err && err.message ? err.message : String(err) });
}
async function run(queryText, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(queryText, params);
  } finally {
    client.release();
  }
}
async function runTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ----------------------
// Health & Root
// ----------------------
app.get('/', (req, res) => res.send(`${APP_NAME} v6.3 - OK`));
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ----------------------
// 1) Players / registration / core
// ----------------------
app.post('/api/register', async (req, res) => {
  try {
    const { uuid, name, race } = req.body;
    if (!uuid || !name || !race) return res.status(400).json({ error: 'missing uuid/name/race' });
    await run(
      `INSERT INTO players (uuid,name,race,level,xp,gold,dead,created_at)
       VALUES ($1,$2,$3,1,0,0,false,NOW())
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
    if (r.rowCount === 0) return res.status(404).json({ error: 'player not found' });
    res.json(r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/player/update', async (req, res) => {
  try {
    const { uuid, updates } = req.body;
    if (!uuid || !updates || typeof updates !== 'object') return res.status(400).json({ error: 'missing params' });
    const keys = Object.keys(updates);
    if (!keys.length) return res.status(400).json({ error: 'no updates' });
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const params = [uuid].concat(keys.map(k => updates[k]));
    await run(`UPDATE players SET ${set} WHERE uuid = $1`, params);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// small utility to remove a player - admin only ideally
app.delete('/api/player/:uuid', async (req, res) => {
  try {
    await run('DELETE FROM players WHERE uuid = $1', [req.params.uuid]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// ----------------------
// 2) Economy (basic + shop)
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
    if (r.rowCount === 0) return res.status(404).json({ error: 'player not found' });
    res.json({ gold: r.rows[0].gold || 0 });
  } catch (err) {
    respondError(res, err);
  }
});

// shop purchase (transactional)
app.post('/api/shop/purchase', async (req, res) => {
  try {
    const { uuid, item_code, price } = req.body;
    if (!uuid || !item_code || typeof price === 'undefined') return res.status(400).json({ error: 'missing params' });

    await runTx(async client => {
      const r = await client.query('SELECT gold FROM players WHERE uuid = $1 FOR UPDATE', [uuid]);
      if (r.rowCount === 0) throw new Error('player not found');
      const gold = r.rows[0].gold || 0;
      if (gold < price) throw new Error('insufficient funds');
      await client.query('UPDATE players SET gold = gold - $1 WHERE uuid = $2', [price, uuid]);
      await client.query('INSERT INTO market_sales (buyer_uuid, item_code, price, created_at) VALUES ($1,$2,$3,NOW())', [uuid, item_code, price]);
      return;
    });

    res.json({ status: 'ok', item_code });
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
    res.json({ status: 'ok', resultItem });
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

app.get('/api/market/listings', async (req, res) => {
  try {
    const r = await run('SELECT * FROM market ORDER BY created_at DESC LIMIT 100');
    res.json({ listings: r.rows });
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

app.post('/api/auctions/bid', async (req, res) => {
  try {
    const { auctionId, bidder_uuid, bid } = req.body;
    if (!auctionId || !bidder_uuid || typeof bid === 'undefined') return res.status(400).json({ error: 'missing params' });
    await run('INSERT INTO auction_bids (auction_id, bidder_uuid, bid, created_at) VALUES ($1,$2,$3,NOW())', [auctionId, bidder_uuid, bid]);
    res.json({ status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// artifacts
app.post('/api/artifacts/claim', async (req, res) => {
  try {
    const { artifact_name, owner_uuid } = req.body;
    if (!artifact_name || !owner_uuid) return res.status(400).json({ error: 'missing params' });
    const existing = await run('SELECT * FROM artifacts WHERE name = $1', [artifact_name]);
    if (existing.rowCount > 0 && existing.rows[0].owner_uuid) return res.status(400).json({ error: 'artifact already owned' });
    await run('INSERT INTO artifacts (name, owner_uuid, date_claimed) VALUES ($1,$2,NOW()) ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed', [artifact_name, owner_uuid]);
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

// crowns
app.post('/api/crowns/claim', async (req, res) => {
  try {
    const { crown_name, owner_uuid } = req.body;
    if (!crown_name || !owner_uuid) return res.status(400).json({ error: 'missing params' });
    await run('INSERT INTO crowns (name, owner_uuid, date_claimed) VALUES ($1,$2,NOW()) ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed', [crown_name, owner_uuid]);
    res.json({ status: 'ok' });
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
    const r = await run('INSERT INTO packs (name, leader_uuid, xp, created_at) VALUES ($1,$2,0,NOW()) RETURNING id', [pack_name, leader_uuid]);
    res.json({ status: 'ok', packId: r.rows[0].id });
  } catch (err) { respondError(res, err); }
});
app.post('/api/packs/join', async (req, res) => {
  try {
    const { packId, member_uuid } = req.body;
    await run('INSERT INTO pack_members (pack_id, member_uuid, joined_at) VALUES ($1,$2,NOW())', [packId, member_uuid]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});
app.post('/api/guilds/create', async (req, res) => {
  try {
    const { guild_name, leader_uuid } = req.body;
    const r = await run('INSERT INTO guilds (name, leader_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [guild_name, leader_uuid]);
    res.json({ status: 'ok', guildId: r.rows[0].id });
  } catch (err) { respondError(res, err); }
});
app.post('/api/secret/create', async (req, res) => {
  try {
    const { secret_name, founder_uuid } = req.body;
    const r = await run('INSERT INTO secret_societies (name, founder_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [secret_name, founder_uuid]);
    res.json({ status: 'ok', secretId: r.rows[0].id });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 5) Module endpoints: pack xp, faerie diplomacy, warlock pacts, celestial vault
// ----------------------
app.post('/api/pack/xp', async (req, res) => {
  try {
    const { packId, xpDelta } = req.body;
    await run('UPDATE packs SET xp = COALESCE(xp,0) + $1 WHERE id = $2', [xpDelta, packId]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

app.post('/api/faerie/diplomacy', async (req, res) => {
  try {
    const { action, data } = req.body;
    await run('INSERT INTO faerie_actions (action, data, created_at) VALUES ($1,$2,NOW())', [action, JSON.stringify(data)]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

app.post('/api/warlock/pact', async (req, res) => {
  try {
    const { owner_uuid, demon_name, price } = req.body;
    await run('INSERT INTO warlock_pacts (owner_uuid, demon_name, price, created_at) VALUES ($1,$2,$3,NOW())', [owner_uuid, demon_name, price]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

app.post('/api/celestial/vault/store', async (req, res) => {
  try {
    const { owner_uuid, relic_name } = req.body;
    await run('INSERT INTO celestial_vault (owner_uuid, relic_name, date_stored) VALUES ($1,$2,NOW())', [owner_uuid, relic_name]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 6) Hunter Trials / Portal Network / World events / exposure
// ----------------------
app.post('/api/hunter/trial/complete', async (req, res) => {
  try {
    const { uuid, trial_id, result } = req.body;
    await run('INSERT INTO hunter_trials_log (uuid, trial_id, result, created_at) VALUES ($1,$2,$3,NOW())', [uuid, trial_id, result]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

app.post('/api/portal/teleport', async (req, res) => {
  try {
    const { uuid, portal_name, target } = req.body;
    await run('INSERT INTO portal_requests (uuid, portal_name, target, created_at) VALUES ($1,$2,$3,NOW())', [uuid, portal_name, target]);
    res.json({ status: 'ok', message: 'request recorded' });
  } catch (err) { respondError(res, err); }
});

app.post('/api/world/events', async (req, res) => {
  try {
    const { name, payload } = req.body;
    await run('INSERT INTO world_events (name, payload, created_at) VALUES ($1,$2,NOW())', [name, JSON.stringify(payload)]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

app.post('/api/world/exposure', async (req, res) => {
  try {
    const { delta } = req.body;
    await run('INSERT INTO world_state (id, exposure) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET exposure = world_state.exposure + $1', [delta]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 7) Bonds / Bloodlines / Romance / Family
// ----------------------

// bonds generic (parabatai, oath, etc)
app.post('/api/bond/create', async (req, res) => {
  try {
    const { uuid1, uuid2, bond_type, initiator } = req.body;
    const r = await run('INSERT INTO bonds (uuid1, uuid2, bond_type, initiator, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [uuid1, uuid2, bond_type, initiator]);
    res.json({ status: 'ok', bondId: r.rows[0].id });
  } catch (err) { respondError(res, err); }
});

// bloodline register + list
app.post('/api/bloodlines/register', async (req, res) => {
  try {
    const { family_name, founder_uuid, description } = req.body;
    const r = await run('INSERT INTO nephilim_bloodlines (family_name, founder_uuid, description, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id', [family_name, founder_uuid, description || null]);
    res.json({ status: 'ok', bloodlineId: r.rows[0].id });
  } catch (err) { respondError(res, err); }
});
app.get('/api/bloodlines', async (req, res) => {
  try {
    const r = await run('SELECT * FROM nephilim_bloodlines ORDER BY family_name');
    res.json({ bloodlines: r.rows });
  } catch (err) { respondError(res, err); }
});
app.get('/api/bloodlines/:family', async (req, res) => {
  try {
    const r = await run('SELECT * FROM nephilim_bloodlines WHERE family_name = $1', [req.params.family]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (err) { respondError(res, err); }
});

// romance relationships
app.post('/api/romance/create', async (req, res) => {
  try {
    const { partner1_uuid, partner2_uuid, relationship_type } = req.body;
    const r = await run('INSERT INTO romance_relationships (partner1_uuid, partner2_uuid, relationship_type, status, start_date) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [partner1_uuid, partner2_uuid, relationship_type || 'hetero', 'active']);
    res.json({ status: 'ok', romanceId: r.rows[0].id });
  } catch (err) { respondError(res, err); }
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
  } catch (err) { respondError(res, err); }
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
  } catch (err) { respondError(res, err); }
});
app.post('/api/romance/event', async (req, res) => {
  try {
    const { actor_uuid, partner_uuid, event_type, description } = req.body;
    await run('INSERT INTO romance_events (actor_uuid, partner_uuid, event_type, description, created_at) VALUES ($1,$2,$3,$4,NOW())', [actor_uuid, partner_uuid, event_type, description]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});
app.post('/api/romance/divine_union', async (req, res) => {
  try {
    const { couple_uuid1, couple_uuid2, officiant_uuid, blessing_name } = req.body;
    await run('INSERT INTO divine_unions (couple_uuid1, couple_uuid2, officiant_uuid, blessing_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [couple_uuid1, couple_uuid2, officiant_uuid, blessing_name]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 8) Combat endpoints
// ----------------------
app.post('/api/combat/damage', async (req, res) => {
  try {
    const { target_uuid, amount, source_uuid } = req.body;
    await run('INSERT INTO combat_log (target_uuid, amount, source_uuid, created_at) VALUES ($1,$2,$3,NOW())', [target_uuid, amount, source_uuid]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});
app.post('/api/combat/revive', async (req, res) => {
  try {
    const { uuid } = req.body;
    await run('UPDATE players SET dead = FALSE WHERE uuid = $1', [uuid]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 9) Mortal Mirror / Raziel Blessings
// ----------------------
app.post('/api/mirror/scan', async (req, res) => {
  try {
    const { uuid, name } = req.body;
    // simple mock result
    const hasHidden = Math.random() < 0.25;
    res.json({ result: 'ok', hiddenFound: hasHidden });
  } catch (err) { respondError(res, err); }
});
app.post('/api/raziel/bless', async (req, res) => {
  try {
    const { uuid, blessing } = req.body;
    await run('INSERT INTO raziel_blessings (uuid, blessing, created_at) VALUES ($1,$2,NOW())', [uuid, blessing]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 10) Mail / Journal / Pets / SilentCity
// ----------------------
app.post('/api/mail/send', async (req, res) => {
  try {
    const { from_uuid, to_uuid, subject, body } = req.body;
    await run('INSERT INTO mail (from_uuid, to_uuid, subject, body, created_at) VALUES ($1,$2,$3,$4,NOW())', [from_uuid, to_uuid, subject, body]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});
app.post('/api/journal/add', async (req, res) => {
  try {
    const { uuid, entry } = req.body;
    await run('INSERT INTO journal (uuid, entry, created_at) VALUES ($1,$2,NOW())', [uuid, entry]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});
app.post('/api/pets/spawn', async (req, res) => {
  try {
    const { owner_uuid, pet_name, species } = req.body;
    const r = await run('INSERT INTO pets (owner_uuid, pet_name, species, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id', [owner_uuid, pet_name, species]);
    res.json({ status: 'ok', petId: r.rows[0].id });
  } catch (err) { respondError(res, err); }
});
app.post('/api/silentcity/resurrect', async (req, res) => {
  try {
    const { uuid, reason } = req.body;
    await run('INSERT INTO silentcity_resurrections (uuid, reason, created_at) VALUES ($1,$2,NOW())', [uuid, reason]);
    res.json({ status: 'ok' });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 11) Admin endpoints
// ----------------------
app.post('/api/admin/reset_all', async (req, res) => {
  try {
    // WARNING: destructive, should be protected by auth in production
    const tables = [
      'market', 'auctions', 'crafting_log', 'artifacts', 'crowns', 'packs', 'guilds',
      'secret_societies', 'warlock_pacts', 'faerie_actions', 'celestial_vault',
      'hunter_trials_log', 'portal_requests', 'world_events', 'world_state',
      'bonds', 'nephilim_bloodlines', 'romance_relationships', 'family_children',
      'family_links', 'romance_events', 'romance_affinity', 'divine_unions',
      'combat_log', 'raziel_blessings', 'mail', 'journal', 'pets', 'silentcity_resurrections',
      'players'
    ];
    for (const t of tables) {
      // ignore errors if table not exists
      try { await run(`DELETE FROM ${t}`); } catch (e) { /* ignore */ }
    }
    res.json({ status: 'ok', message: 'all cleared (attempted)' });
  } catch (err) { respondError(res, err); }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const r = await run('SELECT COUNT(*)::int as players FROM players');
    res.json({ stats: r.rows[0] });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 12) Utility lookups (for LSL clients)
// ----------------------
app.get('/api/packs', async (req, res) => {
  try {
    const r = await run('SELECT id, name, leader_uuid, xp FROM packs ORDER BY name');
    res.json({ packs: r.rows });
  } catch (err) { respondError(res, err); }
});
app.get('/api/guilds', async (req, res) => {
  try {
    const r = await run('SELECT id, name, leader_uuid FROM guilds ORDER BY name');
    res.json({ guilds: r.rows });
  } catch (err) { respondError(res, err); }
});
app.get('/api/bloodlines/:family/members', async (req, res) => {
  try {
    const r = await run('SELECT * FROM family_children WHERE bloodline_name = $1 ORDER BY created_at DESC', [req.params.family]);
    res.json({ members: r.rows });
  } catch (err) { respondError(res, err); }
});

// ----------------------
// 13) Misc helpers
// ----------------------
app.get('/api/version', (req, res) => res.json({ app: APP_NAME, version: 'v6.3' }));

// ----------------------
// Start server
// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${APP_NAME} v6.3 listening on port ${PORT}`);
});

// Export for tests (still CommonJS)
module.exports = { app, pool };
