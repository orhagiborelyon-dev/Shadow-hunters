// =========================================================
// 🜂 SHADOW REALMS API — COMMONJS MONOLITH (FULL)
// Version: v6.final.full
// Large single-file server: ALL endpoints included
// - CommonJS (require)
// - No DDL, no ALTER, no migrations
// - No cors, no dotenv (uses process.env directly)
// =========================================================

const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

// =========================================================
// CONFIG
// =========================================================
const APP_NAME = 'Shadow Realms API';
const APP_VERSION = 'v6.final.full';
const DEFAULT_PORT = 10000;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
const DATABASE_URL = process.env.DATABASE_URL || null;

if (!DATABASE_URL) {
  console.warn('⚠️ WARNING: process.env.DATABASE_URL is not set. Please configure it in Render or environment.');
}

// =========================================================
// APP / DB
// =========================================================
const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

const pool = new Pool({
  connectionString: DATABASE_URL || 'postgresql://localhost:5432/shadowrealms',
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// =========================================================
// HELPERS
// =========================================================
function respondError(res, err, code = 500) {
  console.error('Server error:', err && err.stack ? err.stack : err);
  const msg = (err && err.message) ? err.message : String(err);
  return res.status(code).json({ status: 'error', error: msg });
}

async function run(query, params = []) {
  const client = await pool.connect();
  try {
    const r = await client.query(query, params);
    return r;
  } finally {
    client.release();
  }
}

async function runTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function jsonSend(res, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(obj));
}

function nowISO() {
  return new Date().toISOString();
}

// =========================================================
// SMALL UTILS (VALIDATION, SAFE PARSERS)
// =========================================================
function requireFields(obj, fields) {
  for (let k of fields) {
    if (typeof obj[k] === 'undefined' || obj[k] === null) return k;
  }
  return null;
}

function toIntSafe(v, fallback = 0) {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

// =========================================================
// ROOT / HEALTH
// =========================================================
app.get('/', (req, res) => {
  res.send(`${APP_NAME} ${APP_VERSION} — OK ${nowISO()}`);
});

app.get('/api/health', async (req, res) => {
  try {
    const r = await run('SELECT 1 as ok');
    jsonSend(res, { status: 'ok', app: APP_NAME, version: APP_VERSION, ts: nowISO(), db: !!r });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 1) PLAYERS / REGISTRATION / LOOKUP
// =========================================================

app.post('/api/register', async (req, res) => {
  try {
    const { uuid, name, race } = req.body;
    const missing = requireFields(req.body, ['uuid', 'name', 'race']);
    if (missing) return res.status(400).json({ error: `missing field ${missing}` });

    await run(
      `INSERT INTO players (uuid, name, race, level, xp, gold, dead, created_at)
       VALUES ($1,$2,$3,1,0,0,false,NOW())
       ON CONFLICT (uuid) DO UPDATE SET name = EXCLUDED.name, race = EXCLUDED.race`,
      [uuid, name, race]
    );

    jsonSend(res, { status: 'ok', uuid, name, race });
  } catch (err) {
    respondError(res, err);
  }
});

// full player fetch
app.get('/api/player/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const r = await run('SELECT * FROM players WHERE uuid = $1', [uuid]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'player not found' });
    jsonSend(res, r.rows[0]);
  } catch (err) {
    respondError(res, err);
  }
});

// lightweight list (top players)
app.get('/api/players/top/:limit?', async (req, res) => {
  try {
    const limit = toIntSafe(req.params.limit || 20, 20);
    const r = await run('SELECT uuid, name, race, level, xp FROM players ORDER BY xp DESC NULLS LAST LIMIT $1', [limit]);
    jsonSend(res, { players: r.rows });
  } catch (err) {
    respondError(res, err);
  }
});

// update partial player fields
app.post('/api/player/update', async (req, res) => {
  try {
    const { uuid, updates } = req.body;
    if (!uuid || !updates || typeof updates !== 'object') return res.status(400).json({ error: 'missing uuid or updates' });
    const keys = Object.keys(updates);
    if (keys.length === 0) return res.status(400).json({ error: 'no updates provided' });

    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const params = [uuid, ...keys.map(k => updates[k])];
    await run(`UPDATE players SET ${set} WHERE uuid = $1`, params);

    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.delete('/api/player/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    await run('DELETE FROM players WHERE uuid = $1', [uuid]);
    jsonSend(res, { status: 'ok', uuid });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 2) ECONOMY
// =========================================================

app.post('/api/economy/update', async (req, res) => {
  try {
    const { uuid, goldDelta } = req.body;
    if (!uuid || typeof goldDelta === 'undefined') return res.status(400).json({ error: 'missing uuid or goldDelta' });

    await run('UPDATE players SET gold = COALESCE(gold,0) + $1 WHERE uuid = $2', [goldDelta, uuid]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/economy/get/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const r = await run('SELECT gold FROM players WHERE uuid = $1', [uuid]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'player not found' });
    jsonSend(res, { gold: r.rows[0].gold || 0 });
  } catch (err) {
    respondError(res, err);
  }
});

// Shop purchase (transactional)
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
    });

    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 3) CRAFTING / MARKET / AUCTIONS
// =========================================================

app.post('/api/crafting', async (req, res) => {
  try {
    const { uuid, recipe, resultItem } = req.body;
    if (!uuid || !recipe || !resultItem) return res.status(400).json({ error: 'missing fields' });
    await run('INSERT INTO crafting_log (uuid, recipe, result_item, created_at) VALUES ($1,$2,$3,NOW())', [uuid, recipe, resultItem]);
    jsonSend(res, { status: 'ok', resultItem });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/market/list', async (req, res) => {
  try {
    const { uuid, item_code, qty, price } = req.body;
    if (!uuid || !item_code) return res.status(400).json({ error: 'missing fields' });
    const r = await run('INSERT INTO market (seller_uuid, item_code, qty, price, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [uuid, item_code, qty || 1, price || 0]);
    jsonSend(res, { status: 'ok', listingId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/market/listings', async (req, res) => {
  try {
    const r = await run('SELECT * FROM market ORDER BY created_at DESC LIMIT 100');
    jsonSend(res, { listings: r.rows });
  } catch (err) {
    respondError(res, err);
  }
});

// auctions
app.post('/api/auctions/create', async (req, res) => {
  try {
    const { uuid, item_code, reserve } = req.body;
    const r = await run('INSERT INTO auctions (seller_uuid, item_code, reserve, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id', [uuid, item_code, reserve || 0]);
    jsonSend(res, { status: 'ok', auctionId: r.rows[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/auctions/bid', async (req, res) => {
  try {
    const { auctionId, bidder_uuid, bid } = req.body;
    if (!auctionId || !bidder_uuid || typeof bid === 'undefined') return res.status(400).json({ error: 'missing fields' });
    await run('INSERT INTO auction_bids (auction_id, bidder_uuid, bid, created_at) VALUES ($1,$2,$3,NOW())', [auctionId, bidder_uuid, bid]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 4) ARTIFACTS / CROWNS / RELICS
// =========================================================

app.post('/api/artifacts/claim', async (req, res) => {
  try {
    const { artifact_name, owner_uuid } = req.body;
    if (!artifact_name || !owner_uuid) return res.status(400).json({ error: 'missing fields' });

    const existing = await run('SELECT * FROM artifacts WHERE name = $1', [artifact_name]);
    if (existing.length > 0 && existing[0].owner_uuid) return res.status(400).json({ error: 'artifact already owned' });

    await run('INSERT INTO artifacts (name, owner_uuid, date_claimed) VALUES ($1,$2,NOW()) ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed', [artifact_name, owner_uuid]);
    jsonSend(res, { status: 'ok', artifact_name, owner_uuid });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/artifacts/:name', async (req, res) => {
  try {
    const r = await run('SELECT * FROM artifacts WHERE name = $1', [req.params.name]);
    if (r.length === 0) return res.status(404).json({ error: 'not found' });
    jsonSend(res, r[0]);
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/crowns/claim', async (req, res) => {
  try {
    const { crown_name, owner_uuid } = req.body;
    if (!crown_name || !owner_uuid) return res.status(400).json({ error: 'missing fields' });
    await run('INSERT INTO crowns (name, owner_uuid, date_claimed) VALUES ($1,$2,NOW()) ON CONFLICT (name) DO UPDATE SET owner_uuid = EXCLUDED.owner_uuid, date_claimed = EXCLUDED.date_claimed', [crown_name, owner_uuid]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/crowns/:name', async (req, res) => {
  try {
    const r = await run('SELECT * FROM crowns WHERE name = $1', [req.params.name]);
    if (r.length === 0) return res.status(404).json({ error: 'not found' });
    jsonSend(res, r[0]);
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 5) PACKS / GUILDS / SECRET SOCIETIES
// =========================================================

app.post('/api/packs/create', async (req, res) => {
  try {
    const { pack_name, leader_uuid } = req.body;
    if (!pack_name || !leader_uuid) return res.status(400).json({ error: 'missing' });
    const r = await run('INSERT INTO packs (name, leader_uuid, xp, created_at) VALUES ($1,$2,0,NOW()) RETURNING id', [pack_name, leader_uuid]);
    jsonSend(res, { status: 'ok', packId: r[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/packs/join', async (req, res) => {
  try {
    const { packId, member_uuid } = req.body;
    if (!packId || !member_uuid) return res.status(400).json({ error: 'missing' });
    await run('INSERT INTO pack_members (pack_id, member_uuid, joined_at) VALUES ($1,$2,NOW())', [packId, member_uuid]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/guilds/create', async (req, res) => {
  try {
    const { guild_name, leader_uuid } = req.body;
    if (!guild_name || !leader_uuid) return res.status(400).json({ error: 'missing' });
    const r = await run('INSERT INTO guilds (name, leader_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [guild_name, leader_uuid]);
    jsonSend(res, { status: 'ok', guildId: r[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/secret/create', async (req, res) => {
  try {
    const { secret_name, founder_uuid } = req.body;
    if (!secret_name || !founder_uuid) return res.status(400).json({ error: 'missing' });
    const r = await run('INSERT INTO secret_societies (name, founder_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [secret_name, founder_uuid]);
    jsonSend(res, { status: 'ok', secretId: r[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 6) MODULE ENDPOINTS: PACK XP, FAERIE, WARLOCK, CELESTIAL
// =========================================================

app.post('/api/pack/xp', async (req, res) => {
  try {
    const { packId, xpDelta } = req.body;
    if (!packId || typeof xpDelta === 'undefined') return res.status(400).json({ error: 'missing params' });
    await run('UPDATE packs SET xp = COALESCE(xp,0) + $1 WHERE id = $2', [xpDelta, packId]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/faerie/diplomacy', async (req, res) => {
  try {
    const { action, data } = req.body;
    await run('INSERT INTO faerie_actions (action, data, created_at) VALUES ($1,$2,NOW())', [action, JSON.stringify(data || {})]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/warlock/pact', async (req, res) => {
  try {
    const { owner_uuid, demon_name, price } = req.body;
    await run('INSERT INTO warlock_pacts (owner_uuid, demon_name, price, created_at) VALUES ($1,$2,$3,NOW())', [owner_uuid, demon_name, price || 0]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/celestial/vault/store', async (req, res) => {
  try {
    const { owner_uuid, relic_name } = req.body;
    await run('INSERT INTO celestial_vault (owner_uuid, relic_name, date_stored) VALUES ($1,$2,NOW())', [owner_uuid, relic_name]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 7) HUNTER TRIALS / PORTAL NETWORK / WORLD EVENTS / EXPOSURE
// =========================================================

app.post('/api/hunter/trial/complete', async (req, res) => {
  try {
    const { uuid, trial_id, result } = req.body;
    await run('INSERT INTO hunter_trials_log (uuid, trial_id, result, created_at) VALUES ($1,$2,$3,NOW())', [uuid, trial_id, result]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/portal/teleport', async (req, res) => {
  try {
    const { uuid, portal_name, target } = req.body;
    await run('INSERT INTO portal_requests (uuid, portal_name, target, created_at) VALUES ($1,$2,$3,NOW())', [uuid, portal_name, target]);
    jsonSend(res, { status: 'ok', message: 'request recorded' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/world/events', async (req, res) => {
  try {
    const { name, payload } = req.body;
    await run('INSERT INTO world_events (name, payload, created_at) VALUES ($1,$2,NOW())', [name, JSON.stringify(payload || {})]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/world/exposure', async (req, res) => {
  try {
    const { delta } = req.body;
    await run('INSERT INTO world_state (id, exposure) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET exposure = world_state.exposure + $1', [delta]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 8) BONDS / BLOODLINES / ROMANCE / FAMILY
// =========================================================

app.post('/api/bond/create', async (req, res) => {
  try {
    const { uuid1, uuid2, bond_type, initiator } = req.body;
    const r = await run('INSERT INTO bonds (uuid1, uuid2, bond_type, initiator, created_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [uuid1, uuid2, bond_type, initiator]);
    jsonSend(res, { status: 'ok', bondId: r[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/bloodlines/register', async (req, res) => {
  try {
    const { family_name, founder_uuid, description } = req.body;
    const r = await run('INSERT INTO bloodlines (family_name, founder_uuid, created_at) VALUES ($1,$2,NOW()) RETURNING id', [family_name, founder_uuid]);
    jsonSend(res, { status: 'ok', bloodlineId: r[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/bloodlines/:family', async (req, res) => {
  try {
    const r = await run('SELECT * FROM bloodlines WHERE family_name = $1', [req.params.family]);
    if (r.length === 0) return res.status(404).json({ error: 'not found' });
    jsonSend(res, r[0]);
  } catch (err) {
    respondError(res, err);
  }
});

// Romance create (supports any pairing; relationship_type explains pair nature)
app.post('/api/romance/create', async (req, res) => {
  try {
    const { partner1_uuid, partner2_uuid, relationship_type } = req.body;
    const r = await run('INSERT INTO romance_relationships (partner1_uuid, partner2_uuid, relationship_type, status, start_date) VALUES ($1,$2,$3,$4,NOW()) RETURNING id', [partner1_uuid, partner2_uuid, relationship_type || 'partner', 'active']);
    jsonSend(res, { status: 'ok', romanceId: r[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/romance/affinity', async (req, res) => {
  try {
    const { uuid1, uuid2, delta } = req.body;
    if (!uuid1 || !uuid2 || typeof delta === 'undefined') return res.status(400).json({ error: 'missing params' });
    const r = await run('UPDATE romance_affinity SET affinity_points = affinity_points + $1, last_interaction = NOW() WHERE uuid1 = $2 AND uuid2 = $3 RETURNING id', [delta, uuid1, uuid2]);
    if (r.length === 0) {
      await run('INSERT INTO romance_affinity (uuid1, uuid2, affinity_points, last_interaction) VALUES ($1,$2,$3,NOW())', [uuid1, uuid2, delta]);
    }
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// Adoption into bloodline via romance relationship (parens add child)
app.post('/api/romance/adopt', async (req, res) => {
  try {
    const { romanceId, child_uuid, bloodline_name } = req.body;
    if (!romanceId || !child_uuid || !bloodline_name) return res.status(400).json({ error: 'missing params' });

    const rr = await run('SELECT * FROM romance_relationships WHERE id = $1', [romanceId]);
    if (rr.length === 0) return res.status(404).json({ error: 'romance not found' });
    const romance = rr[0];

    // ensure bloodline record exists (insert)
    const bl = await run('SELECT * FROM bloodlines WHERE family_name = $1', [bloodline_name]);
    if (bl.length === 0) {
      await run('INSERT INTO bloodlines (family_name, founder_uuid, created_at) VALUES ($1,$2,NOW())', [bloodline_name, romance.partner1_uuid || null]);
    }

    await run('INSERT INTO family_children (parent1_uuid, parent2_uuid, child_uuid, bloodline_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [romance.partner1_uuid, romance.partner2_uuid, child_uuid, bloodline_name]);
    await run('INSERT INTO family_links (source_uuid, target_uuid, link_type, lineage_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [romance.partner1_uuid, child_uuid, 'parent', bloodline_name]);
    await run('INSERT INTO family_links (source_uuid, target_uuid, link_type, lineage_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [romance.partner2_uuid, child_uuid, 'parent', bloodline_name]);
    await run('INSERT INTO family_links (source_uuid, target_uuid, link_type, lineage_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [child_uuid, romance.partner1_uuid, 'child', bloodline_name]);

    jsonSend(res, { status: 'ok', message: 'child added', bloodline_name });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/romance/event', async (req, res) => {
  try {
    const { actor_uuid, partner_uuid, event_type, description } = req.body;
    await run('INSERT INTO romance_events (actor_uuid, partner_uuid, event_type, description, created_at) VALUES ($1,$2,$3,$4,NOW())', [actor_uuid, partner_uuid, event_type, description]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/romance/divine_union', async (req, res) => {
  try {
    const { couple_uuid1, couple_uuid2, officiant_uuid, blessing_name } = req.body;
    await run('INSERT INTO divine_unions (couple_uuid1, couple_uuid2, officiant_uuid, blessing_name, created_at) VALUES ($1,$2,$3,$4,NOW())', [couple_uuid1, couple_uuid2, officiant_uuid, blessing_name]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 9) COMBAT
// =========================================================

app.post('/api/combat/damage', async (req, res) => {
  try {
    const { target_uuid, amount, source_uuid } = req.body;
    if (!target_uuid || typeof amount === 'undefined') return res.status(400).json({ error: 'missing fields' });
    await run('INSERT INTO combat_log (target_uuid, amount, source_uuid, created_at) VALUES ($1,$2,$3,NOW())', [target_uuid, amount, source_uuid || null]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/combat/revive', async (req, res) => {
  try {
    const { uuid } = req.body;
    if (!uuid) return res.status(400).json({ error: 'missing uuid' });
    await run('UPDATE players SET dead = FALSE WHERE uuid = $1', [uuid]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 10) MORTAL MIRROR / RAZIEL BLESSINGS
// =========================================================

app.post('/api/mirror/scan', async (req, res) => {
  try {
    const { uuid, name } = req.body;
    const hiddenFound = Math.random() < 0.25;
    jsonSend(res, { result: 'ok', hiddenFound });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/raziel/bless', async (req, res) => {
  try {
    const { uuid, blessing } = req.body;
    await run('INSERT INTO raziel_blessings (uuid, blessing, created_at) VALUES ($1,$2,NOW())', [uuid, blessing]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 11) MAIL / JOURNAL / PETS / SILENT CITY
// =========================================================

app.post('/api/mail/send', async (req, res) => {
  try {
    const { from_uuid, to_uuid, subject, body } = req.body;
    if (!from_uuid || !to_uuid) return res.status(400).json({ error: 'missing fields' });
    await run('INSERT INTO mail (from_uuid, to_uuid, subject, body, created_at) VALUES ($1,$2,$3,$4,NOW())', [from_uuid, to_uuid, subject || '', body || '']);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/journal/add', async (req, res) => {
  try {
    const { uuid, entry } = req.body;
    await run('INSERT INTO journal (uuid, entry, created_at) VALUES ($1,$2,NOW())', [uuid, entry]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/pets/spawn', async (req, res) => {
  try {
    const { owner_uuid, pet_name, species } = req.body;
    const r = await run('INSERT INTO pets (owner_uuid, pet_name, species, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id', [owner_uuid, pet_name, species]);
    jsonSend(res, { status: 'ok', petId: r[0].id });
  } catch (err) {
    respondError(res, err);
  }
});

app.post('/api/silentcity/resurrect', async (req, res) => {
  try {
    const { uuid, reason } = req.body;
    await run('INSERT INTO silentcity_resurrections (uuid, reason, created_at) VALUES ($1,$2,NOW())', [uuid, reason]);
    jsonSend(res, { status: 'ok' });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 12) ADMIN (dangerous) - unprotected; add auth later if needed
// =========================================================

app.post('/api/admin/reset_all', async (req, res) => {
  try {
    const tables = [
      'market', 'auctions', 'crafting_log', 'artifacts', 'crowns', 'packs', 'pack_members', 'guilds',
      'secret_societies', 'warlock_pacts', 'faerie_actions', 'celestial_vault',
      'hunter_trials_log', 'portal_requests', 'world_events', 'world_state',
      'bonds', 'bloodlines', 'romance_relationships', 'family_children', 'family_links',
      'romance_events', 'romance_affinity', 'divine_unions', 'combat_log', 'raziel_blessings',
      'mail', 'journal', 'pets', 'silentcity_resurrections', 'players'
    ];
    for (let t of tables) {
      try {
        await run(`DELETE FROM ${t}`);
      } catch (e) {
        // ignore
      }
    }
    jsonSend(res, { status: 'ok', message: 'attempted to clear core tables' });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const r = await run('SELECT COUNT(*)::int AS players FROM players');
    jsonSend(res, { stats: r[0] || {} });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// 13) LSL-FRIENDLY LOOKUPS / UTILS
// =========================================================

app.get('/api/packs', async (req, res) => {
  try {
    const r = await run('SELECT id, name, leader_uuid, xp FROM packs ORDER BY name');
    jsonSend(res, { packs: r });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/guilds', async (req, res) => {
  try {
    const r = await run('SELECT id, name, leader_uuid FROM guilds ORDER BY name');
    jsonSend(res, { guilds: r });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/bloodlines/:family/members', async (req, res) => {
  try {
    const { family } = req.params;
    const r = await run('SELECT * FROM family_children WHERE bloodline_name = $1 ORDER BY created_at DESC', [family]);
    jsonSend(res, { members: r });
  } catch (err) {
    respondError(res, err);
  }
});

app.get('/api/version', (req, res) => {
  jsonSend(res, { app: APP_NAME, version: APP_VERSION, ts: nowISO() });
});

// =========================================================
// 14) DEBUG / TEST
// =========================================================

app.post('/api/debug/echo', (req, res) => {
  jsonSend(res, { ok: true, echo: req.body || null, ts: nowISO() });
});

app.get('/api/debug/tables', async (req, res) => {
  try {
    // best-effort query to list a few table counts
    const counts = {};
    const names = ['players', 'world_events', 'combat_log', 'artifacts', 'packs'];
    for (let n of names) {
      try {
        const r = await run(`SELECT COUNT(*)::int AS c FROM ${n}`);
        counts[n] = r[0] ? r[0].c : 0;
      } catch (e) {
        counts[n] = null;
      }
    }
    jsonSend(res, { counts, ts: nowISO() });
  } catch (err) {
    respondError(res, err);
  }
});

// =========================================================
// START SERVER
// =========================================================

app.listen(PORT, () => {
  console.log(`🜂 ${APP_NAME} ${APP_VERSION} listening on port ${PORT}`);
});
