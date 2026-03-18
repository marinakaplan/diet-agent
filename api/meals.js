import { getSupabase } from './_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    // GET meals for a user + date
    if (req.method === 'GET') {
        try {
            const { userId, date } = req.query;
            if (!userId) return res.status(400).json({ error: 'userId required' });

            let query = db.from('meals').select('*').eq('user_id', userId);
            if (date) query = query.eq('date', date);
            query = query.order('created_at', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;

            return res.status(200).json({ meals: data || [] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // POST - create meal
    if (req.method === 'POST') {
        try {
            const { userId, date, meal } = req.body;
            if (!userId || !date || !meal) return res.status(400).json({ error: 'userId, date, meal required' });

            const { data, error } = await db.from('meals').insert({
                user_id: userId, date,
                meal_type: meal.mealType || 'lunch',
                description: meal.description || '',
                calories: meal.calories || 0,
                protein: meal.protein || 0,
                carbs: meal.carbs || 0,
                fat: meal.fat || 0,
                health_score: meal.health_score || 0,
                time: meal.time || '',
                photo_url: meal.photo || '',
                detected_food: meal.detected_food || '',
                notes: meal.notes || ''
            }).select().single();

            if (error) throw error;
            return res.status(200).json({ meal: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // PUT - update meal
    if (req.method === 'PUT') {
        try {
            const { id, meal } = req.body;
            if (!id || !meal) return res.status(400).json({ error: 'id and meal required' });

            const updates = {};
            if (meal.description !== undefined) updates.description = meal.description;
            if (meal.calories !== undefined) updates.calories = meal.calories;
            if (meal.protein !== undefined) updates.protein = meal.protein;
            if (meal.carbs !== undefined) updates.carbs = meal.carbs;
            if (meal.fat !== undefined) updates.fat = meal.fat;
            if (meal.mealType !== undefined) updates.meal_type = meal.mealType;
            if (meal.time !== undefined) updates.time = meal.time;

            const { error } = await db.from('meals').update(updates).eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // DELETE
    if (req.method === 'DELETE') {
        try {
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: 'id required' });

            const { error } = await db.from('meals').delete().eq('id', id);
            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
