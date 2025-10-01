-- Migration: 001-create-players.sql
-- Crea la tabla players si no existe
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    owner_key UUID UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    rp_name TEXT,
    race TEXT DEFAULT 'Mundane' NOT NULL,
    level INTEGER DEFAULT 1 NOT NULL,
    xp BIGINT DEFAULT 0 NOT NULL,
    health INTEGER DEFAULT 100 NOT NULL,
    stamina INTEGER DEFAULT 100 NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    status_expiration TIMESTAMPTZ,
    language VARCHAR(2) DEFAULT 'en' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);
