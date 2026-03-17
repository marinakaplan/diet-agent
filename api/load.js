import { list } from '@vercel/blob';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { blobs } = await list({ prefix: 'diet-agent-data' });

        if (blobs.length === 0) {
            return res.status(200).json({ data: null });
        }

        const response = await fetch(blobs[0].url);
        const data = await response.json();
        return res.status(200).json({ data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
