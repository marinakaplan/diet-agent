import { put } from '@vercel/blob';

function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'u_' + id;
}

function generateFriendCode() {
    return 'SHFT-' + String(Math.floor(1000 + Math.random() * 9000));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { displayName } = req.body || {};
        const userId = generateId();
        const friendCode = generateFriendCode();

        const userData = {
            userId,
            friendCode,
            displayName: displayName || '',
            createdAt: new Date().toISOString(),
            groups: [],
            publicStats: { xp: 0, level: 1, levelName: 'מתחילה', levelEmoji: '🌱', streak: 0, weightLost: 0, lastActive: null },
            data: {}
        };

        // Save user + friend code in parallel
        await Promise.all([
            put(`users/${userId}.json`, JSON.stringify(userData), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            }),
            put(`friendcode-${friendCode}.json`, JSON.stringify({ userId, friendCode }), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            })
        ]);

        return res.status(200).json({ userId, friendCode });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
