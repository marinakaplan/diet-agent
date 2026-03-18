import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, publicStats, profile, displayName } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const db = getSupabase();

        // Update user record
        const updates = {};
        if (publicStats) updates.public_stats = publicStats;
        if (profile) updates.profile = profile;
        if (displayName || publicStats?.displayName) updates.display_name = displayName || publicStats.displayName;

        const { error } = await db
            .from('users')
            .update(updates)
            .eq('user_id', userId);

        if (error) throw error;

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
