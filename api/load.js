import { readBlob } from './_utils.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const data = await readBlob('diet-agent-data');
        return res.status(200).json({ data: data || null });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
