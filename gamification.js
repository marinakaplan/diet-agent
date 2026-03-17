/* ============================================
   DietAgent - Gamification Engine
   RTL Hebrew Diet Tracking App
   ============================================ */

// ============ XP & Levels ============

const XP_REWARDS = {
    log_meal: 10,
    calorie_target: 25,
    weigh_in: 15,
    add_measurements: 10,
    add_blood_test: 20,
    water_complete: 15,
    achievement_unlock: 50
};

const LEVELS = [
    { level: 1,  name: 'מתחילה',         emoji: '🌱', xpRequired: 0 },
    { level: 2,  name: 'מתעוררת',        emoji: '🌿', xpRequired: 100 },
    { level: 3,  name: 'צומחת',          emoji: '🌻', xpRequired: 300 },
    { level: 4,  name: 'מתקדמת',         emoji: '⭐', xpRequired: 600 },
    { level: 5,  name: 'מנצנצת',         emoji: '💫', xpRequired: 1000 },
    { level: 6,  name: 'בוערת',          emoji: '🔥', xpRequired: 1500 },
    { level: 7,  name: 'יהלום',          emoji: '💎', xpRequired: 2200 },
    { level: 8,  name: 'מלכת הבריאות',   emoji: '👑', xpRequired: 3000 },
    { level: 9,  name: 'גיבורת-על',      emoji: '🦸‍♀️', xpRequired: 4000 },
    { level: 10, name: 'אלופת העולם',    emoji: '🏆', xpRequired: 5500 }
];

function getGameStats() {
    const xp = getData('game_xp', 0);
    const level = getLevel(xp);
    const info = getLevelInfo(level);
    const streak = getStreak();
    const waterToday = getWaterToday();
    const achievements = getUnlockedAchievements();

    return {
        xp,
        level,
        levelName: info.name,
        levelEmoji: info.emoji,
        nextLevelXP: info.nextXP,
        streak,
        waterToday,
        achievements
    };
}

function addXP(amount, reason) {
    const oldXP = getData('game_xp', 0);
    const oldLevel = getLevel(oldXP);
    const newXP = oldXP + amount;
    setData('game_xp', newXP);

    // Log XP event
    const xpLog = getData('game_xp_log', []);
    xpLog.push({ amount, reason, date: new Date().toISOString() });
    // Keep last 100 entries
    if (xpLog.length > 100) xpLog.splice(0, xpLog.length - 100);
    setData('game_xp_log', xpLog);

    const newLevel = getLevel(newXP);
    const leveledUp = newLevel > oldLevel;

    if (leveledUp) {
        const info = getLevelInfo(newLevel);
        showLevelUpAnimation(newLevel, info.name, info.emoji);
    }

    return { newXP, leveledUp, newLevel };
}

function getLevel(xp) {
    let level = 1;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (xp >= LEVELS[i].xpRequired) {
            level = LEVELS[i].level;
            break;
        }
    }
    return level;
}

function getLevelInfo(level) {
    const idx = Math.max(0, Math.min(level - 1, LEVELS.length - 1));
    const current = LEVELS[idx];
    const next = idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;

    return {
        name: current.name,
        emoji: current.emoji,
        xpRequired: current.xpRequired,
        nextXP: next ? next.xpRequired : null
    };
}

function getLevelProgress() {
    const xp = getData('game_xp', 0);
    const level = getLevel(xp);
    const info = getLevelInfo(level);

    if (info.nextXP === null) return 1; // Max level

    const currentLevelXP = info.xpRequired;
    const nextLevelXP = info.nextXP;
    const range = nextLevelXP - currentLevelXP;
    if (range <= 0) return 1;

    return Math.min(1, Math.max(0, (xp - currentLevelXP) / range));
}

// ============ Streak System ============

function checkAndUpdateStreak() {
    const streak = getData('game_streak', { count: 0, lastActiveDate: null });
    const today = getTodayKey();
    const yesterday = getTodayKey(-1);

    if (streak.lastActiveDate === today) {
        // Already active today, nothing to do
        return streak.count;
    }

    if (streak.lastActiveDate === yesterday) {
        // Streak continues, but don't increment until markTodayActive
        return streak.count;
    }

    // Streak broken (or first time)
    if (streak.lastActiveDate && streak.lastActiveDate !== yesterday && streak.lastActiveDate !== today) {
        streak.count = 0;
        setData('game_streak', streak);
    }

    return streak.count;
}

