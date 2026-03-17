/* ============================================
   DietAgent - Core Application Logic
   ============================================ */

// ============ State ============
let currentPage = 'home';
let foodDayOffset = 0;
let currentMealType = 'breakfast';
let lastAnalysis = null;
let weightChart = null;
let bloodChart = null;

// ============ Data Helpers ============
let _syncTimer = null;

function getData(key, fallback = null) {
    try {
        const val = localStorage.getItem('da_' + key);
        return val ? JSON.parse(val) : fallback;
    } catch { return fallback; }
}

function setData(key, value) {
    localStorage.setItem('da_' + key, JSON.stringify(value));
    // Debounced cloud sync - saves after 2 seconds of inactivity
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
        if (typeof syncToCloudWithUser === 'function' && getUserId()) {
            syncToCloudWithUser();
        } else {
            syncToCloud();
        }
    }, 2000);
}

// ============ Cloud Sync ============
async function syncToCloud() {
    try {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('da_')) {
                data[key] = localStorage.getItem(key);
            }
        }
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data })
        });
        if (response.ok) {
            console.log('☁️ נתונים סונכרנו לענן');
        }
    } catch (err) {
        console.log('⚠️ סנכרון נכשל (עובד אוף-ליין):', err.message);
    }
}

async function loadFromCloud() {
    try {
        const response = await fetch('/api/load');
        if (!response.ok) return false;
        const { data } = await response.json();
        if (!data) return false;

        // Check if cloud has newer/more data than local
        const localKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('da_')) localKeys.push(key);
        }

        const cloudKeys = Object.keys(data);
        if (cloudKeys.length > 0 && (localKeys.length === 0 || cloudKeys.length > localKeys.length)) {
            // Load cloud data into localStorage
            cloudKeys.forEach(key => {
                localStorage.setItem(key, data[key]);
            });
            console.log('☁️ נתונים נטענו מהענן');
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function getProfile() {
    return getData('profile', {
        name: '', age: '', height: '', gender: '',
        activityLevel: 'light',
        targetWeight: '', targetCalories: '',
        targetProtein: '', targetCarbs: '', targetFat: '', targetFiber: '',
        apiKey: ''
    });
}

function getTodayKey(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ============ Navigation ============
function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    const titles = { home: 'שיפטי', food: 'מעקב אוכל', groups: 'חברות', metrics: 'מדדים', chat: 'הדיאטנית שלי', profile: 'פרופיל' };
    document.getElementById('page-title').textContent = titles[page];

    // Hide FAB on non-home pages
    const fab = document.querySelector('.fab');
    if (fab) fab.style.display = page === 'home' ? 'flex' : 'none';

    // Refresh page data
    if (page === 'home') refreshDashboard();
    if (page === 'food') { refreshFoodLog(); refreshFoodGallery(); }
    if (page === 'groups') refreshGroupsPage();
    if (page === 'metrics') refreshMetrics();
    if (page === 'profile') loadProfile();
}

// ============ Dashboard ============
function refreshDashboard() {
    // Greeting
    const hour = new Date().getHours();
    const profile = getProfile();
    const name = profile.name || '';
    let greeting = 'בוקר טוב';
    if (hour >= 12 && hour < 17) greeting = 'צהריים טובים';
    else if (hour >= 17 && hour < 21) greeting = 'ערב טוב';
    else if (hour >= 21 || hour < 5) greeting = 'לילה טוב';
    document.getElementById('greeting-text').textContent = `${greeting}${name ? ', ' + name : ''}`;

    // Date
    const today = new Date();
    document.getElementById('date-display').textContent = today.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Daily totals
    const meals = getData('meals_' + getTodayKey(), []);
    const totals = meals.reduce((acc, m) => {
        acc.calories += m.calories || 0;
        acc.protein += m.protein || 0;
        acc.carbs += m.carbs || 0;
        acc.fat += m.fat || 0;
        return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    document.getElementById('cal-value').textContent = Math.round(totals.calories);
    document.getElementById('protein-value').textContent = Math.round(totals.protein);
    document.getElementById('carbs-value').textContent = Math.round(totals.carbs);
    document.getElementById('fat-value').textContent = Math.round(totals.fat);

    // Update rings
    const targets = {
        calories: profile.targetCalories || 1500,
        protein: profile.targetProtein || 80,
        carbs: profile.targetCarbs || 150,
        fat: profile.targetFat || 50
    };
    updateRing('calories', totals.calories, targets.calories);
    updateRing('protein', totals.protein, targets.protein);
    updateRing('carbs', totals.carbs, targets.carbs);
    updateRing('fat', totals.fat, targets.fat);

    // Weight
    const weights = getData('weights', []);
    if (weights.length > 0) {
        const latest = weights[weights.length - 1];
        document.getElementById('current-weight').textContent = latest.value;
        if (weights.length >= 2) {
            const prev = weights[weights.length - 2];
            const diff = (latest.value - prev.value).toFixed(1);
            const el = document.getElementById('weight-trend');
            if (diff < 0) { el.textContent = `${diff} ↓`; el.className = 'weight-trend down'; }
            else if (diff > 0) { el.textContent = `+${diff} ↑`; el.className = 'weight-trend up'; }
            else { el.textContent = 'ללא שינוי'; el.className = 'weight-trend same'; }
        }
    }

    const targetW = profile.targetWeight;
    if (targetW) {
        document.getElementById('weight-target-display').textContent = `יעד: ${targetW} ק״ג`;
    }

    // Render gamification elements
    renderGameWidgets();
}

function renderGameWidgets() {
    const gameHeader = document.getElementById('game-header-container');
    if (gameHeader) gameHeader.innerHTML = renderGameHeader();

    const waterTracker = document.getElementById('water-tracker-container');
    if (waterTracker) waterTracker.innerHTML = renderWaterTracker();

    const challenges = document.getElementById('daily-challenges-container');
    if (challenges) challenges.innerHTML = renderDailyChallenges();

    const achievements = document.getElementById('achievements-container');
    if (achievements) achievements.innerHTML = renderAchievementsGrid();
}

function updateRing(type, current, target) {
    const pct = Math.min(current / target, 1);
    const circumference = 2 * Math.PI * 42; // r=42
    const offset = circumference * (1 - pct);
    const ring = document.querySelector(`.${type}-ring`);
    if (ring) ring.style.strokeDashoffset = offset;
}

// ============ Food Log ============
function selectMealType(btn) {
    document.querySelectorAll('.meal-type').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMealType = btn.dataset.meal;
}

// ============ Food Photo Handling ============
let currentFoodPhoto = null; // base64 string of current photo

function handleFoodPhoto(input) {
    const file = input.files[0];
    if (!file) return;

    // Compress and convert to base64
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Resize to max 800px for efficient API calls
            const canvas = document.createElement('canvas');
            const maxSize = 800;
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            currentFoodPhoto = base64.split(',')[1]; // Remove data:image/jpeg;base64, prefix

            // Show preview
            document.getElementById('photo-preview').src = base64;
            document.getElementById('photo-preview-container').classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = ''; // Reset so same file can be selected again
}

function removePhotoPreview() {
    currentFoodPhoto = null;
    document.getElementById('photo-preview-container').classList.add('hidden');
    document.getElementById('photo-preview').src = '';
}

async function analyzeFood() {
    const input = document.getElementById('food-input').value.trim();
    if (!input && !currentFoodPhoto) {
        showToast('תארי מה אכלת או צלמי תמונה');
        return;
    }

    const profile = getProfile();
    if (!profile.apiKey) {
        showToast('הגדירי API Key בפרופיל כדי להשתמש ב-AI');
        return;
    }

    const loadingText = currentFoodPhoto ? 'מנתחת את התמונה...' : 'מנתחת את הארוחה...';
    showLoading(loadingText);
    try {
        const result = await analyzeFoodWithAI(input, profile, currentFoodPhoto);
        const description = result.detected_food || input || 'ארוחה מצולמת';
        lastAnalysis = {
            ...result,
            description,
            mealType: currentMealType,
            photo: currentFoodPhoto ? `data:image/jpeg;base64,${currentFoodPhoto}` : null
        };
        displayAnalysis(result);
    } catch (err) {
        showToast('שגיאה בניתוח: ' + err.message);
    }
    hideLoading();
}

function displayAnalysis(data) {
    // Show photo in analysis if exists
    const photoPreview = document.getElementById('analysis-photo-preview');
    const photoImg = document.getElementById('analysis-photo-img');
    if (currentFoodPhoto) {
        photoImg.src = `data:image/jpeg;base64,${currentFoodPhoto}`;
        photoPreview.classList.remove('hidden');
    } else {
        photoPreview.classList.add('hidden');
    }

    // Show detected food
    const detectedEl = document.getElementById('analysis-detected');
    if (data.detected_food) {
        detectedEl.textContent = data.detected_food;
        detectedEl.classList.remove('hidden');
    } else {
        detectedEl.classList.add('hidden');
    }

    const grid = document.getElementById('analysis-grid');
    grid.innerHTML = `
        <div class="analysis-item cal"><span class="label">קלוריות</span><span class="value">${data.calories}</span></div>
        <div class="analysis-item protein"><span class="label">חלבון</span><span class="value">${data.protein}g</span></div>
        <div class="analysis-item carbs"><span class="label">פחמימות</span><span class="value">${data.carbs}g</span></div>
        <div class="analysis-item fat"><span class="label">שומן</span><span class="value">${data.fat}g</span></div>
    `;
    document.getElementById('analysis-notes').textContent = data.notes || '';
    document.getElementById('food-analysis-result').classList.remove('hidden');
}

// ============ Share Meal ============
function shareMealAnalysis() {
    if (!lastAnalysis) return;
    const m = lastAnalysis;
    const text = `${m.description}\n${m.calories} קק"ל | ח: ${m.protein}g | פ: ${m.carbs}g | ש: ${m.fat}g\n${m.notes ? m.notes : ''}\n\nשיפטי - הדיאטנית החכמה שלך`;

    if (navigator.share) {
        const shareData = { title: 'שיפטי - ניתוח ארוחה', text };
        // If photo exists try to share it too
        if (m.photo && navigator.canShare) {
            fetch(m.photo).then(r => r.blob()).then(blob => {
                const file = new File([blob], 'meal.jpg', { type: 'image/jpeg' });
                const withFile = { ...shareData, files: [file] };
                if (navigator.canShare(withFile)) {
                    navigator.share(withFile).catch(() => {});
                } else {
                    navigator.share(shareData).catch(() => {});
                }
            }).catch(() => navigator.share(shareData).catch(() => {}));
        } else {
            navigator.share(shareData).catch(() => {});
        }
    } else {
        navigator.clipboard.writeText(text).then(() => showToast('הועתק!'));
    }
}

function saveMeal() {
    if (!lastAnalysis) return;
    const dayKey = getTodayKey();
    const meals = getData('meals_' + dayKey, []);
    const mealId = Date.now();

    // Save photo separately to avoid bloating meals data
    if (lastAnalysis.photo) {
        const photos = getData('meal_photos', {});
        photos[mealId] = lastAnalysis.photo;
        setData('meal_photos', photos);
    }

    meals.push({
        ...lastAnalysis,
        photo: lastAnalysis.photo ? mealId : null, // Store photo reference, not full base64
        time: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
        id: mealId
    });
    setData('meals_' + dayKey, meals);

    lastAnalysis = null;
    currentFoodPhoto = null;
    document.getElementById('food-input').value = '';
    document.getElementById('photo-preview-container').classList.add('hidden');
    document.getElementById('food-analysis-result').classList.add('hidden');
    showToast('הארוחה נשמרה');

    // Gamification: XP + streak + achievements
    addXP(XP_REWARDS.log_meal, 'log_meal');
    markTodayActive();
    checkAchievements();

    // Share to groups feed
    const savedMeal = meals[meals.length - 1];
    postGroupActivity('meal', {
        mealType: savedMeal.mealType,
        description: savedMeal.description,
        calories: savedMeal.calories,
        protein: savedMeal.protein
    });

    refreshFoodLog();
    refreshFoodGallery();
}

function changeFoodDay(dir) {
    foodDayOffset += dir;
    if (foodDayOffset > 0) foodDayOffset = 0;
    refreshFoodLog();
}

function refreshFoodLog() {
    const dayKey = getTodayKey(foodDayOffset);
    const label = document.getElementById('food-day-label');
    if (foodDayOffset === 0) label.textContent = 'היום';
    else if (foodDayOffset === -1) label.textContent = 'אתמול';
    else label.textContent = formatDate(dayKey);

    const meals = getData('meals_' + dayKey, []);
    const list = document.getElementById('food-log-list');

    if (meals.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>אין ארוחות ליום הזה</p></div>`;
        document.getElementById('daily-score-container').style.display = 'none';
        return;
    }

    const mealLabels = { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'חטיף' };
    const photos = getData('meal_photos', {});
    list.innerHTML = meals.map((m, i) => {
        const hasPhoto = m.photo && photos[m.photo];
        const thumbSrc = hasPhoto ? photos[m.photo] : '';
        return `
        <div class="food-log-item${hasPhoto ? ' food-log-item--with-photo' : ''}">
            ${hasPhoto
                ? `<img class="food-log-thumb" src="${thumbSrc}" alt="" onclick="openFoodPhoto(${m.photo})">`
                : `<span class="food-emoji">${mealLabels[m.mealType] || 'ארוחה'}</span>`
            }
            <div class="food-details">
                <div class="food-name">${m.description}</div>
                <div class="food-macros">ח: ${m.protein}g · פ: ${m.carbs}g · ש: ${m.fat}g · ${m.time || ''}</div>
            </div>
            <span class="food-cal">${m.calories} קק״ל</span>
            <button class="food-share-btn" onclick="event.stopPropagation(); shareSavedMeal('${dayKey}', ${i})" title="שתפי">שתפי</button>
            <button class="food-delete" onclick="deleteMeal('${dayKey}', ${i})" title="מחיקה">✕</button>
        </div>
    `}).join('');

    // Daily totals & score
    const totals = meals.reduce((acc, m) => {
        acc.calories += m.calories || 0;
        acc.protein += m.protein || 0;
        return acc;
    }, { calories: 0, protein: 0 });

    const profile = getProfile();
    const targetCal = profile.targetCalories || 1500;
    const pct = totals.calories / targetCal;
    let score, note;
    if (pct >= 0.85 && pct <= 1.05) { score = 'מצוין'; note = 'בטווח הקלוריות היומי!'; }
    else if (pct < 0.85 && pct >= 0.6) { score = 'סביר'; note = 'אכלת פחות מהיעד'; }
    else if (pct > 1.05 && pct <= 1.2) { score = 'קצת מעל'; note = 'חרגת מעט מהיעד'; }
    else if (pct < 0.6) { score = 'נמוך'; note = 'אכלת מעט מדי היום'; }
    else { score = 'חריגה'; note = 'חריגה משמעותית מהיעד'; }

    document.getElementById('daily-score').textContent = score;
    document.getElementById('daily-score-note').textContent = note;
    document.getElementById('daily-score-container').style.display = 'block';

    // Award calorie target XP if in range and today
    if (foodDayOffset === 0 && pct >= 0.85 && pct <= 1.05) {
        const calTargetKey = 'game_cal_target_' + getTodayKey();
        if (!getData(calTargetKey, false)) {
            setData(calTargetKey, true);
            addXP(XP_REWARDS.calorie_target, 'calorie_target');
            checkAchievements();
        }
    }
}

function deleteMeal(dayKey, index) {
    const meals = getData('meals_' + dayKey, []);
    // Also delete photo if exists
    const meal = meals[index];
    if (meal && meal.photo) {
        const photos = getData('meal_photos', {});
        delete photos[meal.photo];
        setData('meal_photos', photos);
    }
    meals.splice(index, 1);
    setData('meals_' + dayKey, meals);
    refreshFoodLog();
    refreshFoodGallery();
    showToast('הארוחה נמחקה');
}

// ============ Food Gallery ============
function refreshFoodGallery() {
    const galleryEl = document.getElementById('food-gallery');
    if (!galleryEl) return;

    const photos = getData('meal_photos', {});
    const photoIds = Object.keys(photos).sort((a, b) => b - a); // Newest first

    if (photoIds.length === 0) {
        galleryEl.innerHTML = '<div class="gallery-empty">תמונות הארוחות שלך יופיעו כאן</div>';
        return;
    }

    // Show last 12 photos
    galleryEl.innerHTML = photoIds.slice(0, 12).map(id => `
        <div class="gallery-item" onclick="openFoodPhoto(${id})">
            <img src="${photos[id]}" alt="ארוחה" loading="lazy">
        </div>
    `).join('');
}

function openFoodPhoto(photoId) {
    const photos = getData('meal_photos', {});
    const src = photos[photoId];
    if (!src) return;

    // Create full-screen overlay
    const overlay = document.createElement('div');
    overlay.className = 'photo-overlay';
    overlay.innerHTML = `
        <div class="photo-overlay-content">
            <img src="${src}" alt="ארוחה">
            <div class="photo-overlay-actions">
                <button onclick="this.closest('.photo-overlay').remove()">✕ סגרי</button>
                <button onclick="sharePhoto(${photoId})">שתפי</button>
            </div>
        </div>
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
}

function sharePhoto(photoId) {
    const photos = getData('meal_photos', {});
    const src = photos[photoId];
    if (!src) return;

    if (navigator.share && navigator.canShare) {
        fetch(src).then(r => r.blob()).then(blob => {
            const file = new File([blob], 'meal.jpg', { type: 'image/jpeg' });
            const shareData = { title: 'שיפטי - ארוחה', files: [file] };
            if (navigator.canShare(shareData)) {
                navigator.share(shareData).catch(() => {});
            } else {
                showToast('השיתוף לא נתמך במכשיר');
            }
        });
    } else {
        showToast('השיתוף לא נתמך בדפדפן הזה');
    }
}

function shareSavedMeal(dayKey, index) {
    const meals = getData('meals_' + dayKey, []);
    const m = meals[index];
    if (!m) return;

    const text = `${m.description}\n${m.calories} קק"ל | ח: ${m.protein}g | פ: ${m.carbs}g | ש: ${m.fat}g\n${m.notes ? m.notes : ''}\n\nשיפטי - הדיאטנית החכמה שלך`;

    if (navigator.share) {
        const shareData = { title: 'שיפטי - ארוחה', text };
        const photos = getData('meal_photos', {});
        if (m.photo && photos[m.photo] && navigator.canShare) {
            fetch(photos[m.photo]).then(r => r.blob()).then(blob => {
                const file = new File([blob], 'meal.jpg', { type: 'image/jpeg' });
                const withFile = { ...shareData, files: [file] };
                if (navigator.canShare(withFile)) {
                    navigator.share(withFile).catch(() => {});
                } else {
                    navigator.share(shareData).catch(() => {});
                }
            }).catch(() => navigator.share(shareData).catch(() => {}));
        } else {
            navigator.share(shareData).catch(() => {});
        }
    } else {
        navigator.clipboard.writeText(text).then(() => showToast('הועתק!'));
    }
}

// ============ Metrics ============
function refreshMetrics() {
    renderWeightChart();
    renderMeasurements();
    renderBloodTests();
}

function renderWeightChart() {
    const weights = getData('weights', []);
    const ctx = document.getElementById('weight-chart');
    if (!ctx) return;

    if (weightChart) weightChart.destroy();

    if (weights.length === 0) {
        weightChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['עדיין אין נתונים'], datasets: [{ data: [0] }] },
            options: { plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { display: false } } }
        });
        return;
    }

    const profile = getProfile();
    const labels = weights.map(w => formatDate(w.date));
    const data = weights.map(w => w.value);

    const datasets = [{
        label: 'משקל',
        data: data,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#10B981'
    }];

    if (profile.targetWeight) {
        datasets.push({
            label: 'יעד',
            data: Array(data.length).fill(parseFloat(profile.targetWeight)),
            borderColor: '#E5E7EB',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
        });
    }

    weightChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    ticks: { font: { family: 'Heebo', size: 11 } },
                    grid: { color: '#F3F4F6' }
                },
                x: {
                    ticks: { font: { family: 'Heebo', size: 10 }, maxRotation: 45 },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderMeasurements() {
    const measurements = getData('measurements', []);
    if (measurements.length === 0) return;
    const latest = measurements[measurements.length - 1];
    if (latest.waist) document.getElementById('m-waist').textContent = latest.waist;
    if (latest.hips) document.getElementById('m-hips').textContent = latest.hips;
    if (latest.arm) document.getElementById('m-arm').textContent = latest.arm;

    // BMI
    const profile = getProfile();
    const weights = getData('weights', []);
    if (profile.height && weights.length > 0) {
        const heightM = profile.height / 100;
        const bmi = (weights[weights.length - 1].value / (heightM * heightM)).toFixed(1);
        document.getElementById('m-bmi').textContent = bmi;
    }
}

function renderBloodTests() {
    const tests = getData('bloodTests', []);
    if (tests.length === 0) return;
    const latest = tests[tests.length - 1];

    const ranges = {
        glucose: { min: 70, max: 100 },
        cholesterol: { min: 0, max: 200 },
        triglycerides: { min: 0, max: 150 },
        iron: { min: 60, max: 170 },
        b12: { min: 200, max: 900 },
        vitd: { min: 30, max: 100 },
        tsh: { min: 0.4, max: 4.0 }
    };

    Object.keys(ranges).forEach(key => {
        const val = latest[key];
        const el = document.getElementById('b-' + key);
        const statusEl = document.getElementById('bs-' + key);
        if (val != null && el) {
            el.textContent = val;
            const { min, max } = ranges[key];
            if (val >= min && val <= max) statusEl.className = 'b-status normal';
            else if (val < min * 0.8 || val > max * 1.3) statusEl.className = 'b-status danger';
            else statusEl.className = 'b-status warning';
        }
    });

    // Blood chart
    renderBloodChart(tests);
}

function renderBloodChart(tests) {
    const ctx = document.getElementById('blood-chart');
    if (!ctx || tests.length < 2) return;

    if (bloodChart) bloodChart.destroy();

    const labels = tests.map(t => formatDate(t.date));
    const datasets = [];
    const colors = { glucose: '#EF4444', cholesterol: '#3B82F6', b12: '#8B5CF6', vitd: '#F59E0B' };

    ['glucose', 'cholesterol', 'b12', 'vitd'].forEach(key => {
        const data = tests.map(t => t[key] || null);
        if (data.some(d => d !== null)) {
            const names = { glucose: 'סוכר', cholesterol: 'כולסטרול', b12: 'B12', vitd: 'ויט D' };
            datasets.push({
                label: names[key],
                data,
                borderColor: colors[key],
                tension: 0.3,
                pointRadius: 3,
                fill: false
            });
        }
    });

    if (datasets.length === 0) return;

    bloodChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Heebo', size: 11 }, usePointStyle: true } }
            },
            scales: {
                y: { ticks: { font: { family: 'Heebo', size: 11 } }, grid: { color: '#F3F4F6' } },
                x: { ticks: { font: { family: 'Heebo', size: 10 } }, grid: { display: false } }
            }
        }
    });
}

