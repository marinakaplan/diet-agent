import { put, list } from '@vercel/blob';

async function readBlob(prefix) {
    const { blobs } = await list({ prefix });
    if (blobs.length === 0) return null;
    const resp = await fetch(blobs[0].url);
    return resp.json();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, groupId } = req.body;
        if (!userId || !groupId) return res.status(400).json({ error: 'userId and groupId required' });

        // Remove member from group
        const group = await readBlob(`groups/${groupId}`);
        if (group) {
            group.members = group.members.filter(m => m.userId !== userId);
            await put(`groups/${groupId}.json`, JSON.stringify(group), {
                access: 'public', addRandomSuffix: false, contentType: 'application/json'
            });
        }

        // Remove group from user
        const user = await readBlob(`users/${userId}`);
        if (user) {
            user.groups = (user.groups || []).filter(g => g !== groupId);
            await put(`users/${userId}.json`, JSON.stringify(user), {
                access: 'public', addRandomSuffix: false, contentType: 'application/json'
            });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
