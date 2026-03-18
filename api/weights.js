import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    if (req.method === 'GET') {
        try {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'userId required' });

            const { data, error } = await db.from('weights').select('*')
                .eq('user_id', userId).order('date', { ascending: true });
            if (error) throw error;

            return res.status(200).json({ weights: data || [] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { userId, date, value } = req.body;
            if (!userId || !date || value === undefined) return res.status(400).json({ error: 'userId, date, value required' });

            const { data, error } = await db.from('weights').insert({
                user_id: userId, date, value
            }).select().single();
            if (error) throw error;

            return res.status(200).json({ weight: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, date, value } = req.body;
            if (!id) return res.status(400).json({ error: 'id required' });

            const updates = {};
            if (date !== undefined) updates.date = date;
            if (value !== undefined) updates.value = value;

            const { error } = await db.from('weights').update(updates).eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: 'id required' });

            const { error } = await db.from('weights').delete().eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
