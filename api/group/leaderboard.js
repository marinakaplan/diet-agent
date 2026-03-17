import { readBlob } from '../_utils.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { groupId } = req.query;
        if (!groupId) return res.status(400).json({ error: 'groupId required' });

        const leaderboard = await readBlob(`leaderboards/${groupId}`);
        if (leaderboard) {
            return res.status(200).json(leaderboard);
        }

        const group = await readBlob(`groups/${groupId}`);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const memberPromises = group.members.map(m => readBlob(`users/${m.userId}`).then(user => {
            if (!user) return null;
            return {
                userId: user.userId,
                displayName: user.displayName || m.displayName || 'ללא שם',
                ...(user.publicStats || {})
            };
        }));

        const rankings = (await Promise.all(memberPromises)).filter(Boolean);
        rankings.sort((a, b) => (b.xp || 0) - (a.xp || 0));

        return res.status(200).json({
            groupId,
            groupName: group.name,
            inviteCode: group.inviteCode,
            memberCount: group.members.length,
            updatedAt: new Date().toISOString(),
            rankings
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