// ============ Save Data Functions ============
function saveWeight() {
    const val = parseFloat(document.getElementById('input-weight').value);
    if (!val) { showToast('הכניסי משקל'); return; }
    const date = document.getElementById('input-weight-date').value || getTodayKey();
    const weights = getData('weights', []);
    weights.push({ value: val, date });
    weights.sort((a, b) => a.date.localeCompare(b.date));
    setData('weights', weights);
    closeModal('weight-modal');
    showToast('המשקל נשמר');

    // Gamification
    addXP(XP_REWARDS.weigh_in, 'weigh_in');
    markTodayActive();
    checkAchievements();

    // Share to groups feed
    postGroupActivity('weight', { weight: val });

    refreshMetrics();
    refreshDashboard();
}

function saveMeasurements() {
    const waist = parseFloat(document.getElementById('input-waist').value) || null;
    const hips = parseFloat(document.getElementById('input-hips').value) || null;
    const arm = parseFloat(document.getElementById('input-arm').value) || null;
    const date = document.getElementById('input-measurements-date').value || getTodayKey();
    if (!waist && !hips && !arm) { showToast('הכניסי לפחות מדד אחד'); return; }
    const measurements = getData('measurements', []);
    measurements.push({ waist, hips, arm, date });
    measurements.sort((a, b) => a.date.localeCompare(b.date));
    setData('measurements', measurements);
    closeModal('measurements-modal');
    showToast('המידות נשמרו ✓');
    addXP(XP_REWARDS.add_measurements, 'add_measurements');
    markTodayActive();
    checkAchievements();
    refreshMetrics();
}

