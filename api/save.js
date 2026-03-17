import { put } from '@vercel/blob';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { data } = req.body;
        if (!data) {
            return res.status(400).json({ error: 'No data provided' });
        }

        const blob = await put('diet-agent-data.json', JSON.stringify(data), {
            access: 'public',
            addRandomSuffix: false,
            contentType: 'application/json'
        });

        return res.status(200).json({ success: true, url: blob.url });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