function getStreak() {
    const streak = getData('game_streak', { count: 0, lastActiveDate: null });
    const today = getTodayKey();
    const yesterday = getTodayKey(-1);

    // If last active was before yesterday, streak is broken
    if (streak.lastActiveDate && streak.lastActiveDate !== today && streak.lastActiveDate !== yesterday) {
        return 0;
    }
    return streak.count;
}

function markTodayActive() {
    const streak = getData('game_streak', { count: 0, lastActiveDate: null });
    const today = getTodayKey();

    if (streak.lastActiveDate === today) {
        return streak.count; // Already marked today
    }

    const yesterday = getTodayKey(-1);

    if (streak.lastActiveDate === yesterday) {
        streak.count += 1;
    } else if (!streak.lastActiveDate) {
        streak.count = 1;
    } else {
        // Streak broken
        streak.count = 1;
    }

    streak.lastActiveDate = today;
    setData('game_streak', streak);

    // Daily streak XP bonus (capped at 50)
    const streakBonus = Math.min(5 * streak.count, 50);
    addXP(streakBonus, 'streak_bonus');

    return streak.count;
}

// ============ Water Tracking ============

function addWaterCup() {
    const today = getTodayKey();
    const key = 'water_' + today;
    let cups = getData(key, 0);

    if (cups >= 12) {
        showToast('הגעת למקסימום 12 כוסות היום!');
        return cups;
    }

    cups += 1;
    setData(key, cups);

    if (cups === 8) {
        addXP(XP_REWARDS.water_complete, 'water_complete');
        showToast('שתית 8 כוסות מים! +15 XP');
        checkAchievements();
        // Share water milestone to groups
        postGroupActivity('water', { cups });
    } else {
        showToast(`כוס ${cups}/8`);
        // Share every 4th cup to groups (not spam every cup)
        if (cups % 4 === 0) {
            postGroupActivity('water', { cups });
        }
    }

    return cups;
}

function getWaterToday() {
    const today = getTodayKey();
    return getData('water_' + today, 0);
}

function getWaterTarget() {
    return 8;
}

// ============ Achievements System ============