function saveBloodTests() {
    const data = {
        glucose: parseFloat(document.getElementById('input-glucose').value) || null,
        cholesterol: parseFloat(document.getElementById('input-cholesterol').value) || null,
        triglycerides: parseFloat(document.getElementById('input-triglycerides').value) || null,
        iron: parseFloat(document.getElementById('input-iron').value) || null,
        b12: parseFloat(document.getElementById('input-b12').value) || null,
        vitd: parseFloat(document.getElementById('input-vitd').value) || null,
        tsh: parseFloat(document.getElementById('input-tsh').value) || null,
        date: document.getElementById('input-blood-date').value || getTodayKey()
    };
    const hasValue = Object.values(data).some((v, i) => i < 7 && v !== null);
    if (!hasValue) { showToast('הכניסי לפחות ערך אחד'); return; }
    const tests = getData('bloodTests', []);
    tests.push(data);
    tests.sort((a, b) => a.date.localeCompare(b.date));
    setData('bloodTests', tests);
    closeModal('blood-modal');
    showToast('בדיקות הדם נשמרו ✓');
    addXP(XP_REWARDS.add_blood_test, 'add_blood_test');
    markTodayActive();
    checkAchievements();
    refreshMetrics();
}

// ============ Smart Goals Calculator ============
function getCurrentWeight() {
    const weights = getData('weights', []);
    if (weights.length === 0) return 0;
    const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0].value;
}

