import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    if (req.method === 'GET') {
        try {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'userId required' });

            const { data, error } = await db.from('measurements').select('*')
                .eq('user_id', userId).order('date', { ascending: true });
            if (error) throw error;

            return res.status(200).json({ measurements: data || [] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { userId, date, waist, hips, arm } = req.body;
            if (!userId || !date) return res.status(400).json({ error: 'userId, date required' });

            const { data, error } = await db.from('measurements').insert({
                user_id: userId, date, waist: waist || null, hips: hips || null, arm: arm || null
            }).select().single();
            if (error) throw error;

            return res.status(200).json({ measurement: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, date, waist, hips, arm } = req.body;
            if (!id) return res.status(400).json({ error: 'id required' });

            const updates = {};
            if (date !== undefined) updates.date = date;
            if (waist !== undefined) updates.waist = waist;
            if (hips !== undefined) updates.hips = hips;
            if (arm !== undefined) updates.arm = arm;

            const { error } = await db.from('measurements').update(updates).eq('id', id);
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

            const { error } = await db.from('measurements').delete().eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
