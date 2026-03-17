import { list } from '@vercel/blob';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { groupId } = req.query;
        if (!groupId) return res.status(400).json({ error: 'groupId required' });

        // Try cached leaderboard first
        const { blobs: lbBlobs } = await list({ prefix: `leaderboards/${groupId}` });
        if (lbBlobs.length > 0) {
            const resp = await fetch(lbBlobs[0].url);
            const leaderboard = await resp.json();
            return res.status(200).json(leaderboard);
        }

        // Build from group data
        const { blobs: groupBlobs } = await list({ prefix: `groups/${groupId}` });
        if (groupBlobs.length === 0) return res.status(404).json({ error: 'Group not found' });

        const groupResp = await fetch(groupBlobs[0].url);
        const group = await groupResp.json();

        const rankings = [];
        for (const member of group.members) {
            const { blobs: userBlobs } = await list({ prefix: `users/${member.userId}` });
            if (userBlobs.length > 0) {
                const userResp = await fetch(userBlobs[0].url);
                const user = await userResp.json();
                rankings.push({
                    userId: user.userId,
                    displayName: user.displayName || member.displayName || 'ללא שם',
                    ...(user.publicStats || {})
                });
            }
        }

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
