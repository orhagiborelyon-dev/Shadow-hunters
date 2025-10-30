//---------------------------------------------------------
// Shadow Realms API v2.0
// Node.js + Express backend for all LSL HUD modules
//---------------------------------------------------------
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";

const app = express();
app.use(cors());
app.use(bodyParser.json());
const PORT = process.env.PORT || 8080;

const DB_FILE = "./db.json";

//---------------------------------------------------------
// INITIAL DATABASE STRUCTURE
//---------------------------------------------------------
async function initDB() {
  if (!(await fs.pathExists(DB_FILE))) {
    const baseData = {
      players: {},
      reputations: {},
      economy: {},
      artifacts: {},
      crowns: {},
      quests: {},
      market: [],
      crafting: [],
      logs: [],
      events: [],
      auctions: []
    };
    await fs.writeJson(DB_FILE, baseData, { spaces: 2 });
  }
}
await initDB();

//---------------------------------------------------------
// HELPER FUNCTIONS
//---------------------------------------------------------
async function loadDB() {
  return fs.readJson(DB_FILE);
}

async function saveDB(db) {
  return fs.writeJson(DB_FILE, db, { spaces: 2 });
}

function logEvent(type, details) {
  console.log(`[${type}]`, details);
}

//---------------------------------------------------------
// PLAYER STATS
//---------------------------------------------------------
app.post("/api/player/stats", async (req, res) => {
  const { uuid } = req.body;
  const db = await loadDB();

  if (!db.players[uuid]) {
    db.players[uuid] = { hp: 100, ep: 100, st: 100, xp: 0, gold: 0 };
    await saveDB(db);
  }

  res.json(db.players[uuid]);
});

//---------------------------------------------------------
// ECONOMY
//---------------------------------------------------------
app.post("/api/economy/update", async (req, res) => {
  const { uuid, gold } = req.body;
  const db = await loadDB();
  db.economy[uuid] = { gold };
  await saveDB(db);
  logEvent("ECON_UPDATE", `${uuid} now has ${gold} gold`);
  res.json({ result: "ok", gold });
});

app.get("/api/economy/get", async (req, res) => {
  const { uuid } = req.query;
  const db = await loadDB();
  res.json(db.economy[uuid] || { gold: 0 });
});

//---------------------------------------------------------
// REPUTATION
//---------------------------------------------------------
app.post("/api/reputacion", async (req, res) => {
  const { uuid, honor, fear, influence } = req.body;
  const db = await loadDB();
  db.reputations[uuid] = { honor, fear, influence };
  await saveDB(db);
  logEvent("REPUTATION", `${uuid}: H${honor}/F${fear}/I${influence}`);
  res.json({ result: "ok" });
});

//---------------------------------------------------------
// MORTAL CUP
//---------------------------------------------------------
app.post("/api/mortalcup/use", async (req, res) => {
  const { uuid, name } = req.body;
  const db = await loadDB();
  const random = Math.random();

  let outcome, message;
  if (random < 0.3) {
    outcome = "Death";
    message = `${name} was rejected by the Cup.`;
  } else if (random < 0.9) {
    outcome = "Nephilim";
    message = `${name} was accepted as Nephilim.`;
  } else {
    outcome = "Silent";
    message = "The Cup remained still.";
  }

  db.players[uuid] = db.players[uuid] || { hp: 100, ep: 100, st: 100, xp: 0, gold: 0 };
  db.players[uuid].status = outcome;
  await saveDB(db);

  res.json({ result: "success", message, outcome });
});

//---------------------------------------------------------
// QUESTS
//---------------------------------------------------------
app.post("/api/quests/list", async (req, res) => {
  const quests = [
    { id: "Q001", name: "Slay the Demon", reward: 50 },
    { id: "Q002", name: "Gather Moon Herbs", reward: 25 }
  ];
  res.json({ quests });
});

app.post("/api/quests/accept", async (req, res) => {
  const { uuid, quest_id } = req.body;
  const db = await loadDB();
  db.quests[uuid] = db.quests[uuid] || [];
  db.quests[uuid].push({ id: quest_id, status: "accepted" });
  await saveDB(db);
  res.json({ result: "accepted" });
});

app.post("/api/quests/complete", async (req, res) => {
  const { uuid, quest_id } = req.body;
  const db = await loadDB();
  db.quests[uuid] = db.quests[uuid] || [];
  const quest = db.quests[uuid].find(q => q.id === quest_id);
  if (quest) quest.status = "completed";
  await saveDB(db);
  res.json({ result: "completed", reward: 50 });
});

