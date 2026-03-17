import { readBlob } from '../_utils.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const userData = await readBlob(`users/${userId}`);
        if (!userData) return res.status(200).json({ data: null });

        return res.status(200).json({
            data: userData.data,
            publicStats: userData.publicStats,
            groups: userData.groups,
            friendCode: userData.friendCode,
            displayName: userData.displayName
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