function saveCurrentWeight() {
    const val = parseFloat(document.getElementById('profile-current-weight').value);
    if (!val) return;

    const weights = getData('weights', []);
    const today = getTodayKey();
    // Update today's entry or add new
    const idx = weights.findIndex(w => w.date === today);
    if (idx >= 0) {
        weights[idx].value = val;
    } else {
        weights.push({ value: val, date: today });
    }
    weights.sort((a, b) => a.date.localeCompare(b.date));
    setData('weights', weights);
    updateProfileHeader();
    showToast('המשקל עודכן');
}

function calculateSmartGoals() {
    const profile = getProfile();
    const age = parseInt(profile.age);
    const height = parseInt(profile.height);
    const gender = profile.gender;

    if (!age || !height) {
        showToast('מלאי קודם גיל וגובה');
        return;
    }

    // Get current weight from field or from weights history
    let currentWeight = parseFloat(document.getElementById('profile-current-weight').value) || getCurrentWeight();

    if (!currentWeight) {
        showToast('מלאי את המשקל הנוכחי שלך');
        return;
    }

    if (!gender) {
        showToast('בחרי מין בפרטים אישיים');
        return;
    }

    // Mifflin-St Jeor equation for BMR
    let bmr;
    if (gender === 'male') {
        bmr = 10 * currentWeight + 6.25 * height - 5 * age + 5;
    } else {
        bmr = 10 * currentWeight + 6.25 * height - 5 * age - 161;
    }

    // TDEE based on activity level
    const activityLevel = document.getElementById('profile-activity-level').value || 'light';
    const activityMultipliers = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725
    };
    const activityLabels = {
        sedentary: 'יושבנית',
        light: 'קלה',
        moderate: 'בינונית',
        active: 'גבוהה'
    };
    const multiplier = activityMultipliers[activityLevel] || 1.375;
    const tdee = Math.round(bmr * multiplier);

    // Calorie deficit for weight loss (500 cal deficit, min 1200)
    const targetCalories = Math.round(Math.max(1200, tdee - 500));

    // Target weight: use existing or suggest BMI-based
    const existingTargetWeight = parseFloat(document.getElementById('profile-target-weight').value);
    const bmiHealthyWeight = Math.round(22 * (height / 100) * (height / 100));
    const useTargetWeight = existingTargetWeight || bmiHealthyWeight;
    if (!existingTargetWeight) {
        document.getElementById('profile-target-weight').value = useTargetWeight;
    }

    // Protein: 1.6g per kg (recommended for fat loss + muscle preservation)
    const targetProtein = Math.round(currentWeight * 1.6);

    // Remaining calories split: ~55% carbs, ~45% fat
    const proteinCalories = targetProtein * 4;
    const remainingCalories = Math.max(400, targetCalories - proteinCalories);
    const targetCarbs = Math.round((remainingCalories * 0.55) / 4);
    const targetFat = Math.round((remainingCalories * 0.45) / 9);

    // Fiber: 14g per 1000 cal (standard recommendation)
    const targetFiber = Math.round(targetCalories / 1000 * 14);

    // Fill in values
    document.getElementById('profile-target-calories').value = targetCalories;
    document.getElementById('profile-target-protein').value = targetProtein;
    document.getElementById('profile-target-carbs').value = targetCarbs;
    document.getElementById('profile-target-fat').value = targetFat;
    document.getElementById('profile-target-fiber').value = targetFiber;

    saveProfile();

    // Show explanation
    const hint = document.getElementById('smart-calc-hint');
    hint.style.display = 'block';
    hint.innerHTML = `
        <div class="smart-calc-result">
            <div class="smart-calc-title">המלצה מותאמת אישית</div>
            <div class="smart-calc-details">
                <strong>${currentWeight}</strong> ק"ג · ${height} ס"מ · גיל ${age} · פעילות ${activityLabels[activityLevel]}
                <br>קצב מטבוליזם בסיסי (BMR): <strong>${Math.round(bmr)}</strong> קל׳
                <br>צריכה יומית (TDEE): <strong>${tdee}</strong> קל׳
                <br>לירידה בריאה (גרעון 500): <strong>${targetCalories}</strong> קל׳
                ${!existingTargetWeight ? `<br>משקל יעד מומלץ (BMI 22): <strong>${bmiHealthyWeight}</strong> ק"ג` : ''}
            </div>
        </div>
    `;

    showToast('היעדים עודכנו');
}

function updateProfileHeader() {
    const profile = getProfile();
    const nameEl = document.getElementById('profile-display-name');
    const metaEl = document.getElementById('profile-display-meta');

    if (nameEl && profile.name) {
        nameEl.textContent = profile.name;
    }

    if (metaEl) {
        const parts = [];
        if (profile.age) parts.push(`גיל ${profile.age}`);
        if (profile.height) parts.push(`${profile.height} ס״מ`);
        const cw = getCurrentWeight();
        if (cw) parts.push(`${cw} ק״ג`);
        if (profile.gender === 'female') parts.push('נקבה');
        else if (profile.gender === 'male') parts.push('זכר');
        metaEl.textContent = parts.join(' · ');
    }
}

// ============ Profile ============
function saveProfile() {
    const profile = {
        name: document.getElementById('profile-name').value,
        age: document.getElementById('profile-age').value,
        height: document.getElementById('profile-height').value,
        gender: document.getElementById('profile-gender').value,
        activityLevel: document.getElementById('profile-activity-level').value,
        targetWeight: document.getElementById('profile-target-weight').value,
        targetCalories: parseInt(document.getElementById('profile-target-calories').value) || '',
        targetProtein: parseInt(document.getElementById('profile-target-protein').value) || '',
        targetCarbs: parseInt(document.getElementById('profile-target-carbs').value) || '',
        targetFat: parseInt(document.getElementById('profile-target-fat').value) || '',
        targetFiber: parseInt(document.getElementById('profile-target-fiber').value) || '',
        apiKey: document.getElementById('profile-api-key').value
    };
    setData('profile', profile);
}

function loadProfile() {
    const p = getProfile();
    document.getElementById('profile-name').value = p.name || '';
    document.getElementById('profile-age').value = p.age || '';
    document.getElementById('profile-height').value = p.height || '';
    document.getElementById('profile-gender').value = p.gender || '';
    document.getElementById('profile-activity-level').value = p.activityLevel || 'light';
    document.getElementById('profile-target-weight').value = p.targetWeight || '';
    document.getElementById('profile-target-calories').value = p.targetCalories || '';
    document.getElementById('profile-target-protein').value = p.targetProtein || '';
    document.getElementById('profile-target-carbs').value = p.targetCarbs || '';
    document.getElementById('profile-target-fat').value = p.targetFat || '';
    document.getElementById('profile-target-fiber').value = p.targetFiber || '';
    document.getElementById('profile-api-key').value = p.apiKey || '';
    // Load current weight from weights history
    const cw = getCurrentWeight();
    if (cw) document.getElementById('profile-current-weight').value = cw;
    updateProfileHeader();
}

// ============ Chat ============
function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
}

function sendSuggestion(text) {
    document.getElementById('chat-input').value = text;
    sendChat();
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    const profile = getProfile();
    if (!profile.apiKey) {
        showToast('הגדירי API Key בפרופיל');
        return;
    }

    // Remove welcome if present
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    // Add user message
    addChatMessage(text, 'user');
    input.value = '';
    input.style.height = 'auto';

    // Show typing
    const typingId = addTypingIndicator();

    try {
        const context = buildChatContext();
        const response = await chatWithAI(text, context, profile);
        removeTypingIndicator(typingId);
        addChatMessage(response, 'assistant');

        // Track chat count for gamification
        const chatCount = getData('game_chat_count', 0);
        setData('game_chat_count', chatCount + 1);
        const todayChatKey = 'game_today_chat_' + getTodayKey();
        setData(todayChatKey, (getData(todayChatKey, 0)) + 1);
        markTodayActive();
        checkAchievements();
    } catch (err) {
        removeTypingIndicator(typingId);
        addChatMessage('מצטערת, משהו השתבש: ' + err.message, 'assistant');
    }
}

function addChatMessage(text, role) {
    const container = document.getElementById('chat-container');
    const div = document.createElement('div');
    div.className = 'chat-message ' + role;
    div.innerHTML = `<div class="chat-bubble">${formatMessageText(text)}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function formatMessageText(text) {
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function addTypingIndicator() {
    const container = document.getElementById('chat-container');
    const div = document.createElement('div');
    const id = 'typing-' + Date.now();
    div.id = id;
    div.className = 'chat-message assistant';
    div.innerHTML = `<div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function buildChatContext() {
    const profile = getProfile();
    const weights = getData('weights', []);
    const todayMeals = getData('meals_' + getTodayKey(), []);
    const bloodTests = getData('bloodTests', []);
    const measurements = getData('measurements', []);

    let ctx = '';
    if (profile.name) ctx += `שם: ${profile.name}\n`;
    if (profile.age) ctx += `גיל: ${profile.age}\n`;
    if (profile.height) ctx += `גובה: ${profile.height} ס"מ\n`;
    if (profile.gender) ctx += `מין: ${profile.gender === 'female' ? 'נקבה' : 'זכר'}\n`;
    if (profile.targetWeight) ctx += `משקל יעד: ${profile.targetWeight} ק"ג\n`;
    ctx += `יעד קלוריות: ${profile.targetCalories}\n`;

    if (weights.length > 0) {
        ctx += `\nמשקל אחרון: ${weights[weights.length - 1].value} ק"ג (${weights[weights.length - 1].date})`;
        if (weights.length >= 2) {
            const first = weights[0];
            ctx += `\nמשקל ראשון: ${first.value} ק"ג (${first.date})`;
            ctx += `\nשינוי כולל: ${(weights[weights.length - 1].value - first.value).toFixed(1)} ק"ג`;
        }
        ctx += '\n';
    }

    if (todayMeals.length > 0) {
        ctx += '\nארוחות היום:\n';
        todayMeals.forEach(m => {
            ctx += `- ${m.description} (${m.calories} קק"ל, ח:${m.protein}g פ:${m.carbs}g ש:${m.fat}g)\n`;
        });
    }

    if (bloodTests.length > 0) {
        const latest = bloodTests[bloodTests.length - 1];
        ctx += `\nבדיקות דם אחרונות (${latest.date}):\n`;
        if (latest.glucose) ctx += `סוכר: ${latest.glucose}\n`;
        if (latest.cholesterol) ctx += `כולסטרול: ${latest.cholesterol}\n`;
        if (latest.triglycerides) ctx += `טריגליצרידים: ${latest.triglycerides}\n`;
        if (latest.iron) ctx += `ברזל: ${latest.iron}\n`;
        if (latest.b12) ctx += `B12: ${latest.b12}\n`;
        if (latest.vitd) ctx += `ויטמין D: ${latest.vitd}\n`;
        if (latest.tsh) ctx += `TSH: ${latest.tsh}\n`;
    }

    if (measurements.length > 0) {
        const latest = measurements[measurements.length - 1];
        ctx += `\nמידות אחרונות (${latest.date}):\n`;
        if (latest.waist) ctx += `מותניים: ${latest.waist} ס"מ\n`;
        if (latest.hips) ctx += `ירכיים: ${latest.hips} ס"מ\n`;
        if (latest.arm) ctx += `זרוע: ${latest.arm} ס"מ\n`;
    }

    return ctx;
}

// ============ Modals ============
function openModal(id) {
    document.getElementById(id).classList.add('active');
    // Set default date to today
    const dateInputs = document.querySelectorAll(`#${id} input[type="date"]`);
    dateInputs.forEach(d => { if (!d.value) d.value = getTodayKey(); });
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function closeModalOverlay(e) {
    if (e.target === e.currentTarget) {
        e.target.classList.remove('active');
    }
}

// ============ Data Export/Import ============
function exportData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('da_')) {
            data[key] = localStorage.getItem(key);
        }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shifty-backup-${getTodayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('הנתונים יוצאו בהצלחה');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            Object.entries(data).forEach(([key, val]) => {
                localStorage.setItem(key, val);
            });
            showToast('הנתונים יובאו בהצלחה!');
            refreshDashboard();
        } catch {
            showToast('שגיאה בייבוא הקובץ');
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    showConfirmModal('מחיקת נתונים', 'למחוק את כל הנתונים? פעולה זו לא ניתנת לביטול!', function() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('da_')) keys.push(key);
        }
        keys.forEach(k => localStorage.removeItem(k));
        showToast('כל הנתונים נמחקו');
        location.reload();
    });
}

