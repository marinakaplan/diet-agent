/* ============================================
   שיפטי - Groups & Social System
   ============================================ */

// ============ User Identity ============
async function ensureUserIdentity() {
    let userId = getData('userId', null);
    let friendCode = getData('friendCode', null);

    if (userId && friendCode) return { userId, friendCode };

    try {
        const profile = getProfile();
        const resp = await fetch('/api/user/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: profile.name || '' })
        });
        const data = await resp.json();
        if (data.userId) {
            setData('userId', data.userId);
            setData('friendCode', data.friendCode);
            return data;
        }
    } catch (e) {
        console.log('Registration failed:', e.message);
    }
    return { userId: null, friendCode: null };
}

function getUserId() {
    return getData('userId', null);
}

function getFriendCode() {
    return getData('friendCode', null);
}

// ============ Compute Public Stats ============
function computePublicStats() {
    const profile = getProfile();
    const xp = getData('game_xp', 0);
    const level = getLevel(xp);
    const info = getLevelInfo(level);
    const streak = getStreak();
    const weights = getData('weights', []);
    let weightLost = 0;
    if (weights.length >= 2) {
        const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
        weightLost = Math.max(0, sorted[0].value - sorted[sorted.length - 1].value);
    }

    return {
        displayName: profile.name || 'ללא שם',
        xp,
        level,
        levelName: info.name,
        levelEmoji: info.emoji,
        streak,
        weightLost: Math.round(weightLost * 10) / 10,
        lastActive: getTodayKey()
    };
}

// ============ Enhanced Cloud Sync ============
async function syncToCloudWithUser() {
    const userId = getUserId();
    if (!userId) {
        // Fallback to old sync
        return syncToCloud();
    }

    try {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('da_')) {
                data[key] = localStorage.getItem(key);
            }
        }

        const publicStats = computePublicStats();

        const response = await fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, data, publicStats })
        });

        if (response.ok) {
            console.log('☁️ סונכרן לענן (משתמש)');
        }
    } catch (err) {
        console.log('⚠️ סנכרון נכשל:', err.message);
        // Fallback to old sync
        syncToCloud();
    }
}

async function loadFromCloudWithUser() {
    const userId = getUserId();
    if (!userId) return loadFromCloud();

    try {
        const response = await fetch(`/api/user/loaduser?userId=${userId}`);
        if (!response.ok) return false;
        const result = await response.json();
        if (!result.data) return false;

        const cloudKeys = Object.keys(result.data);
        const localKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            if (localStorage.key(i).startsWith('da_')) localKeys.push(localStorage.key(i));
        }

        if (cloudKeys.length > 0 && (localKeys.length <= 2 || cloudKeys.length > localKeys.length)) {
            cloudKeys.forEach(key => localStorage.setItem(key, result.data[key]));
            // Restore groups info
            if (result.friendCode) setData('friendCode', result.friendCode);
            console.log('☁️ נתונים נטענו מהענן (משתמש)');
            return true;
        }
        return false;
    } catch {
        return loadFromCloud();
    }
}

// ============ Groups ============
async function createGroup() {
    const userId = getUserId();
    if (!userId) {
        showToast('יש להירשם קודם');
        return null;
    }

    const groupName = prompt('שם הקבוצה:');
    if (!groupName || !groupName.trim()) return null;

    showLoading('יוצרת קבוצה...');
    try {
        const resp = await fetch('/api/group/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, groupName: groupName.trim() })
        });
        const data = await resp.json();
        hideLoading();

        if (data.error) {
            showToast('שגיאה: ' + data.error);
            return null;
        }

        // Save group locally
        const groups = getData('myGroups', []);
        groups.push({ groupId: data.groupId, name: data.name, inviteCode: data.inviteCode });
        setData('myGroups', groups);

        showToast('הקבוצה נוצרה! קוד: ' + data.inviteCode);
        refreshGroupsPage();
        return data;
    } catch (e) {
        hideLoading();
        showToast('שגיאה ביצירת קבוצה');
        return null;
    }
}

async function joinGroup() {
    const userId = getUserId();
    if (!userId) {
        showToast('יש להירשם קודם');
        return;
    }

    const inviteCode = prompt('הכניסי קוד הצטרפות:');
    if (!inviteCode || !inviteCode.trim()) return;

    showLoading('מצטרפת לקבוצה...');
    try {
        const resp = await fetch('/api/group/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, inviteCode: inviteCode.trim() })
        });
        const data = await resp.json();
        hideLoading();

        if (data.error) {
            showToast('שגיאה: ' + data.error);
            return;
        }

        const group = data.group;
        const groups = getData('myGroups', []);
        if (!groups.some(g => g.groupId === group.groupId)) {
            groups.push({ groupId: group.groupId, name: group.name, inviteCode: group.inviteCode });
            setData('myGroups', groups);
        }

        showToast('הצטרפת לקבוצה: ' + group.name);
        refreshGroupsPage();
    } catch (e) {
        hideLoading();
        showToast('שגיאה בהצטרפות');
    }
}

