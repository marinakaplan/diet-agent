import { list } from '@vercel/blob';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const { blobs } = await list({ prefix: `users/${userId}` });
        if (blobs.length === 0) return res.status(200).json({ data: null });

        const response = await fetch(blobs[0].url);
        const userData = await response.json();
        return res.status(200).json({ data: userData.data, publicStats: userData.publicStats, groups: userData.groups, friendCode: userData.friendCode, displayName: userData.displayName });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
