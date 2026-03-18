import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    if (req.method === 'GET') {
        try {
            const { userId, date } = req.query;
            if (!userId) return res.status(400).json({ error: 'userId required' });

            let query = db.from('exercises').select('*').eq('user_id', userId);
            if (date) query = query.eq('date', date);
            query = query.order('created_at', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;

            return res.status(200).json({ exercises: data || [] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { userId, date, exercise } = req.body;
            if (!userId || !date || !exercise) return res.status(400).json({ error: 'userId, date, exercise required' });

            const { data, error } = await db.from('exercises').insert({
                user_id: userId, date,
                type: exercise.type || '', name: exercise.name || '', icon: exercise.icon || 'heart',
                duration: exercise.duration || 0, calories_burned: exercise.caloriesBurned || 0,
                time: exercise.time || ''
            }).select().single();
            if (error) throw error;

            return res.status(200).json({ exercise: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, exercise } = req.body;
            if (!id || !exercise) return res.status(400).json({ error: 'id and exercise required' });

            const updates = {};
            if (exercise.name !== undefined) updates.name = exercise.name;
            if (exercise.type !== undefined) updates.type = exercise.type;
            if (exercise.duration !== undefined) updates.duration = exercise.duration;
            if (exercise.caloriesBurned !== undefined) updates.calories_burned = exercise.caloriesBurned;
            if (exercise.time !== undefined) updates.time = exercise.time;

            const { error } = await db.from('exercises').update(updates).eq('id', id);
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

            const { error } = await db.from('exercises').delete().eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
