import { put } from '@vercel/blob';
import { readBlob } from '../_utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, data, publicStats } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        let userData = await readBlob(`users/${userId}`);
        if (!userData) return res.status(404).json({ error: 'User not found' });

        userData.data = data || userData.data;
        userData.publicStats = publicStats || userData.publicStats;
        userData.displayName = publicStats?.displayName || userData.displayName;

        await put(`users/${userId}.json`, JSON.stringify(userData), {
            access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
        });

        // Rebuild leaderboards in parallel
        if (userData.groups && userData.groups.length > 0) {
            const rebuilds = userData.groups.map(groupId => rebuildLeaderboard(groupId).catch(() => {}));
            await Promise.all(rebuilds);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function rebuildLeaderboard(groupId) {
    const group = await readBlob(`groups/${groupId}`);
    if (!group) return;

    const memberPromises = group.members.map(m => readBlob(`users/${m.userId}`).then(user => {
        if (!user) return null;
        return {
            userId: user.userId,
            displayName: user.displayName || 'ללא שם',
            ...(user.publicStats || {})
        };
    }));

    const rankings = (await Promise.all(memberPromises)).filter(Boolean);
    rankings.sort((a, b) => (b.xp || 0) - (a.xp || 0) || (b.streak || 0) - (a.streak || 0));

    await put(`leaderboards/${groupId}.json`, JSON.stringify({
        groupId,
        updatedAt: new Date().toISOString(),
        rankings
    }), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}
