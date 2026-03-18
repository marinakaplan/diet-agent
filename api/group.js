import { getSupabase } from './_supabase.js';

// Action-specific handlers
const actionHandlers = {
    create: handleCreate,
    join: handleJoin,
    leave: handleLeave,
    leaderboard: handleLeaderboard,
    activity: handleActivity,
};

export default async function handler(req, res) {
    const { action } = req.query;
    if (!action || !actionHandlers[action]) {
        return res.status(400).json({ error: 'Invalid or missing action parameter. Valid: ' + Object.keys(actionHandlers).join(', ') });
    }
    return actionHandlers[action](req, res);
}

// ======================== CREATE ========================
function generateGroupId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'g_' + id;
}

function generateInviteCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

async function handleCreate(req, res) {
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

// ======================== JOIN ========================
async function handleJoin(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, inviteCode } = req.body;
        if (!userId || !inviteCode) return res.status(400).json({ error: 'userId and inviteCode required' });

        const db = getSupabase();

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

// ======================== LEAVE ========================
async function handleLeave(req, res) {
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

// ======================== LEADERBOARD ========================
async function handleLeaderboard(req, res) {
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

// ======================== ACTIVITY ========================
async function handleActivity(req, res) {
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