const ACHIEVEMENTS = [
    {
        id: 'first_meal',
        name: 'ביצה טריה',
        emoji: '🥚',
        description: 'תיעדת ארוחה ראשונה',
        check: function() {
            // Check if any meals exist across any day
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('da_meals_')) {
                    const meals = JSON.parse(localStorage.getItem(key));
                    if (meals && meals.length > 0) return true;
                }
            }
            return false;
        }
    },
    {
        id: 'three_day_streak',
        name: 'שלושה ברצף',
        emoji: '🔥',
        description: '3 ימים רצופים של מעקב',
        check: function() {
            return getStreak() >= 3;
        }
    },
    {
        id: 'week_streak',
        name: 'שבוע על אש',
        emoji: '🔥',
        description: '7 ימים רצופים',
        check: function() {
            return getStreak() >= 7;
        }
    },
    {
        id: 'month_streak',
        name: 'חודש של מחויבות',
        emoji: '💪',
        description: '30 ימים רצופים',
        check: function() {
            return getStreak() >= 30;
        }
    },
    {
        id: 'first_weigh',
        name: 'שקילה ראשונה',
        emoji: '⚖️',
        description: 'שקלת את עצמך בפעם הראשונה',
        check: function() {
            const weights = getData('weights', []);
            return weights.length > 0;
        }
    },
    {
        id: 'first_kg_lost',
        name: 'קילו ראשון',
        emoji: '📉',
        description: 'ירדת קילו ראשון',
        check: function() {
            const weights = getData('weights', []);
            if (weights.length < 2) return false;
            const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
            const first = sorted[0].value;
            const latest = sorted[sorted.length - 1].value;
            return (first - latest) >= 1;
        }
    },
    {
        id: 'five_kg_lost',
        name: '5 קילו!',
        emoji: '🎉',
        description: 'ירדת 5 קילו',
        check: function() {
            const weights = getData('weights', []);
            if (weights.length < 2) return false;
            const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
            const first = sorted[0].value;
            const latest = sorted[sorted.length - 1].value;
            return (first - latest) >= 5;
        }
    },
    {
        id: 'ten_kg_lost',
        name: '10 קילו!',
        emoji: '🏅',
        description: 'ירדת 10 קילו',
        check: function() {
            const weights = getData('weights', []);
            if (weights.length < 2) return false;
            const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
            const first = sorted[0].value;
            const latest = sorted[sorted.length - 1].value;
            return (first - latest) >= 10;
        }
    },
    {
        id: 'first_blood_test',
        name: 'בדיקה ראשונה',
        emoji: '🩸',
        description: 'הוספת בדיקת דם',
        check: function() {
            const tests = getData('bloodTests', []);
            return tests.length > 0;
        }
    },
    {
        id: 'hydration_master',
        name: 'מלכת המים',
        emoji: '💧',
        description: 'שתית 8 כוסות ביום',
        check: function() {
            return getWaterToday() >= 8;
        }
    },
    {
        id: 'perfect_day',
        name: 'יום מושלם',
        emoji: '🎯',
        description: 'עמדת ביעד הקלוריות',
        check: function() {
            const today = getTodayKey();
            const meals = getData('meals_' + today, []);
            if (meals.length === 0) return false;
            const profile = getData('profile', {});
            const target = profile.targetCalories || 1500;
            const total = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
            const ratio = total / target;
            return ratio >= 0.85 && ratio <= 1.05;
        }
    },
    {
        id: 'week_logging',
        name: 'שבוע מעקב',
        emoji: '📊',
        description: 'תיעדת ארוחות 7 ימים',
        check: function() {
            let daysWithMeals = 0;
            for (let i = 0; i < 30; i++) {
                const day = getTodayKey(-i);
                const meals = getData('meals_' + day, []);
                if (meals.length > 0) daysWithMeals++;
            }
            return daysWithMeals >= 7;
        }
    },
    {
        id: 'protein_queen',
        name: 'מלכת החלבון',
        emoji: '💪',
        description: 'עמדת ביעד החלבון 5 ימים',
        check: function() {
            const profile = getData('profile', {});
            const proteinTarget = profile.targetProtein || 60;
            let daysHit = 0;
            for (let i = 0; i < 14; i++) {
                const day = getTodayKey(-i);
                const meals = getData('meals_' + day, []);
                const totalProtein = meals.reduce((sum, m) => sum + (m.protein || 0), 0);
                if (meals.length > 0 && totalProtein >= proteinTarget) daysHit++;
            }
            return daysHit >= 5;
        }
    },
    {
        id: 'early_bird',
        name: 'מקדימה',
        emoji: '🌅',
        description: 'תיעדת ארוחת בוקר 5 ימים',
        check: function() {
            let breakfastDays = 0;
            for (let i = 0; i < 14; i++) {
                const day = getTodayKey(-i);
                const meals = getData('meals_' + day, []);
                const hasBreakfast = meals.some(m => m.mealType === 'breakfast');
                if (hasBreakfast) breakfastDays++;
            }
            return breakfastDays >= 5;
        }
    },
    {
        id: 'chat_fan',
        name: 'חברה של AI',
        emoji: '💬',
        description: 'דיברת עם הדיאטנית 10 פעמים',
        check: function() {
            const chatCount = getData('game_chat_count', 0);
            return chatCount >= 10;
        }
    },
    // Social achievements
    {
        id: 'social_first_group',
        name: 'חברותית',
        emoji: '👯',
        description: 'הצטרפת או יצרת קבוצה ראשונה',
        check: function() {
            const groups = getData('myGroups', []);
            return groups.length >= 1;
        }
    },
    {
        id: 'social_group_creator',
        name: 'מנהיגה',
        emoji: '👑',
        description: 'יצרת קבוצה והזמנת חברות',
        check: function() {
            const groups = getData('myGroups', []);
            return groups.length >= 1;
        }
    },
    {
        id: 'social_two_groups',
        name: 'רב-קבוצתית',
        emoji: '🌐',
        description: 'חברה ב-2 קבוצות לפחות',
        check: function() {
            const groups = getData('myGroups', []);
            return groups.length >= 2;
        }
    },
    {
        id: 'social_streak_share',
        name: 'מלכת הרצף',
        emoji: '🔗',
        description: 'רצף של 7 ימים בזמן שאת בקבוצה',
        check: function() {
            const groups = getData('myGroups', []);
            return groups.length >= 1 && getStreak() >= 7;
        }
    },
    {
        id: 'social_water_champ',
        name: 'שתיינית חברתית',
        emoji: '🏊',
        description: 'השלמת יעד מים כשאת בקבוצה',
        check: function() {
            const groups = getData('myGroups', []);
            return groups.length >= 1 && getWaterToday() >= 8;
        }
    }
];

