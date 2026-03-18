import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const db = getSupabase();

        const { data: user, error } = await db
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !user) return res.status(200).json({ data: null });

        return res.status(200).json({
            data: {},
            publicStats: user.public_stats,
            groups: [],
            friendCode: user.friend_code,
            displayName: user.display_name,
            profile: user.profile
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
