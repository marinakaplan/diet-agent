import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
    const db = getSupabase();

    if (req.method === 'GET') {
        try {
            const { groupId, limit: limitStr } = req.query;
            if (!groupId) return res.status(400).json({ error: 'groupId required' });

            const limit = parseInt(limitStr) || 50;

            const { data, error } = await db
                .from('group_activity')
                .select('*')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            const activities = (data || []).map(a => ({
                id: a.id,
                userId: a.user_id,
                displayName: a.display_name,
                type: a.type,
                data: a.data,
                timestamp: a.created_at
            }));

            return res.status(200).json({ groupId, activities });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { userId, groupIds, activity } = req.body;
            if (!userId || !groupIds || !activity) {
                return res.status(400).json({ error: 'userId, groupIds, and activity required' });
            }

            const validTypes = ['meal', 'water', 'weight', 'achievement', 'streak', 'exercise'];
            if (!validTypes.includes(activity.type)) {
                return res.status(400).json({ error: 'Invalid activity type' });
            }

            const { data: user } = await db.from('users').select('display_name').eq('user_id', userId).single();
            const displayName = user?.display_name || 'ללא שם';

            // Verify membership and insert activity for each group
            for (const gid of groupIds) {
                const { data: group } = await db.from('groups').select('members').eq('group_id', gid).single();
                if (!group || !(group.members || []).some(m => m.userId === userId)) continue;

                await db.from('group_activity').insert({
                    group_id: gid,
                    user_id: userId,
                    display_name: displayName,
                    type: activity.type,
                    data: activity.data || {}
                });
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