function checkAchievements() {
    const unlocked = getData('game_achievements', []);
    const newlyUnlocked = [];

    for (const achievement of ACHIEVEMENTS) {
        if (unlocked.includes(achievement.id)) continue;

        try {
            if (achievement.check()) {
                unlocked.push(achievement.id);
                newlyUnlocked.push(achievement);
                addXP(XP_REWARDS.achievement_unlock, 'achievement_' + achievement.id);
                showAchievementUnlocked(achievement);
            }
        } catch (e) {
            console.warn('שגיאה בבדיקת הישג:', achievement.id, e);
        }
    }

    if (newlyUnlocked.length > 0) {
        setData('game_achievements', unlocked);
    }

    return newlyUnlocked;
}

function getUnlockedAchievements() {
    const unlockedIds = getData('game_achievements', []);
    return ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id));
}

function getAllAchievements() {
    const unlockedIds = getData('game_achievements', []);
    return ACHIEVEMENTS.map(a => ({
        ...a,
        unlocked: unlockedIds.includes(a.id),
        check: undefined // Don't expose check function
    }));
}

// ============ Daily Challenges ============

function getDailyChallenges() {
    const today = getTodayKey();
    const cached = getData('game_challenges_' + today, null);
    if (cached) {
        // Recalculate current progress for cached challenges
        return cached.map(c => _updateChallengeProgress(c));
    }

    const allChallenges = _generateChallengePool();

    // Pick 3 based on a simple seed from the date
    const seed = today.split('-').join('');
    const shuffled = allChallenges.sort((a, b) => {
        const ha = _simpleHash(seed + a.id);
        const hb = _simpleHash(seed + b.id);
        return ha - hb;
    });

    const selected = shuffled.slice(0, 3).map(c => _updateChallengeProgress(c));
    setData('game_challenges_' + today, selected);
    return selected;
}

function _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit int
    }
    return Math.abs(hash);
}

function _generateChallengePool() {
    return [
        {
            id: 'water_8',
            text: 'שתי 8 כוסות מים',
            emoji: '💧',
            target: 8,
            current: 0,
            completed: false,
            _getCurrent: function() { return getWaterToday(); }
        },
        {
            id: 'log_3_meals',
            text: 'תעדי 3 ארוחות היום',
            emoji: '🍽️',
            target: 3,
            current: 0,
            completed: false,
            _getCurrent: function() {
                const meals = getData('meals_' + getTodayKey(), []);
                return meals.length;
            }
        },
        {
            id: 'calorie_target',
            text: 'עמדי ביעד הקלוריות',
            emoji: '🎯',
            target: 1,
            current: 0,
            completed: false,
            _getCurrent: function() {
                const meals = getData('meals_' + getTodayKey(), []);
                if (meals.length === 0) return 0;
                const profile = getData('profile', {});
                const target = profile.targetCalories || 1500;
                const total = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
                const ratio = total / target;
                return (ratio >= 0.85 && ratio <= 1.05) ? 1 : 0;
            }
        },
        {
            id: 'weigh_in',
            text: 'הוסיפי שקילה היום',
            emoji: '⚖️',
            target: 1,
            current: 0,
            completed: false,
            _getCurrent: function() {
                const weights = getData('weights', []);
                const today = getTodayKey();
                return weights.some(w => w.date === today) ? 1 : 0;
            }
        },
        {
            id: 'chat_ai',
            text: 'דברי עם הדיאטנית AI',
            emoji: '🤖',
            target: 1,
            current: 0,
            completed: false,
            _getCurrent: function() {
                const todayChats = getData('game_today_chat_' + getTodayKey(), 0);
                return todayChats >= 1 ? 1 : 0;
            }
        },
        {
            id: 'protein_60',
            text: 'אכלי לפחות 60 גרם חלבון',
            emoji: '💪',
            target: 60,
            current: 0,
            completed: false,
            _getCurrent: function() {
                const meals = getData('meals_' + getTodayKey(), []);
                return meals.reduce((sum, m) => sum + (m.protein || 0), 0);
            }
        }
    ];
}

