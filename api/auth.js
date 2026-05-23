import crypto from 'crypto';
import { getSupabase } from './_supabase.js';

const PEPPER = process.env.AUTH_PEPPER || 'shifti-default-pepper-change-me';

function sha256(value) {
    return crypto.createHash('sha256').update(value + PEPPER).digest('hex');
}

function isValidIsraeliId(id) {
    if (!/^\d{5,9}$/.test(id)) return false;
    const padded = id.padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        let n = parseInt(padded[i], 10) * ((i % 2) + 1);
        if (n > 9) n -= 9;
        sum += n;
    }
    return sum % 10 === 0;
}

function isValidPin(pin) {
    return /^\d{4}$/.test(pin);
}

function generateUserId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'u_' + id;
}

function generateFriendCode() {
    return 'SHFT-' + String(Math.floor(1000 + Math.random() * 9000));
}

function setSessionCookie(res, userId) {
    const oneYear = 60 * 60 * 24 * 365;
    res.setHeader('Set-Cookie', [
        `shifti_uid=${userId}; Path=/; Max-Age=${oneYear}; SameSite=Lax; Secure; HttpOnly`,
        `shifti_authed=1; Path=/; Max-Age=${oneYear}; SameSite=Lax; Secure`,
    ]);
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', [
        `shifti_uid=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`,
        `shifti_authed=; Path=/; Max-Age=0; SameSite=Lax; Secure`,
    ]);
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach(p => {
        const i = p.indexOf('=');
        if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
}

export default async function handler(req, res) {
    const { action } = req.query;
    try {
        if (action === 'login')   return await handleLogin(req, res);
        if (action === 'session') return await handleSession(req, res);
        if (action === 'logout')  return handleLogout(req, res);
        return res.status(400).json({ error: 'Invalid action. Use: login, session, logout' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}

async function handleLogin(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { nationalId, pin, displayName, linkLocalUserId } = req.body || {};

    if (!nationalId || !isValidIsraeliId(String(nationalId))) {
        return res.status(400).json({ error: 'תעודת זהות לא תקינה' });
    }
    if (!pin || !isValidPin(String(pin))) {
        return res.status(400).json({ error: 'קוד PIN חייב להיות 4 ספרות' });
    }

    const idHash  = sha256(String(nationalId).padStart(9, '0'));
    const pinHash = sha256(String(pin));
    const db = getSupabase();

    // 1) Existing account with this ID?
    const { data: existing } = await db
        .from('users')
        .select('user_id, friend_code, pin_hash, display_name')
        .eq('national_id_hash', idHash)
        .maybeSingle();

    if (existing) {
        if (existing.pin_hash !== pinHash) {
            return res.status(401).json({ error: 'קוד PIN שגוי' });
        }
        setSessionCookie(res, existing.user_id);
        return res.status(200).json({
            userId: existing.user_id,
            friendCode: existing.friend_code,
            displayName: existing.display_name,
            isNew: false,
        });
    }

    // 2) Linking an existing local userId (migration from old flow)?
    if (linkLocalUserId) {
        const { data: localUser } = await db
            .from('users')
            .select('user_id, friend_code, display_name, national_id_hash')
            .eq('user_id', linkLocalUserId)
            .maybeSingle();
        if (localUser && !localUser.national_id_hash) {
            const { error: updErr } = await db
                .from('users')
                .update({ national_id_hash: idHash, pin_hash: pinHash, display_name: displayName || localUser.display_name })
                .eq('user_id', linkLocalUserId);
            if (updErr) throw updErr;
            setSessionCookie(res, linkLocalUserId);
            return res.status(200).json({
                userId: linkLocalUserId,
                friendCode: localUser.friend_code,
                displayName: displayName || localUser.display_name,
                isNew: false,
                linked: true,
            });
        }
    }

    // 3) Brand-new user
    const userId = generateUserId();
    const friendCode = generateFriendCode();
    const { error: insErr } = await db.from('users').insert({
        user_id: userId,
        friend_code: friendCode,
        display_name: displayName || '',
        national_id_hash: idHash,
        pin_hash: pinHash,
        profile: {},
        public_stats: { xp: 0, level: 1, levelName: 'מתחילה', levelEmoji: '🌱', streak: 0, weightLost: 0, lastActive: null },
        created_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;

    await db.from('friend_codes').insert({ friend_code: friendCode, user_id: userId });
    await db.from('gamification').insert({ user_id: userId, xp: 0, streak: 0, achievements: [], xp_log: [] });

    setSessionCookie(res, userId);
    return res.status(200).json({ userId, friendCode, displayName: displayName || '', isNew: true });
}

async function handleSession(req, res) {
    const cookies = parseCookies(req);
    const uid = cookies.shifti_uid;
    if (!uid) return res.status(200).json({ authenticated: false });

    const db = getSupabase();
    const { data: user } = await db
        .from('users')
        .select('user_id, friend_code, display_name')
        .eq('user_id', uid)
        .maybeSingle();

    if (!user) {
        clearSessionCookie(res);
        return res.status(200).json({ authenticated: false });
    }
    return res.status(200).json({
        authenticated: true,
        userId: user.user_id,
        friendCode: user.friend_code,
        displayName: user.display_name,
    });
}

function handleLogout(req, res) {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
}