async function loadGroupLeaderboard(groupId) {
    try {
        const resp = await fetch(`/api/group/leaderboard?groupId=${groupId}`);
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

function shareInviteCode(code, groupName) {
    const text = `בואי להצטרף לקבוצה "${groupName}" בשיפטי!\nקוד הצטרפות: ${code}\nhttps://diet-agent.vercel.app`;

    if (navigator.share) {
        navigator.share({ title: 'שיפטי - הזמנה לקבוצה', text }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast('הקוד הועתק!');
        });
    }
}

// ============ Groups Page Render ============
let _activeGroupView = null; // Track which group detail is open
let _groupDataCache = {}; // Cache loaded leaderboard data

function refreshGroupsPage() {
    const container = document.getElementById('groups-content');
    if (!container) return;

    const userId = getUserId();
    const friendCode = getFriendCode();
    const groups = getData('myGroups', []);
    const myStats = computePublicStats();

    let html = '';

    // My Profile Card
    html += `
        <div class="groups-my-profile">
            <div class="groups-my-profile-avatar">${icon('user', 24)}</div>
            <div class="groups-my-profile-info">
                <div class="groups-my-profile-name">${myStats.displayName}</div>
                <div class="groups-my-profile-meta">רמה ${myStats.level} · ${myStats.xp} XP · ${icon('flame', 14)} ${myStats.streak} ימים</div>
            </div>
            ${friendCode ? `
                <div class="groups-my-profile-code" onclick="navigator.clipboard.writeText('${friendCode}'); showToast('הקוד הועתק!');">
                    <span class="groups-code-label">הקוד שלי</span>
                    <span class="groups-code-value">${friendCode}</span>
                </div>
            ` : ''}
        </div>
    `;

    // Action Buttons
    html += `
        <div class="group-actions">
            <button class="group-action-btn group-action-btn--create" onclick="createGroup()">${icon('plus', 16)} צרי קבוצה</button>
            <button class="group-action-btn group-action-btn--join" onclick="joinGroup()">${icon('key', 16)} הצטרפי עם קוד</button>
        </div>
    `;

    // Groups Count
    if (groups.length > 0) {
        html += `<div class="groups-section-title">הקבוצות שלי (${groups.length})</div>`;
    }

    // Groups List
    if (groups.length === 0) {
        html += `
            <div class="groups-empty">
                <div class="groups-empty-icon">${icon('users', 40)}</div>
                <div class="groups-empty-title">עדיין אין קבוצות</div>
                <div class="groups-empty-text">צרי קבוצה חדשה והזמיני חברות,<br>או הצטרפי לקבוצה עם קוד הזמנה</div>
                <div class="groups-empty-steps">
                    <div class="groups-step"><span class="groups-step-num">1</span> צרי קבוצה או קבלי קוד מחברה</div>
                    <div class="groups-step"><span class="groups-step-num">2</span> שתפי את הקוד עם החברות</div>
                    <div class="groups-step"><span class="groups-step-num">3</span> עקבו אחת אחרי השנייה וצברו XP!</div>
                </div>
            </div>
        `;
    } else {
        for (const group of groups) {
            const cached = _groupDataCache[group.groupId];
            const memberCount = cached ? cached.memberCount || cached.rankings.length : '?';
            const isActive = _activeGroupView === group.groupId;

            html += `
                <div class="group-card ${isActive ? 'group-card--active' : ''}" id="group-${group.groupId}">
                    <div class="group-card-header" onclick="openGroupDetail('${group.groupId}')">
                        <div class="group-card-icon">${icon('users', 20)}</div>
                        <div class="group-card-info">
                            <div class="group-card-name">${group.name}</div>
                            <div class="group-card-meta">${memberCount} חברות · קוד: ${group.inviteCode}</div>
                        </div>
                        <div class="group-card-arrow">${isActive ? icon('chevronUp', 16) : icon('chevronDown', 16)}</div>
                    </div>
                    <div class="group-detail-container" id="detail-${group.groupId}" ${isActive ? '' : 'style="display:none"'}>
                        <div class="group-detail-loading" id="loading-${group.groupId}">טוענת נתונים...</div>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;

    // Auto-load active group detail
    if (_activeGroupView) {
        loadGroupDetail(_activeGroupView);
    }
}

async function openGroupDetail(groupId) {
    if (_activeGroupView === groupId) {
        // Close it
        _activeGroupView = null;
        refreshGroupsPage();
        return;
    }

    _activeGroupView = groupId;
    refreshGroupsPage();
    await loadGroupDetail(groupId);
}

async function loadGroupDetail(groupId) {
    const detailContainer = document.getElementById('detail-' + groupId);
    if (!detailContainer) return;

    detailContainer.style.display = 'block';

    // Show loading
    const loadingEl = document.getElementById('loading-' + groupId);
    if (loadingEl) loadingEl.style.display = 'block';

    const data = await loadGroupLeaderboard(groupId);
    if (!data || !data.rankings) {
        detailContainer.innerHTML = '<div class="group-detail-error">לא ניתן לטעון את נתוני הקבוצה</div>';
        return;
    }

    // Cache the data
    _groupDataCache[groupId] = data;
    const group = getData('myGroups', []).find(g => g.groupId === groupId);
    const myUserId = getUserId();

    let html = '';

    // Group Actions Bar
    html += `
        <div class="group-detail-actions">
            <button class="group-detail-action" onclick="event.stopPropagation(); shareInviteCode('${group?.inviteCode || ''}', '${group?.name || ''}')">
                ${icon('share', 14)} הזמיני חברה
            </button>
            <button class="group-detail-action group-detail-action--secondary" onclick="event.stopPropagation(); copyGroupCode('${group?.inviteCode || ''}')">
                ${icon('copy', 14)} העתיקי קוד
            </button>
            <button class="group-detail-action group-detail-action--danger" onclick="event.stopPropagation(); leaveGroup('${groupId}')">
                ${icon('arrowRight', 14)} עזבי
            </button>
        </div>
    `;

    // Leaderboard
    html += `<div class="group-detail-leaderboard">`;
    html += `<div class="group-detail-lb-title">${icon('trophy', 18)} לידרבורד</div>`;

    data.rankings.forEach((r, idx) => {
        const isMe = r.userId === myUserId;
        const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        const rank = idx < 3 ? `<span style="color:${medalColors[idx]};font-weight:700">${idx + 1}</span>` : `${idx + 1}`;
        const isActive = isRecentlyActive(r.lastActive);

        html += `
            <div class="lb-member ${isMe ? 'lb-member--me' : ''}" onclick="event.stopPropagation(); toggleMemberDetail(this)">
                <span class="lb-member-rank">${rank}</span>
                <div class="lb-member-avatar-wrap">
                    <span class="lb-member-avatar">${r.levelEmoji || '🌱'}</span>
                    ${isActive ? '<span class="lb-member-active-dot"></span>' : ''}
                </div>
                <div class="lb-member-main">
                    <div class="lb-member-name">${r.displayName || 'ללא שם'}${isMe ? ' (את)' : ''}</div>
                    <div class="lb-member-level">רמה ${r.level || 1} · ${r.levelName || ''}</div>
                </div>
                <div class="lb-member-xp">${r.xp || 0} XP</div>
                <div class="lb-member-detail-panel">
                    <div class="lb-member-detail-grid">
                        <div class="lb-detail-stat">
                            <span class="lb-detail-stat-value">${icon('flame', 14)} ${r.streak || 0}</span>
                            <span class="lb-detail-stat-label">רצף ימים</span>
                        </div>
                        <div class="lb-detail-stat">
                            <span class="lb-detail-stat-value">${icon('zap', 14)} ${r.xp || 0}</span>
                            <span class="lb-detail-stat-label">XP</span>
                        </div>
                        <div class="lb-detail-stat">
                            <span class="lb-detail-stat-value">${icon('barChart', 14)} ${r.level || 1}</span>
                            <span class="lb-detail-stat-label">רמה</span>
                        </div>
                        ${r.weightLost > 0 ? `
                        <div class="lb-detail-stat">
                            <span class="lb-detail-stat-value">${icon('scale', 14)} ${r.weightLost}</span>
                            <span class="lb-detail-stat-label">ק"ג ירדה</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    html += `
        <div class="group-detail-footer">
            ${data.memberCount || data.rankings.length} חברות בקבוצה · עודכן ${new Date(data.updatedAt).toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'})}
        </div>
    `;
    html += `</div>`;

    // Update member count in header
    const metaEl = document.querySelector(`#group-${groupId} .group-card-meta`);
    if (metaEl) {
        metaEl.textContent = `${data.memberCount || data.rankings.length} חברות · קוד: ${group?.inviteCode || ''}`;
    }

    detailContainer.innerHTML = html;
}

function isRecentlyActive(lastActive) {
    if (!lastActive) return false;
    const today = getTodayKey();
    const yesterday = getTodayKey(-1);
    return lastActive === today || lastActive === yesterday;
}

function toggleMemberDetail(el) {
    el.classList.toggle('lb-member--expanded');
}

function copyGroupCode(code) {
    navigator.clipboard.writeText(code).then(() => showToast('קוד הקבוצה הועתק!'));
}

async function leaveGroup(groupId) {
    if (!confirm('בטוחה שאת רוצה לעזוב את הקבוצה?')) return;

    const groups = getData('myGroups', []);
    const updated = groups.filter(g => g.groupId !== groupId);
    setData('myGroups', updated);

    // Clean up
    if (_activeGroupView === groupId) _activeGroupView = null;
    delete _groupDataCache[groupId];

    showToast('עזבת את הקבוצה');
    refreshGroupsPage();

    // Also remove from server
    const userId = getUserId();
    if (userId) {
        try {
            await fetch('/api/group/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, groupId })
            });
        } catch { /* ignore server errors */ }
    }
}
