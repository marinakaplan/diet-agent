import { readBlob } from '../_utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { friendCode } = req.body;
        if (!friendCode) return res.status(400).json({ error: 'friendCode required' });

        const code = friendCode.trim().toUpperCase();

        const lookup = await readBlob(`friendcode-${code}`);
        if (!lookup) {
            return res.status(404).json({ error: 'הקוד לא נמצא. בדקי שהקלדת נכון.' });
        }

        const user = await readBlob(`users/${lookup.userId}`);
        if (!user) {
            return res.status(404).json({ error: 'המשתמשת לא נמצאה.' });
        }

        return res.status(200).json({
            userId: user.userId,
            friendCode: user.friendCode,
            displayName: user.displayName,
            data: user.data || {},
            groups: user.groups || [],
            publicStats: user.publicStats || {}
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