function _updateChallengeProgress(challenge) {
    // Recreate the getCurrent function from the pool
    const pool = _generateChallengePool();
    const template = pool.find(c => c.id === challenge.id);

    let current = challenge.current;
    if (template && template._getCurrent) {
        current = template._getCurrent();
    }

    return {
        id: challenge.id,
        text: challenge.text,
        emoji: challenge.emoji,
        target: challenge.target,
        current: current,
        completed: current >= challenge.target
    };
}

// ============ Confetti Animation ============

function launchConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';

    const colors = ['#2EAADC', '#6940A5', '#CB912F', '#EB5757', '#4DAB9A', '#529CCA'];

    for (let i = 0; i < 50; i++) {
        const piece = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 1.5 + Math.random() * 1.5;
        const size = 6 + Math.random() * 6;
        const rotation = Math.random() * 360;

        piece.style.cssText = `
            position: absolute;
            top: -10px;
            left: ${left}%;
            width: ${size}px;
            height: ${size * 0.6}px;
            background: ${color};
            border-radius: 2px;
            animation: confettiFall ${duration}s ease-out ${delay}s forwards;
            transform: rotate(${rotation}deg);
        `;
        container.appendChild(piece);
    }

    // Inject keyframes if not already present
    if (!document.getElementById('confetti-keyframes')) {
        const style = document.createElement('style');
        style.id = 'confetti-keyframes';
        style.textContent = `
            @keyframes confettiFall {
                0% {
                    transform: translateY(0) rotate(0deg) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translateY(100vh) rotate(720deg) scale(0.5);
                    opacity: 0;
                }
            }
            @keyframes levelUpPulse {
                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                50% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
                70% { transform: translate(-50%, -50%) scale(0.97); }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            @keyframes achievementSlide {
                0% { transform: translateY(-20px); opacity: 0; }
                12% { transform: translateY(0); opacity: 1; }
                85% { transform: translateY(0); opacity: 1; }
                100% { transform: translateY(-20px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(container);

    setTimeout(() => {
        container.remove();
    }, 3500);
}

function showLevelUpAnimation(level, name, emoji) {
    launchConfetti();

    const overlay = document.createElement('div');
    overlay.className = 'level-up-overlay';

    const card = document.createElement('div');
    card.className = 'level-up-card';

    card.innerHTML = `
        <div class="level-up-emoji">${icon('star', 48)}</div>
        <div class="level-up-subtitle">עלית רמה!</div>
        <div class="level-up-number">רמה ${level}</div>
        <div class="level-up-name">${name}</div>
        <div class="level-up-xp">+50 XP</div>
    `;

    overlay.appendChild(card);
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.remove();
    }, 4000);
}

function showAchievementUnlocked(achievement) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';

    toast.innerHTML = `
        <div class="achievement-toast-emoji">${achievement.emoji}</div>
        <div>
            <div class="achievement-toast-label">הישג חדש!</div>
            <div class="achievement-toast-name">${achievement.name}</div>
            <div class="achievement-toast-desc">${achievement.description}</div>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3800);
}

// ============ Render Functions ============

function renderGameHeader() {
    const stats = getGameStats();
    const progress = getLevelProgress();
    const progressPercent = Math.round(progress * 100);
    const info = getLevelInfo(stats.level);

    const xpText = info.nextXP !== null
        ? `${stats.xp} / ${info.nextXP} XP`
        : `${stats.xp} XP (מקסימום!)`;

    return `
        <div class="game-header">
            <div class="game-header-top">
                <div class="game-header-level">
                    <span class="game-header-emoji">${icon('star')}</span>
                    <div>
                        <div class="game-header-level-label">רמה ${stats.level}</div>
                        <div class="game-header-level-name">${stats.levelName}</div>
                    </div>
                </div>
                <div class="game-header-streak" title="רצף ימים">
                    ${stats.streak > 0 ? icon('flame', 16) : icon('target', 16)}
                    <span class="game-header-streak-count">${stats.streak}</span>
                </div>
            </div>
            <div class="game-header-progress-track">
                <div class="game-header-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <div class="game-header-xp-text">${xpText}</div>
        </div>
    `;
}

