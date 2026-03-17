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
        const { userId, data, publicStats } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        // Read existing user
        let userData = await readBlob(`users/${userId}`);
        if (!userData) return res.status(404).json({ error: 'User not found' });

        // Update user data
        userData.data = data || userData.data;
        userData.publicStats = publicStats || userData.publicStats;
        userData.displayName = publicStats?.displayName || userData.displayName;

        await put(`users/${userId}.json`, JSON.stringify(userData), {
            access: 'public', addRandomSuffix: false, contentType: 'application/json'
        });

        // Update leaderboards for all groups
        if (userData.groups && userData.groups.length > 0) {
            for (const groupId of userData.groups) {
                try {
                    await rebuildLeaderboard(groupId);
                } catch (e) {
                    console.log('Leaderboard rebuild failed for', groupId, e.message);
                }
            }
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function rebuildLeaderboard(groupId) {
    const group = await readBlob(`groups/${groupId}`);
    if (!group) return;

    const rankings = [];
    for (const member of group.members) {
        const user = await readBlob(`users/${member.userId}`);
        if (user) {
            rankings.push({
                userId: user.userId,
                displayName: user.displayName || 'ללא שם',
                ...(user.publicStats || {})
            });
        }
    }

    rankings.sort((a, b) => (b.xp || 0) - (a.xp || 0) || (b.streak || 0) - (a.streak || 0));

    await put(`leaderboards/${groupId}.json`, JSON.stringify({
        groupId,
        updatedAt: new Date().toISOString(),
        rankings
    }), { access: 'public', addRandomSuffix: false, contentType: 'application/json' });
}
