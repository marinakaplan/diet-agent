import { put } from '@vercel/blob';
import { readBlob } from '../_utils.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId, inviteCode } = req.body;
        if (!userId || !inviteCode) return res.status(400).json({ error: 'userId and inviteCode required' });

        // Read invite + user in parallel (direct fetch, no SDK list)
        const [invite, user] = await Promise.all([
            readBlob(`invite-${inviteCode}`),
            readBlob(`users/${userId}`)
        ]);

        if (!invite) return res.status(404).json({ error: 'קוד לא נמצא' });

        const group = await readBlob(`groups/${invite.groupId}`);
        if (!group) return res.status(404).json({ error: 'קבוצה לא נמצאה' });

        if (group.members.some(m => m.userId === userId)) {
            return res.status(200).json({ group, message: 'כבר בקבוצה' });
        }

        if (group.members.length >= (group.maxMembers || 20)) {
            return res.status(400).json({ error: 'הקבוצה מלאה' });
        }

        let finalUser = user || {
            userId,
            displayName: 'משתמשת',
            groups: [],
            data: {},
            publicStats: { xp: 0, level: 1, levelName: 'מתחילה', levelEmoji: '🌱', streak: 0 }
        };

        group.members.push({
            userId,
            displayName: finalUser.displayName || 'משתמשת',
            joinedAt: new Date().toISOString(),
            role: 'member'
        });

        finalUser.groups = finalUser.groups || [];
        if (!finalUser.groups.includes(invite.groupId)) {
            finalUser.groups.push(invite.groupId);
        }

        await Promise.all([
            put(`groups/${invite.groupId}.json`, JSON.stringify(group), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            }),
            put(`users/${userId}.json`, JSON.stringify(finalUser), {
                access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
            })
        ]);

        return res.status(200).json({ group });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