function renderWaterTracker() {
    const cups = getWaterToday();
    const target = getWaterTarget();

    let cupsHTML = '';
    for (let i = 1; i <= target; i++) {
        const filled = i <= cups;
        const dropClass = filled ? 'water-drop water-drop--filled' : 'water-drop water-drop--empty';
        cupsHTML += `<span class="${dropClass}">${icon('droplet', 16)}</span>`;
    }

    return `
        <div class="water-tracker-card">
            <div class="water-tracker-header">
                <div class="water-tracker-title">${icon('droplet', 18)} מעקב מים</div>
                <div class="water-tracker-count">${cups}/${target} כוסות</div>
            </div>
            <div class="water-drops-container">
                ${cupsHTML}
            </div>
            <button class="water-add-btn" onclick="addWaterCup(); _refreshWaterUI();">
                + הוסיפי כוס מים
            </button>
        </div>
    `;
}

function _refreshWaterUI() {
    const waterEl = document.querySelector('.water-tracker-card');
    if (waterEl) {
        const parent = waterEl.parentElement;
        const newHTML = renderWaterTracker();
        const temp = document.createElement('div');
        temp.innerHTML = newHTML;
        parent.replaceChild(temp.firstElementChild, waterEl);
    }
}

function renderDailyChallenges() {
    const challenges = getDailyChallenges();

    const challengeEmojiMap = {
        '💧': 'droplet',
        '🍽️': 'utensils',
        '🎯': 'target',
        '⚖️': 'scale',
        '🤖': 'messageCircle',
        '💪': 'zap'
    };

    let challengesHTML = '';
    for (const c of challenges) {
        const progressPercent = Math.min(100, Math.round((c.current / c.target) * 100));
        const statusIcon = c.completed ? icon('check', 16) : '<span class="challenge-status-empty"></span>';
        const challengeIcon = challengeEmojiMap[c.emoji] ? icon(challengeEmojiMap[c.emoji], 16) : c.emoji;
        const itemClass = c.completed ? 'challenge-item challenge-item--completed' : 'challenge-item';
        const textClass = c.completed ? 'challenge-text challenge-text--completed' : 'challenge-text';
        const fillClass = c.completed ? 'challenge-progress-fill challenge-progress-fill--done' : 'challenge-progress-fill challenge-progress-fill--active';

        challengesHTML += `
            <div class="${itemClass}">
                <span class="challenge-status">${statusIcon}</span>
                <div class="challenge-content">
                    <div class="${textClass}">
                        ${challengeIcon} ${c.text}
                    </div>
                    <div class="challenge-progress-track">
                        <div class="${fillClass}" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
                <span class="challenge-counter">
                    ${c.current}/${c.target}
                </span>
            </div>
        `;
    }

    return `
        <div class="challenges-card">
            <div class="challenges-title">${icon('target', 18)} אתגרים יומיים</div>
            ${challengesHTML}
        </div>
    `;
}

function renderAchievementsGrid() {
    const all = getAllAchievements();

    let gridHTML = '';
    for (const a of all) {
        const locked = !a.unlocked;
        const itemClass = locked ? 'achievement-item achievement-item--locked' : 'achievement-item achievement-item--unlocked';

        gridHTML += `
            <div class="${itemClass}"
                 onclick="this.querySelector('.achievement-desc').classList.toggle('achievement-desc--visible')">
                <span class="achievement-emoji">${a.emoji}</span>
                <div class="achievement-name">${a.name}</div>
                <div class="achievement-desc">${a.description}</div>
            </div>
        `;
    }

    return `
        <div class="achievements-card">
            <div class="achievements-title">${icon('trophy', 18)} הישגים</div>
            <div class="achievements-grid">
                ${gridHTML}
            </div>
        </div>
    `;
}
