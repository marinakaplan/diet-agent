# DietAgent — Product Plan (user-value first)

_Prepared 2026-07-04. Based on a full walkthrough of the app from a real user's perspective._

## TL;DR

DietAgent is already a capable Hebrew diet PWA. The problem isn't missing features —
it's that **several of the best features are invisible, broken, or fake**. The highest
returns come from *reclaiming value already built* before adding anything new.

---

## What the app already does well (working end-to-end)

- **Cross-device login** — name + Israeli national-ID (checksum-validated) + 4-digit PIN;
  logs you back in from any device.
- **AI food logging** — free text and/or photo → Claude estimates calories/protein/carbs/fat +
  health score; editable before saving. Favorites re-log with no AI call.
- **Virtual dietitian chat** — free-form nutrition chat using your real data as context.
- **Blood-test OCR + analysis** — photo → extracted values → AI interpretation.
- **Meal planning** — single-day "plan my day" + full **7-day meal planner** with pantry sync,
  categorized shopping list, and WhatsApp share.
- **Social layer** — groups, invite codes via WhatsApp, activity feed, XP leaderboards,
  challenges/dares — fully functional end-to-end.
- **Gamification** — XP, 10 levels, daily streaks, water tracker, 22 achievements — genuinely
  wired to real logging actions.

**Stack:** vanilla JS (`app.js`, `ai-agent.js`, `gamification.js`, `groups.js`) · Supabase
Postgres via Vercel serverless (`/api`) · localStorage-first with debounced cloud sync ·
Claude (Sonnet for chat/food/blood/day-plan, Haiku for the weekly planner).

---

## The 3 findings that cost the most user value right now

### 🔴 1. The entire progress/history view is built but unreachable
The metrics page — weight chart, BMI, measurements, blood-test trends with AI analysis,
before/after progress photos — is fully coded and routed (`navigateTo('metrics')`,
app.js:197-217) but **nothing in the navigation links to it** (bottom nav only has
home/food/groups/chat/profile, index.html:954-975). Users literally cannot see their
weight history. **Highest ROI fix in the app** — the feature exists, it just needs a nav entry.

### 🔴 2. Logging your first exercise permanently corrupts XP/level
`app.js:2879` calls `addXP(XP_REWARDS.log_exercise, ...)` but `log_exercise` is **not defined**
in `XP_REWARDS` (gamification.js:8-20). Result: `XP = oldXP + undefined = NaN`, persisted to
storage, dropping the user to "level 1" forever and poisoning the value synced to the group
leaderboard. Data-corrupting bug on a core, frequent action.

### 🔴 3. Meal photos vanish across devices
Photos are stored as base64 in `localStorage['da_meal_photos']`; only a **numeric id** is synced
to the server (`api/save.js:34` writes that id into `photo_url`). New device or cleared cache =
every food photo silently lost — directly undermining the cross-device login that's the app's
main promise.

---

## Features that mislead the user ("theater")

- **"Me vs family" meal-plan toggle is cosmetic** — no UI exists to set family size, kids' ages,
  or kosher/dislikes, so "family" sends the same 1-adult data as "me"; only prompt wording changes
  (app.js:169-183). (It's also what pushes the planner past Vercel's 60s timeout.)
- **"You won! +100 XP" is false** — no XP is ever granted for winning a challenge (groups.js:909).
- **3 social achievements are permanently unreachable** — they read keys
  (`game_challenges_joined/won`, `game_goals_completed`) that are never set.
- **Group Goals** are fully built server-side but have no button to trigger them (dead feature).
- **Dormant code, zero UI:** 30-tip daily-tip library, badge collection, evolving avatar.

---

## Genuinely missing (new value not yet attempted)

- **No reminders / push notifications** — nothing nudges the user to log a meal or drink water.
  For a habit app this is the single biggest missing retention lever. (Service worker already exists.)
- **All macros are LLM-guessed** — no barcode / nutrition-database grounding to cross-check.
- **AI chat is blind on a new device** — context is read from localStorage only, not the cloud.
- **Security gaps** — 4-digit PIN with no lockout/rate-limiting; all Supabase RLS policies are
  `USING(true)` (API layer is the only guard).

---

## Plan — sequenced by value-per-effort

### Tier 1 — Reclaim value already built (hours, not days) ⭐ start here
1. **Add Metrics to the nav** → unlocks weight/BMI/blood-test trends + progress photos instantly.
2. **Fix the exercise-XP `NaN` bug** — add `log_exercise` to `XP_REWARDS` + a one-time repair that
   resets `NaN` XP for already-corrupted users.
3. **Fix meal-photo sync** — persist the actual image (Supabase storage or the photo column) so
   photos survive device switches.
4. **Make rewards honest** — grant real XP on challenge win; hide/remove the 3 dead achievements
   and the dead alternate-login code paths.

### Tier 2 — Biggest new retention lever
5. **Web push reminders** — service-worker push + opt-in: "log lunch?", "drink water",
   "you're 1 day from a 7-day streak." Builds on the existing service worker.

### Tier 3 — Depth & trust
6. **Make "family" real** — small household-profile UI (size, kids' ages, kosher/dislikes) so the
   family meal plan actually differs, and fix the >60s Vercel timeout (stream or chunk the plan).
7. **Ground macros** with a barcode / nutrition lookup to cross-check AI estimates.
8. **Cloud-backed AI chat context** + **PIN rate-limiting** for security.

---

## Recommendation

Do **Tier 1 as one focused batch** — low-risk, high-visibility, and it makes the app honest and
complete before adding anything new. Then build **Tier 2 (push reminders)** as the flagship new feature.