// ============ UI Helpers ============
function showLoading(text) {
    document.querySelector('.loading-text').textContent = text || 'מנתחת...';
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2500);
}

// ============ Init ============
// ============ Welcome / Login / Init ============
function showWelcomeScreen() {
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

function hideWelcomeScreen() {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('app').style.display = '';
}

function showLoginForm() {
    document.getElementById('login-form').style.display = 'block';
    document.querySelector('.welcome-options').style.display = 'none';
    document.getElementById('login-code-input').focus();
}

function hideLoginForm() {
    document.getElementById('login-form').style.display = 'none';
    document.querySelector('.welcome-options').style.display = '';
}

async function startNewAccount() {
    showLoading('יוצרת חשבון...');
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
            hideLoading();
            hideWelcomeScreen();
            showSaveCodeModal(data.friendCode);
            await initApp();
        } else {
            hideLoading();
            showToast('שגיאה ביצירת חשבון');
        }
    } catch (e) {
        hideLoading();
        showToast('שגיאה: ' + e.message);
    }
}

async function loginWithCode() {
    const input = document.getElementById('login-code-input');
    let code = input.value.trim().toUpperCase();
    if (!code) {
        showToast('הכניסי את הקוד שלך');
        return;
    }
    // Auto-add SHFT- prefix if missing
    if (!code.startsWith('SHFT-')) code = 'SHFT-' + code;

    showLoading('מתחברת...');
    try {
        const resp = await fetch('/api/user/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendCode: code })
        });
        const data = await resp.json();
        if (data.error) {
            hideLoading();
            showToast(data.error);
            return;
        }

        // Save identity
        setData('userId', data.userId);
        setData('friendCode', data.friendCode);

        // Restore user data from cloud
        if (data.data && Object.keys(data.data).length > 0) {
            Object.keys(data.data).forEach(key => localStorage.setItem(key, data.data[key]));
        }

        // Restore groups
        if (data.groups && data.groups.length > 0) {
            // groups are just IDs, we need to rebuild myGroups
            // The cloud data should have da_myGroups already
        }

        hideLoading();
        hideWelcomeScreen();
        showToast(`ברוכה השבה, ${data.displayName || 'חברה'}!`);
        await initApp();
    } catch (e) {
        hideLoading();
        showToast('שגיאה בהתחברות: ' + e.message);
    }
}

function showSaveCodeModal(code) {
    document.getElementById('save-code-value').textContent = code;
    document.getElementById('save-code-modal').style.display = 'flex';
}

function closeSaveCodeModal() {
    document.getElementById('save-code-modal').style.display = 'none';
}

function copyMyCode() {
    const code = document.getElementById('save-code-value').textContent;
    navigator.clipboard.writeText(code).then(() => showToast('הקוד הועתק!'));
}

async function initApp() {
    // Try loading from cloud
    let loadedFromCloud = false;
    if (typeof loadFromCloudWithUser === 'function' && getUserId()) {
        loadedFromCloud = await loadFromCloudWithUser();
    } else if (typeof loadFromCloud === 'function') {
        loadedFromCloud = await loadFromCloud();
    }
    if (loadedFromCloud) {
        showToast('☁️ הנתונים נטענו מהענן');
    }

    // Check streak
    checkAndUpdateStreak();

    // Refresh UI
    refreshDashboard();

    // Auto-resize chat input
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Check if user already has an identity
    const userId = getData('userId', null);
    if (!userId) {
        // Show welcome screen for new users
        showWelcomeScreen();
        return;
    }

    // Existing user - go straight to app
    await initApp();
});
