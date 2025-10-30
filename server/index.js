// ===============================================
// 🌑 Shadow Realms - CommonJS API v6.0
// Unified backend for all 54 modules
// ===============================================
const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// -----------------------------------------------
// 🔹 Database
// -----------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -----------------------------------------------
// 🔹 Basic player API
// -----------------------------------------------
app.post("/api/register", async (req, res) => {
  try {
    const { uuid, name, race } = req.body;
    await pool.query(
      `INSERT INTO players (uuid,name,race,level,xp,honor,fear,influence,gold,created_at)
       VALUES ($1,$2,$3,1,0,0,0,0,100,NOW())`,
      [uuid, name, race]
    );
    res.json({ result: "ok", message: `${name} registered as ${race}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/player/:uuid", async (req, res) => {
  const { uuid } = req.params;
  const r = await pool.query("SELECT * FROM players WHERE uuid=$1", [uuid]);
  if (!r.rows.length) return res.status(404).json({ error: "not found" });
  res.json(r.rows[0]);
});

// -----------------------------------------------
// 🔹 Economy
// -----------------------------------------------
app.post("/api/economy/bank/deposit", async (req,res)=>{
  const { uuid, amount } = req.body;
  await pool.query("UPDATE players SET gold=gold+$1 WHERE uuid=$2",[amount,uuid]);
  res.json({ result:"ok", message:`Deposited ${amount}` });
});

app.post("/api/economy/bank/withdraw", async (req,res)=>{
  const { uuid, amount } = req.body;
  await pool.query("UPDATE players SET gold=GREATEST(gold-$1,0) WHERE uuid=$2",[amount,uuid]);
  res.json({ result:"ok", message:`Withdrawn ${amount}` });
});

app.post("/api/economy/bank/balance", async (req,res)=>{
  const { uuid } = req.body;
  const r = await pool.query("SELECT gold FROM players WHERE uuid=$1",[uuid]);
  res.json({ gold:r.rows[0].gold });
});

// -----------------------------------------------
// 🔹 Crafting / Alchemy
// -----------------------------------------------
app.post("/api/crafting/craft", async (req,res)=>{
  const { uuid, recipe } = req.body;
  // dummy result
  res.json({ result:"ok", message:`Crafted item from recipe ${recipe}` });
});
app.post("/api/alchemy/brew", async (req,res)=>{
  const { uuid, ingredients } = req.body;
  res.json({ result:"ok", potion:`Potion of ${ingredients}` });
});

// -----------------------------------------------
// 🔹 Market & Auctions
// -----------------------------------------------
app.post("/api/market/post", async (req,res)=>{
  const { uuid,item,price } = req.body;
  await pool.query("INSERT INTO market (uuid,item,price,created_at) VALUES ($1,$2,$3,NOW())",[uuid,item,price]);
  res.json({ result:"ok", message:`Posted ${item} for ${price}` });
});
app.post("/api/market/accept", async (req,res)=>{
  const { uuid,trade_id } = req.body;
  await pool.query("DELETE FROM market WHERE id=$1",[trade_id]);
  res.json({ result:"ok", message:`Trade ${trade_id} accepted` });
});

// -----------------------------------------------
// 🔹 Artifacts & Crowns
// -----------------------------------------------
app.post("/api/artifacts/claim", async (req,res)=>{
  const { name, owner_uuid } = req.body;
  await pool.query(
    `INSERT INTO artifacts(name,owner_uuid,fecha_claim)
     VALUES ($1,$2,NOW())
     ON CONFLICT(name) DO UPDATE SET owner_uuid=$2,fecha_claim=NOW()`,
    [name, owner_uuid]
  );
  res.json({ result:"ok", message:`${name} claimed by ${owner_uuid}` });
});

app.post("/api/crowns/assign", async (req,res)=>{
  const { race, owner_uuid } = req.body;
  await pool.query("UPDATE crowns SET owner_uuid=$1 WHERE race=$2",[owner_uuid,race]);
  res.json({ result:"ok", message:`Crown of ${race} assigned` });
});

// -----------------------------------------------
// 🔹 Quests
// -----------------------------------------------
app.get("/api/quests/list", async (req,res)=>{
  const r = await pool.query("SELECT * FROM quests");
  res.json(r.rows);
});

app.post("/api/quests/accept", async (req,res)=>{
  const { uuid, quest_id } = req.body;
  await pool.query("INSERT INTO quest_log(uuid,quest_id,accepted_at) VALUES ($1,$2,NOW())",[uuid,quest_id]);
  res.json({ result:"ok", message:`Quest ${quest_id} accepted` });
});

// -----------------------------------------------
// 🔹 World: time, weather, events
// -----------------------------------------------
app.post("/api/world/time/now",(req,res)=>{
  const t = new Date().toISOString().substring(11,16);
  res.json({ result:"ok", time:t });
});

app.post("/api/world/weather/get",(req,res)=>{
  res.json({ result:"ok", type:"Clear" });
});

app.post("/api/world/calendar/list",async(req,res)=>{
  const r = await pool.query("SELECT * FROM events ORDER BY date");
  res.json(r.rows);
});

// -----------------------------------------------
// 🔹 Mortal Cup, Sword, Lake Lynn
// -----------------------------------------------
app.post("/api/mortalcup/use", async (req, res) => {
  const { uuid, name } = req.body;
  const r = await pool.query("SELECT race FROM players WHERE uuid=$1",[uuid]);
  if (!r.rows.length) return res.json({ message:"not found" });
  const race = r.rows[0].race;
  if (race === "Nephilim") return res.json({ message:`${name} already Nephilim` });
  const fate = Math.random();
  if (fate < 0.7) {
    await pool.query("UPDATE players SET race='Nephilim' WHERE uuid=$1",[uuid]);
    res.json({ outcome:"Nephilim", message:`${name} ascends.` });
  } else {
    await pool.query("DELETE FROM players WHERE uuid=$1",[uuid]);
    res.json({ outcome:"Destroyed", message:`${name} rejected.` });
  }
});

app.post("/api/lakelynn/use",(req,res)=>{
  const { uuid, name } = req.body;
  res.json({ message:`${name} purified in Lake Lynn.` });
});

app.post("/api/sword/claim",(req,res)=>{
  const { uuid,name } = req.body;
  res.json({ message:`${name} now bears the Mortal Sword.` });
});

// -----------------------------------------------
// 🔹 New: Clan & Lineage System
// -----------------------------------------------
app.post("/api/clan/register", async (req,res)=>{
  const { type, founder_uuid, founder_name } = req.body; // type: 'vampire' or 'werewolf'
  await pool.query("INSERT INTO clans(type,founder_uuid,founder_name,created_at) VALUES ($1,$2,$3,NOW())",[type,founder_uuid,founder_name]);
  res.json({ result:"ok", message:`${type} clan founded by ${founder_name}` });
});

app.post("/api/clan/member", async (req,res)=>{
  const { clan_id, member_uuid, generation } = req.body;
  await pool.query("INSERT INTO clan_members(clan_id,member_uuid,generation) VALUES ($1,$2,$3)",[clan_id,member_uuid,generation]);
  res.json({ result:"ok", message:"Member recorded" });
});

app.get("/api/clan/lineage/:clan_id", async (req,res)=>{
  const { clan_id } = req.params;
  const r = await pool.query("SELECT * FROM clan_members WHERE clan_id=$1 ORDER BY generation",[clan_id]);
  res.json(r.rows);
});

// -----------------------------------------------
app.get("/", (_,res)=>res.send("🌘 Shadow Realms API v6.0 running CommonJS."));
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("✅ API running on port",PORT));
