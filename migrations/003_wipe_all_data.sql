-- ============================================
-- ⚠️  DESTRUCTIVE  ⚠️
-- Wipes ALL user data. Schema is preserved.
-- ============================================

TRUNCATE TABLE
    meals,
    exercises,
    water_log,
    weights,
    measurements,
    blood_tests,
    favorites,
    gamification,
    pairing_codes,
    group_activity,
    group_challenges,
    group_goals,
    groups,
    friend_codes,
    users
RESTART IDENTITY CASCADE;
