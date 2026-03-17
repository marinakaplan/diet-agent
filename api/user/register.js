import { put, list } from '@vercel/blob';

function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'u_' + id;
}

async function generateUniqueFriendCode() {
    for (let attempt = 0; attempt < 20; attempt++) {
        const code = 'SHFT-' + String(Math.floor(1000 + Math.random() * 9000));
        const { blobs } = await list({ prefix: `friendcode-${code}` });
        if (blobs.length === 0) return code;
    }
    // Fallback to 6 digits
    return 'SHFT-' + String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { displayName } = req.body || {};
        const userId = generateId();
        const friendCode = await generateUniqueFriendCode();

        const userData = {
            userId,
            friendCode,
            displayName: displayName || '',
            createdAt: new Date().toISOString(),
            groups: [],
            publicStats: { xp: 0, level: 1, levelName: 'מתחילה', levelEmoji: '🌱', streak: 0, weightLost: 0, lastActive: null },
            data: {}
        };

        // Save user blob
        await put(`users/${userId}.json`, JSON.stringify(userData), {
            access: 'public', addRandomSuffix: false, contentType: 'application/json'
        });

        // Save friend code lookup
        await put(`friendcode-${friendCode}.json`, JSON.stringify({ userId, friendCode }), {
            access: 'public', addRandomSuffix: false, contentType: 'application/json'
        });

        return res.status(200).json({ userId, friendCode });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
