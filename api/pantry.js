import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    try {
        if (req.method === 'GET') return await list(req, res);
        if (req.method === 'POST') return await upsertBulk(req, res);
        if (req.method === 'DELETE') return await remove(req, res);
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

async function list(req, res) {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db = getSupabase();
    const { data, error } = await db
        .from('pantry_items')
        .select('name, has_it, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json({ items: data || [] });
}

async function upsertBulk(req, res) {
    const { userId, items } = req.body || {};
    if (!userId || !Array.isArray(items)) {
        return res.status(400).json({ error: 'userId and items[] required' });
    }

    const rows = items
        .filter(i => i && i.name)
        .map(i => ({
            user_id: userId,
            name: String(i.name).trim(),
            has_it: i.hasIt !== false,
            updated_at: new Date().toISOString(),
        }));

    if (!rows.length) return res.status(200).json({ updated: 0 });

    const db = getSupabase();
    const { error } = await db
        .from('pantry_items')
        .upsert(rows, { onConflict: 'user_id,name' });
    if (error) throw error;
    return res.status(200).json({ updated: rows.length });
}

async function remove(req, res) {
    const { userId, name } = req.query;
    if (!userId || !name) return res.status(400).json({ error: 'userId and name required' });

    const db = getSupabase();
    const { error } = await db
        .from('pantry_items')
        .delete()
        .eq('user_id', userId)
        .eq('name', name);
    if (error) throw error;
    return res.status(200).json({ ok: true });
}