//---------------------------------------------------------
// ARTIFACTS / CROWNS
//---------------------------------------------------------
app.post("/api/artifact/claim", async (req, res) => {
  const { uuid, artifact_name } = req.body;
  const db = await loadDB();
  db.artifacts[artifact_name] = uuid;
  await saveDB(db);
  res.json({ result: "claimed", name: artifact_name, owner_uuid: uuid });
});

app.post("/api/crowns/claim", async (req, res) => {
  const { uuid, crown } = req.body;
  const db = await loadDB();
  if (!db.crowns[crown]) {
    db.crowns[crown] = uuid;
    await saveDB(db);
    res.json({ result: "claimed", crown, owner: uuid });
  } else {
    res.json({ result: "taken", owner: db.crowns[crown] });
  }
});

//---------------------------------------------------------
// CRAFTING / ALCHEMY
//---------------------------------------------------------
app.post("/api/crafting/craft", async (req, res) => {
  const { uuid, ingredients } = req.body;
  logEvent("CRAFT", `${uuid} crafted using ${ingredients}`);
  res.json({ result: "crafted", item: "Mystic Essence" });
});

app.post("/api/alchemy/brew", async (req, res) => {
  const { uuid, recipe } = req.body;
  const success = Math.random() < 0.7;
  res.json({ result: success ? "success" : "fail", potion: recipe });
});

//---------------------------------------------------------
// MARKET / AUCTION
//---------------------------------------------------------
app.post("/api/market/list", async (req, res) => {
  const db = await loadDB();
  res.json({ items: db.market });
});

app.post("/api/market/buy", async (req, res) => {
  const { uuid, item_id } = req.body;
  res.json({ result: "bought", item: item_id, buyer: uuid });
});

app.post("/api/auction/post", async (req, res) => {
  const { seller_uuid, item_id, base_price, duration } = req.body;
  const db = await loadDB();
  const auction = { id: Date.now(), seller_uuid, item_id, base_price, duration };
  db.auctions.push(auction);
  await saveDB(db);
  res.json({ result: "posted", auction });
});

app.post("/api/auction/bid", async (req, res) => {
  const { bidder_uuid, auction_id, amount } = req.body;
  res.json({ result: "bid", bidder_uuid, auction_id, amount });
});

//---------------------------------------------------------
// COMBAT
//---------------------------------------------------------
app.post("/api/combat/damage", async (req, res) => {
  const { attacker, target, damage, reason } = req.body;
  logEvent("COMBAT", `${attacker} hit ${target} for ${damage} due to ${reason}`);
  res.json({ result: "recorded", damage });
});

app.post("/api/combat/revive", async (req, res) => {
  const { admin, target } = req.body;
  res.json({ result: "revived", target });
});

//---------------------------------------------------------
// GUARDS / CITY CRIMES
//---------------------------------------------------------
app.post("/api/guards/report", async (req, res) => {
  const { reporter_uuid, offender, crime } = req.body;
  logEvent("CRIME", `${reporter_uuid} reported ${offender} for ${crime}`);
  res.json({ result: "reported" });
});

//---------------------------------------------------------
// SOCIAL / EMOTES
//---------------------------------------------------------
app.post("/api/social/emote", async (req, res) => {
  const { uuid, emote } = req.body;
  logEvent("EMOTE", `${uuid}: ${emote}`);
  res.json({ result: "ok" });
});

app.post("/api/social/friend_request", async (req, res) => {
  const { from, to } = req.body;
  logEvent("FRIEND_REQ", `${from} sent friendship to ${to}`);
  res.json({ result: "sent" });
});

//---------------------------------------------------------
// WORLD EVENTS
//---------------------------------------------------------
app.post("/api/world/events", async (req, res) => {
  const db = await loadDB();
  res.json({ events: db.events });
});

//---------------------------------------------------------
// LOGS / COMPLIANCE
//---------------------------------------------------------
app.post("/api/logs/event", async (req, res) => {
  const { event_type, details } = req.body;
  const db = await loadDB();
  db.logs.push({ event_type, details, time: new Date().toISOString() });
  await saveDB(db);
  logEvent("LOG", details);
  res.json({ result: "logged" });
});

//---------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🜂 Shadow Realms API v2.0 — Online");
});

app.listen(PORT, () => console.log(`✅ Shadow Realms API running on port ${PORT}`));
