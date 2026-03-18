import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, groupId } = req.body;
        if (!userId || !groupId) return res.status(400).json({ error: 'userId and groupId required' });

        const db = getSupabase();

        const { data: group } = await db
            .from('groups')
            .select('members')
            .eq('group_id', groupId)
            .single();

        if (group) {
            const members = (group.members || []).filter(m => m.userId !== userId);
            await db.from('groups').update({ members }).eq('group_id', groupId);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
