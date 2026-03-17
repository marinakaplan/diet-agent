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
        const { userId, inviteCode } = req.body;
        if (!userId || !inviteCode) return res.status(400).json({ error: 'userId and inviteCode required' });

        // Lookup invite code
        const invite = await readBlob(`invite-${inviteCode}`);
        if (!invite) return res.status(404).json({ error: 'קוד לא נמצא' });

        // Read group
        const group = await readBlob(`groups/${invite.groupId}`);
        if (!group) return res.status(404).json({ error: 'קבוצה לא נמצאה' });

        // Check if already member
        if (group.members.some(m => m.userId === userId)) {
            return res.status(200).json({ group, message: 'כבר בקבוצה' });
        }

        // Check max members
        if (group.members.length >= group.maxMembers) {
            return res.status(400).json({ error: 'הקבוצה מלאה' });
        }

        // Read user
        const user = await readBlob(`users/${userId}`);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Add member to group
        group.members.push({
            userId,
            displayName: user.displayName,
            joinedAt: new Date().toISOString(),
            role: 'member'
        });
        await put(`groups/${invite.groupId}.json`, JSON.stringify(group), {
            access: 'public', addRandomSuffix: false, contentType: 'application/json'
        });

        // Add group to user
        user.groups = user.groups || [];
        if (!user.groups.includes(invite.groupId)) {
            user.groups.push(invite.groupId);
            await put(`users/${userId}.json`, JSON.stringify(user), {
                access: 'public', addRandomSuffix: false, contentType: 'application/json'
            });
        }

        return res.status(200).json({ group });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
