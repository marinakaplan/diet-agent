import { put } from '@vercel/blob';
import { readBlob } from '../_utils.js';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const { groupId, limit: limitStr } = req.query;
            if (!groupId) return res.status(400).json({ error: 'groupId required' });

            const activities = await readBlob(`activities/${groupId}`) || [];
            const limit = parseInt(limitStr) || 50;

            return res.status(200).json({
                groupId,
                activities: activities.slice(0, limit)
            });
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

            const validTypes = ['meal', 'water', 'weight', 'achievement', 'streak'];
            if (!validTypes.includes(activity.type)) {
                return res.status(400).json({ error: 'Invalid activity type' });
            }

            const user = await readBlob(`users/${userId}`);
            const displayName = user?.displayName || 'ללא שם';

            const activityEntry = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                userId,
                displayName,
                type: activity.type,
                data: activity.data || {},
                timestamp: new Date().toISOString()
            };

            // Read all groups + activities in parallel
            const groupReads = groupIds.map(gid => Promise.all([
                readBlob(`groups/${gid}`),
                readBlob(`activities/${gid}`)
            ]).then(([group, activities]) => ({ gid, group, activities: activities || [] })));

            const groupData = await Promise.all(groupReads);

            const writes = [];
            for (const { gid, group, activities } of groupData) {
                if (!group || !group.members.some(m => m.userId === userId)) continue;
                activities.unshift(activityEntry);
                writes.push(put(`activities/${gid}.json`, JSON.stringify(activities.slice(0, 200)), {
                    access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
                }));
            }

            if (writes.length > 0) await Promise.all(writes);

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
