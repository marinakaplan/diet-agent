import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    if (req.method === 'GET') {
        try {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'userId required' });

            const { data, error } = await db.from('favorites').select('*')
                .eq('user_id', userId).order('created_at', { ascending: false });
            if (error) throw error;

            return res.status(200).json({ favorites: (data || []).map(f => ({ ...f.meal_data, _id: f.id })) });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { userId, mealData } = req.body;
            if (!userId || !mealData) return res.status(400).json({ error: 'userId, mealData required' });

            const { data, error } = await db.from('favorites').insert({
                user_id: userId, meal_data: mealData
            }).select().single();
            if (error) throw error;

            return res.status(200).json({ favorite: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: 'id required' });

            const { error } = await db.from('favorites').delete().eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
