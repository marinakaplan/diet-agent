import { put, list } from '@vercel/blob';

async function readBlob(prefix) {
    const { blobs } = await list({ prefix });
    if (blobs.length === 0) return null;
    const resp = await fetch(blobs[0].url);
    return resp.json();
}

function generateGroupId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'g_' + id;
}

async function generateUniqueInviteCode() {
    for (let attempt = 0; attempt < 20; attempt++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const { blobs } = await list({ prefix: `invite-${code}` });
        if (blobs.length === 0) return code;
    }
    return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, groupName } = req.body;
        if (!userId || !groupName) return res.status(400).json({ error: 'userId and groupName required' });

        const user = await readBlob(`users/${userId}`);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const groupId = generateGroupId();
        const inviteCode = await generateUniqueInviteCode();

        const group = {
            groupId,
            name: groupName,
            inviteCode,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            members: [{ userId, displayName: user.displayName, joinedAt: new Date().toISOString(), role: 'admin' }],
            maxMembers: 20
        };

        // Save group
        await put(`groups/${groupId}.json`, JSON.stringify(group), {
            access: 'public', addRandomSuffix: false, contentType: 'application/json'
        });

        // Save invite code lookup
        await put(`invite-${inviteCode}.json`, JSON.stringify({ groupId, inviteCode }), {
            access: 'public', addRandomSuffix: false, contentType: 'application/json'
        });

        // Add group to user
        user.groups = user.groups || [];
        user.groups.push(groupId);
        await put(`users/${userId}.json`, JSON.stringify(user), {
            access: 'public', addRandomSuffix: false, contentType: 'application/json'
        });

        return res.status(200).json({ groupId, inviteCode, name: groupName });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
