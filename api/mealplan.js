import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from './_supabase.js';

export const config = { maxDuration: 60 };

const SYSTEM_PROMPT = `את דיאטנית מומחית שמתכננת ארוחות לבית ישראלי. עליך להחזיר תוכנית שבועית JSON תקין בלבד, ללא טקסט נוסף.

עקרונות:
- שמרי על כשרות והפרדת בשר/חלב אם המשתמשת מבקשת
- ימי שישי-שבת שונים: ארוחת ליל שבת רחבה יותר, יום שבת בית עם סלטים
- מנת מבוגרים מחושבת כך שאם המשתמשת אוכלת אותה, היא קרובה ליעדי המאקרו שלה (לא מחלקת את היעד למשפחה)
- מנת ילדים נפרדת רק אם המנה הראשית לא מתאימה לילדים קטנים
- מתכונים פשוטים, רכיבים ישראליים זמינים
- העדיפי שימוש במזווה הקיים
- מנה אחת ב-meal prep יכולה לחזור פעמיים השבוע
- וריאציה בחלבונים בין הימים (לא לחזור על אותו חלבון יותר מפעמיים)
- שאפי ל-10-12 מנות ייחודיות בשבוע, לא יותר`;

function buildUserPrompt({ profile, pantry, constraints, existingRecipes }) {
    const macros = profile.macros || { calories: 1800, protein: 100, carbs: 200, fat: 60 };
    const family = profile.family || { adults: 1, kids: [] };
    const prefs = profile.preferences || {};

    let promptParts = [
        `תכנני שבוע מ${constraints.startDay || 'ראשון'} ל-${profile.name || 'משתמשת'}.`,
        `הבית: ${family.adults} מבוגרים${family.kids?.length ? ` + ${family.kids.length} ילדים בגילי ${family.kids.map(k => k.age).join(', ')}` : ''}.`,
        `יעדי מאקרו של המשתמשת (פר-יום): ${JSON.stringify(macros)}`,
        `העדפות: ${JSON.stringify(prefs)}`,
        `מזווה קיים: ${pantry.length ? pantry.join(', ') : 'ריק'}`,
        `אילוצים: ${JSON.stringify(constraints)}`,
    ];

    if (existingRecipes?.length) {
        promptParts.push(`\nמתכונים אהובים מהמאגר (תעדיפי להשתמש בהם):`);
        for (const r of existingRecipes.slice(0, 15)) {
            promptParts.push(`- ${r.title}${r.meal_type ? ` (${r.meal_type})` : ''}`);
        }
    }

    promptParts.push(`\nהחזירי JSON במבנה הבא בדיוק:
{
  "week": [
    {
      "day": "ראשון",
      "meals": {
        "בוקר": { "name": "שם המנה", "macrosPerAdultPortion": {"cal": 0, "p": 0, "c": 0, "f": 0}, "prepMinutes": 0, "needsKidVersion": false, "kidVersion": null, "mealPrepShared": null, "ingredients": [{"name":"...","qty":"..."}] },
        "צהריים": { ... },
        "ערב": { ... }
      }
    }
  ],
  "shoppingList": [
    { "category": "ירקות", "name": "עגבניות", "qty": "1 קילו", "estimatedTier": "₪", "inPantry": false }
  ],
  "weeklySummary": {
    "avgDailyCaloriesForUser": 0,
    "estimatedTotalCost": "₪₪",
    "uniqueDishes": 0,
    "mealsSkipped": 0
  }
}`);

    return promptParts.join('\n');
}

export default async function handler(req, res) {
    try {
        if (req.method === 'GET') return await getPlan(req, res);
        if (req.method === 'POST') return await generate(req, res);
        if (req.method === 'PATCH') return await updatePlan(req, res);
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

async function getPlan(req, res) {
    const { userId, weekStart } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db = getSupabase();
    let q = db.from('meal_plans').select('*').eq('user_id', userId).order('week_start', { ascending: false });
    if (weekStart) q = q.eq('week_start', weekStart);
    else q = q.limit(1);

    const { data, error } = await q;
    if (error) {
        // Likely table not yet migrated — return empty so UI shows the empty state
        return res.status(200).json({ plan: null, warning: error.message });
    }
    return res.status(200).json({ plan: data?.[0] || null });
}

async function generate(req, res) {
    const { userId, weekStart, constraints } = req.body || {};
    if (!userId || !weekStart) return res.status(400).json({ error: 'userId and weekStart required' });

    const db = getSupabase();

    // Pull user profile
    const { data: user } = await db.from('users').select('display_name, profile').eq('user_id', userId).single();
    const profile = {
        name: user?.display_name || '',
        ...(user?.profile || {}),
    };

    // Pull pantry (have_it only)
    const { data: pantryRows } = await db
        .from('pantry_items')
        .select('name')
        .eq('user_id', userId)
        .eq('has_it', true);
    const pantry = (pantryRows || []).map(r => r.name);

    // Pull a few existing recipes to bias toward them
    const { data: existingRecipes } = await db
        .from('recipes')
        .select('title, meal_type, dietary_tags')
        .eq('user_id', userId)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .limit(15);

    const userPrompt = buildUserPrompt({ profile, pantry, constraints: constraints || {}, existingRecipes });

    const client = new Anthropic();
    const t0 = Date.now();
    const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
    });
    const ms = Date.now() - t0;

    const text = resp.content.find(b => b.type === 'text')?.text || '';
    let plan;
    try {
        const m = text.match(/\{[\s\S]*\}/);
        plan = JSON.parse(m[0]);
    } catch {
        return res.status(500).json({ error: 'Plan generation returned invalid JSON', raw: text.slice(0, 500) });
    }

    // Save plan (upsert by user_id + week_start)
    const planId = 'mp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const { error: upsertErr } = await db
        .from('meal_plans')
        .upsert(
            {
                id: planId,
                user_id: userId,
                week_start: weekStart,
                plan,
                shopping_list: plan.shoppingList || null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,week_start' }
        );
    if (upsertErr) throw upsertErr;

    return res.status(200).json({
        plan,
        meta: {
            generationMs: ms,
            inputTokens: resp.usage?.input_tokens,
            outputTokens: resp.usage?.output_tokens,
        },
    });
}

async function updatePlan(req, res) {
    const { userId, weekStart, plan, shoppingList } = req.body || {};
    if (!userId || !weekStart) return res.status(400).json({ error: 'userId and weekStart required' });

    const updates = { updated_at: new Date().toISOString() };
    if (plan) updates.plan = plan;
    if (shoppingList) updates.shopping_list = shoppingList;

    const db = getSupabase();
    const { error } = await db
        .from('meal_plans')
        .update(updates)
        .eq('user_id', userId)
        .eq('week_start', weekStart);
    if (error) throw error;
    return res.status(200).json({ ok: true });
}
