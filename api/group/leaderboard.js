import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { groupId } = req.query;
        if (!groupId) return res.status(400).json({ error: 'groupId required' });

        const db = getSupabase();

        const { data: group, error } = await db
            .from('groups')
            .select('*')
            .eq('group_id', groupId)
            .single();

        if (error || !group) return res.status(404).json({ error: 'Group not found' });

        const memberIds = (group.members || []).map(m => m.userId);

        const { data: users } = await db
            .from('users')
            .select('user_id, display_name, public_stats')
            .in('user_id', memberIds);

        const rankings = (users || []).map(u => ({
            userId: u.user_id,
            displayName: u.display_name || 'ללא שם',
            ...(u.public_stats || {})
        }));

        rankings.sort((a, b) => (b.xp || 0) - (a.xp || 0));

        return res.status(200).json({
            groupId,
            groupName: group.name,
            inviteCode: group.invite_code,
            memberCount: (group.members || []).length,
            updatedAt: new Date().toISOString(),
            rankings
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
