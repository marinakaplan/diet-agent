import { getSupabase } from './_supabase.js';

// POST /api/pair?action=create    body: { userId }              → { code, expiresAt }
// POST /api/pair?action=consume   body: { code, telegramUserId } → { userId }
// GET  /api/pair?userId=...                                     → { telegramLinked: bool }

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req, res) {
    const { action } = req.query;

    if (req.method === 'GET') return handleStatus(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (action === 'create') return handleCreate(req, res);
    if (action === 'consume') return handleConsume(req, res);
    return res.status(400).json({ error: 'Invalid action. Use create or consume.' });
}

async function handleCreate(req, res) {
    try {
        const { userId } = req.body || {};
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const db = getSupabase();

        const { data: user, error: userErr } = await db
            .from('users').select('user_id').eq('user_id', userId).single();
        if (userErr || !user) return res.status(404).json({ error: 'User not found' });

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await db.from('pairing_codes')
            .delete().eq('user_id', userId).is('consumed_at', null);

        const { error } = await db.from('pairing_codes').insert({
            code, user_id: userId, expires_at: expiresAt
        });
        if (error) throw error;

        return res.status(200).json({ code, expiresAt });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function handleConsume(req, res) {
    try {
        const { code, telegramUserId } = req.body || {};
        if (!code || !telegramUserId) {
            return res.status(400).json({ error: 'code and telegramUserId required' });
        }

        const db = getSupabase();

        const { data: row, error: lookupErr } = await db
            .from('pairing_codes')
            .select('*')
            .eq('code', String(code).trim())
            .single();

        if (lookupErr || !row) return res.status(404).json({ error: 'Invalid code' });
        if (row.consumed_at) return res.status(409).json({ error: 'Code already used' });
        if (new Date(row.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Code expired' });
        }

        const { error: updateErr } = await db.from('users')
            .update({ telegram_user_id: telegramUserId })
            .eq('user_id', row.user_id);
        if (updateErr) throw updateErr;

        await db.from('pairing_codes')
            .update({ consumed_at: new Date().toISOString() })
            .eq('code', row.code);

        return res.status(200).json({ userId: row.user_id });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function handleStatus(req, res) {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        const db = getSupabase();
        const { data: user } = await db
            .from('users').select('telegram_user_id').eq('user_id', userId).single();

        return res.status(200).json({
            telegramLinked: !!(user && user.telegram_user_id)
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
