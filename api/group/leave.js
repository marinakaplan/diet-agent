import { put } from '@vercel/blob';
import { readBlob } from '../_utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, groupId } = req.body;
        if (!userId || !groupId) return res.status(400).json({ error: 'userId and groupId required' });

        const [group, user] = await Promise.all([
            readBlob(`groups/${groupId}`),
            readBlob(`users/${userId}`)
        ]);

        const writes = [];

        if (group) {
            group.members = group.members.filter(m => m.userId !== userId);
            writes.push(put(`groups/${groupId}.json`, JSON.stringify(group), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            }));
        }

        if (user) {
            user.groups = (user.groups || []).filter(g => g !== groupId);
            writes.push(put(`users/${userId}.json`, JSON.stringify(user), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            }));
        }

        if (writes.length > 0) await Promise.all(writes);

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
