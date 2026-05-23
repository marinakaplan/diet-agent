-- ============================================
-- Meal planner infrastructure
-- ============================================
-- Adds the shared backbone for the weekly meal planner:
--   recipes   — shared between diet-agent app + special-agent bot
--   pantry    — binary have/out per user
--   meal_plans — weekly plans, one row per week per user

-- ============ RECIPES ============
CREATE TABLE IF NOT EXISTS recipes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    ingredients     JSONB NOT NULL DEFAULT '[]'::jsonb,
    steps           JSONB NOT NULL DEFAULT '[]'::jsonb,
    servings        INTEGER DEFAULT 4,
    prep_minutes    INTEGER,
    meal_type       TEXT,
    dietary_tags    JSONB NOT NULL DEFAULT '[]'::jsonb,
    macros          JSONB,
    source          TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_type ON recipes(user_id, meal_type);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON recipes USING gin(dietary_tags);

ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON recipes TO anon, authenticated;

-- ============ PANTRY ============
CREATE TABLE IF NOT EXISTS pantry_items (
    user_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    has_it      BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_pantry_user_has ON pantry_items(user_id, has_it);

ALTER TABLE pantry_items DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON pantry_items TO anon, authenticated;

-- ============ MEAL PLANS ============
CREATE TABLE IF NOT EXISTS meal_plans (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    week_start      DATE NOT NULL,
    plan            JSONB NOT NULL,
    shopping_list   JSONB,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at     TIMESTAMPTZ,
    UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_user_week ON meal_plans(user_id, week_start DESC);

ALTER TABLE meal_plans DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON meal_plans TO anon, authenticated;
