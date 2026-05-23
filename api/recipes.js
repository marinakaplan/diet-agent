import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    try {
        if (req.method === 'GET') return await list(req, res);
        if (req.method === 'POST') return await create(req, res);
        if (req.method === 'PATCH') return await update(req, res);
        if (req.method === 'DELETE') return await remove(req, res);
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

async function list(req, res) {
    const { userId, mealType, tag } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db = getSupabase();
    let q = db.from('recipes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (mealType) q = q.eq('meal_type', mealType);
    if (tag) q = q.contains('dietary_tags', [tag]);

    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ recipes: data || [] });
}

function genId() {
    return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function create(req, res) {
    const { userId, title, ingredients, steps, servings, prepMinutes, mealType, dietaryTags, macros, source, notes } = req.body || {};
    if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });

    const row = {
        id: genId(),
        user_id: userId,
        title,
        ingredients: ingredients || [],
        steps: steps || [],
        servings: servings || 4,
        prep_minutes: prepMinutes ?? null,
        meal_type: mealType || null,
        dietary_tags: dietaryTags || [],
        macros: macros || null,
        source: source || null,
        notes: notes || null,
    };

    const db = getSupabase();
    const { error } = await db.from('recipes').insert(row);
    if (error) throw error;
    return res.status(200).json({ id: row.id });
}

async function update(req, res) {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const allowed = ['title', 'ingredients', 'steps', 'servings', 'prep_minutes', 'meal_type', 'dietary_tags', 'macros', 'source', 'notes', 'last_used_at'];
    const updates = {};
    for (const k of allowed) if (k in fields) updates[k] = fields[k];

    const db = getSupabase();
    const { error } = await db.from('recipes').update(updates).eq('id', id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
}

async function remove(req, res) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    const db = getSupabase();
    const { error } = await db.from('recipes').delete().eq('id', id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
}
