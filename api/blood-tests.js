import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    if (req.method === 'GET') {
        try {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'userId required' });

            const { data, error } = await db.from('blood_tests').select('*')
                .eq('user_id', userId).order('date', { ascending: true });
            if (error) throw error;

            return res.status(200).json({ bloodTests: data || [] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { userId, date, glucose, cholesterol, triglycerides, iron, b12, vitd, tsh } = req.body;
            if (!userId || !date) return res.status(400).json({ error: 'userId, date required' });

            const { data, error } = await db.from('blood_tests').insert({
                user_id: userId, date,
                glucose: glucose || null, cholesterol: cholesterol || null,
                triglycerides: triglycerides || null, iron: iron || null,
                b12: b12 || null, vitd: vitd || null, tsh: tsh || null
            }).select().single();
            if (error) throw error;

            return res.status(200).json({ bloodTest: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, date, glucose, cholesterol, triglycerides, iron, b12, vitd, tsh } = req.body;
            if (!id) return res.status(400).json({ error: 'id required' });

            const updates = {};
            if (date !== undefined) updates.date = date;
            if (glucose !== undefined) updates.glucose = glucose;
            if (cholesterol !== undefined) updates.cholesterol = cholesterol;
            if (triglycerides !== undefined) updates.triglycerides = triglycerides;
            if (iron !== undefined) updates.iron = iron;
            if (b12 !== undefined) updates.b12 = b12;
            if (vitd !== undefined) updates.vitd = vitd;
            if (tsh !== undefined) updates.tsh = tsh;

            const { error } = await db.from('blood_tests').update(updates).eq('id', id);
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

            const { error } = await db.from('blood_tests').delete().eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
