import { getSupabase } from '../_supabase.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { friendCode } = req.body;
        if (!friendCode) return res.status(400).json({ error: 'friendCode required' });

        const code = friendCode.trim().toUpperCase();
        const db = getSupabase();

        const { data: lookup, error: lookupErr } = await db
            .from('friend_codes')
            .select('user_id')
            .eq('friend_code', code)
            .single();

        if (lookupErr || !lookup) {
            return res.status(404).json({ error: 'הקוד לא נמצא. בדקי שהקלדת נכון.' });
        }

        const { data: user, error: userErr } = await db
            .from('users')
            .select('*')
            .eq('user_id', lookup.user_id)
            .single();

        if (userErr || !user) {
            return res.status(404).json({ error: 'המשתמשת לא נמצאה.' });
        }

        return res.status(200).json({
            userId: user.user_id,
            friendCode: user.friend_code,
            displayName: user.display_name,
            data: {},
            groups: [],
            publicStats: user.public_stats || {}
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
