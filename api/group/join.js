import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, inviteCode } = req.body;
        if (!userId || !inviteCode) return res.status(400).json({ error: 'userId and inviteCode required' });

        const db = getSupabase();

        // Find group by invite code
        const { data: group, error: gErr } = await db
            .from('groups')
            .select('*')
            .eq('invite_code', inviteCode)
            .single();

        if (gErr || !group) return res.status(404).json({ error: 'קוד לא נמצא' });

        const members = group.members || [];

        if (members.some(m => m.userId === userId)) {
            return res.status(200).json({ group: { ...group, groupId: group.group_id }, message: 'כבר בקבוצה' });
        }

        if (members.length >= 20) {
            return res.status(400).json({ error: 'הקבוצה מלאה' });
        }

        const { data: user } = await db.from('users').select('display_name').eq('user_id', userId).single();

        members.push({
            userId,
            displayName: user?.display_name || 'משתמשת',
            joinedAt: new Date().toISOString(),
            role: 'member'
        });

        const { error } = await db
            .from('groups')
            .update({ members })
            .eq('group_id', group.group_id);

        if (error) throw error;

        return res.status(200).json({
            group: {
                groupId: group.group_id,
                name: group.name,
                inviteCode: group.invite_code,
                members
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
