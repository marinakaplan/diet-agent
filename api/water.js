import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    if (req.method === 'GET') {
        try {
            const { userId, date } = req.query;
            if (!userId) return res.status(400).json({ error: 'userId required' });

            let query = db.from('water_log').select('*').eq('user_id', userId);
            if (date) query = query.eq('date', date);

            const { data, error } = await query;
            if (error) throw error;

            return res.status(200).json({ water: data || [] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { userId, date, cups } = req.body;
            if (!userId || !date || cups === undefined) return res.status(400).json({ error: 'userId, date, cups required' });

            const { data, error } = await db.from('water_log').upsert(
                { user_id: userId, date, cups, updated_at: new Date().toISOString() },
                { onConflict: 'user_id,date' }
            ).select().single();
            if (error) throw error;

            return res.status(200).json({ water: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
