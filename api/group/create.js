import { put } from '@vercel/blob';
import { readBlob } from '../_utils.js';

function generateGroupId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'g_' + id;
}

function generateInviteCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, groupName } = req.body;
        if (!userId || !groupName) return res.status(400).json({ error: 'userId and groupName required' });

        let user = await readBlob(`users/${userId}`);
        if (!user) {
            user = {
                userId,
                displayName: groupName.split(' ')[0] || 'משתמשת',
                groups: [],
                data: {},
                publicStats: {}
            };
        }

        const groupId = generateGroupId();
        const inviteCode = generateInviteCode();

        const group = {
            groupId,
            name: groupName,
            inviteCode,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            members: [{ userId, displayName: user.displayName || 'ללא שם', joinedAt: new Date().toISOString(), role: 'admin' }],
            maxMembers: 20
        };

        user.groups = user.groups || [];
        user.groups.push(groupId);

        // Save everything in parallel
        await Promise.all([
            put(`groups/${groupId}.json`, JSON.stringify(group), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            }),
            put(`invite-${inviteCode}.json`, JSON.stringify({ groupId, inviteCode }), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            }),
            put(`users/${userId}.json`, JSON.stringify(user), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            })
        ]);

        return res.status(200).json({ groupId, inviteCode, name: groupName });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
