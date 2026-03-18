import { getSupabase } from '../_supabase.js';

function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'u_' + id;
}

function generateFriendCode() {
    return 'SHFT-' + String(Math.floor(1000 + Math.random() * 9000));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { displayName } = req.body || {};
        const userId = generateId();
        const friendCode = generateFriendCode();
        const db = getSupabase();

        const userData = {
            user_id: userId,
            friend_code: friendCode,
            display_name: displayName || '',
            profile: {},
            public_stats: { xp: 0, level: 1, levelName: 'מתחילה', levelEmoji: '🌱', streak: 0, weightLost: 0, lastActive: null },
            created_at: new Date().toISOString()
        };

        const { error: userErr } = await db.from('users').insert(userData);
        if (userErr) throw userErr;

        const { error: codeErr } = await db.from('friend_codes').insert({ friend_code: friendCode, user_id: userId });
        if (codeErr) throw codeErr;

        // Init gamification row
        await db.from('gamification').insert({ user_id: userId, xp: 0, streak: 0, achievements: [], xp_log: [] });

        return res.status(200).json({ userId, friendCode });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
