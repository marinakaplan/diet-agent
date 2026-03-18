import { getSupabase } from '../_supabase.js';

function generateGroupId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'g_' + id;
}

function generateInviteCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, groupName } = req.body;
        if (!userId || !groupName) return res.status(400).json({ error: 'userId and groupName required' });

        const db = getSupabase();

        const { data: user } = await db.from('users').select('display_name').eq('user_id', userId).single();
        const displayName = user?.display_name || 'ללא שם';

        const groupId = generateGroupId();
        const inviteCode = generateInviteCode();

        const members = [{ userId, displayName, joinedAt: new Date().toISOString(), role: 'admin' }];

        const { error } = await db.from('groups').insert({
            group_id: groupId,
            name: groupName,
            invite_code: inviteCode,
            created_by: userId,
            members
        });

        if (error) throw error;

        return res.status(200).json({ groupId, inviteCode, name: groupName });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
