// Spike: can Claude actually plan a usable week given realistic inputs?
// Run: node spike/meal-planner.mjs

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
});

const client = new Anthropic();

// ===== Realistic inputs (Marina's family, fresh signup) =====
const INPUTS = {
    user: { name: 'מרינה', macros: { calories: 1500, protein: 110, carbs: 130, fat: 50 } },
    family: {
        adults: 2,
        kids: [{ age: 7 }, { age: 4 }, { age: 1.5 }],
        adultPortionFactor: 2,
        kidPortionFactor: 1.7,
    },
    preferences: {
        kosher: true,
        meatDairySeparate: true,
        dislikes: ['חציל', 'כבד'],
        allergies: [],
    },
    pantry: [
        'אורז', 'פסטה', 'עגבניות', 'בצל', 'גזר', 'תפוחי אדמה',
        'ביצים', 'יוגורט', 'גבינה צהובה', 'לחם', 'שמן זית',
        'עוף קפוא', 'טונה', 'חומוס', 'טחינה', 'לימון', 'שום',
    ],
    constraints: {
        startDay: 'ראשון',
        weekHasShabbat: true,
        budgetTier: '₪₪',
        cookingTimeWeekday: 'עד 30 דקות',
        mealPrepFriendly: true,
        skipMeals: [
            { day: 'שני', meal: 'צהריים', reason: 'אוכלים בחוץ' },
            { day: 'חמישי', meal: 'ערב', reason: 'אוכלים אצל סבתא' },
        ],
    },
};

const SYSTEM = `את דיאטנית מומחית שמתכננת ארוחות לבית ישראלי. עליך להחזיר תוכנית שבועית JSON תקין בלבד, ללא טקסט נוסף.

עקרונות:
- שמרי על כשרות והפרדת בשר/חלב אם המשתמשת מבקשת
- ימי שישי-שבת שונים: ארוחת ליל שבת רחבה יותר, יום שבת בית עם סלטים
- מנת מבוגרים מחושבת כך שאם המשתמשת אוכלת אותה, היא קרובה ליעדי המאקרו שלה (לא מחלקת את היעד למשפחה)
- מנת ילדים נפרדת רק אם המנה הראשית לא מתאימה לילדים קטנים
- מתכונים פשוטים, רכיבים ישראליים זמינים
- העדיפי שימוש במזווה הקיים
- מנה אחת ב-meal prep יכולה לחזור פעמיים השבוע`;

const USER_PROMPT = `תכנני שבוע מ${INPUTS.constraints.startDay} ל-${INPUTS.user.name}, אמא ל-3 ילדים (7, 4, שנה וחצי), 2 מבוגרים בבית.

יעדי מאקרו של המשתמשת (פר-יום): ${JSON.stringify(INPUTS.user.macros)}
העדפות: ${JSON.stringify(INPUTS.preferences, null, 2)}
מזווה קיים: ${INPUTS.pantry.join(', ')}
אילוצים: ${JSON.stringify(INPUTS.constraints, null, 2)}

החזירי JSON במבנה הבא בדיוק:
{
  "week": [
    {
      "day": "ראשון",
      "meals": {
        "בוקר": { "name": "שם המנה", "macrosPerAdultPortion": {"cal": 0, "p": 0, "c": 0, "f": 0}, "prepMinutes": 0, "needsKidVersion": false, "kidVersion": null, "mealPrepShared": null },
        "צהריים": { ... },
        "ערב": { ... }
      }
    },
    ...
  ],
  "shoppingList": [
    { "category": "ירקות", "name": "עגבניות", "qty": "1 קילו", "estimatedTier": "₪", "inPantry": false }
  ],
  "weeklySummary": {
    "avgDailyCaloriesForUser": 0,
    "estimatedTotalCost": "₪₪",
    "uniqueDishes": 0,
    "mealsSkipped": 0
  }
}`;

console.log('🧪 Running spike...\n');
console.log('Inputs:');
console.log(`  User: ${INPUTS.user.name}, macros: ${JSON.stringify(INPUTS.user.macros)}`);
console.log(`  Family: ${INPUTS.family.adults} adults + ${INPUTS.family.kids.length} kids (${INPUTS.family.kids.map(k => k.age).join(', ')})`);
console.log(`  Pantry: ${INPUTS.pantry.length} items`);
console.log(`  Skip: ${INPUTS.constraints.skipMeals.length} meals`);
console.log('\n⏳ Calling Claude...\n');

const t0 = Date.now();
const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: 'user', content: USER_PROMPT }],
});
const ms = Date.now() - t0;

const text = resp.content.find(b => b.type === 'text').text;
let plan;
try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    plan = JSON.parse(jsonMatch[0]);
} catch (e) {
    console.error('❌ JSON parse failed');
    console.log(text.slice(0, 2000));
    process.exit(1);
}

// ===== Print the plan in human-readable form =====
console.log(`✅ Got plan in ${(ms / 1000).toFixed(1)}s · ${resp.usage.input_tokens}in / ${resp.usage.output_tokens}out tokens\n`);
console.log('═══════════════════════════════════════');
console.log('📅 השבוע');
console.log('═══════════════════════════════════════\n');

for (const day of plan.week) {
    console.log(`▶ ${day.day}`);
    for (const [mealType, m] of Object.entries(day.meals)) {
        if (!m || m.skipped) {
            console.log(`  ${mealType.padEnd(8)} — דילוג (${m?.reason || ''})`);
            continue;
        }
        const macros = m.macrosPerAdultPortion;
        const macroStr = macros ? `${macros.cal} cal · ${macros.p}p/${macros.c}c/${macros.f}f` : '';
        console.log(`  ${mealType.padEnd(8)} ${m.name}  [${m.prepMinutes}min · ${macroStr}]`);
        if (m.needsKidVersion && m.kidVersion) {
            console.log(`         ↳ ילדים: ${m.kidVersion.name || m.kidVersion}`);
        }
        if (m.mealPrepShared) {
            console.log(`         🔁 meal prep משותף עם: ${m.mealPrepShared}`);
        }
    }
    console.log('');
}

console.log('═══════════════════════════════════════');
console.log('🛒 רשימת קניות');
console.log('═══════════════════════════════════════\n');

const byCategory = {};
for (const item of plan.shoppingList) {
    (byCategory[item.category] ||= []).push(item);
}
for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`▼ ${cat}`);
    for (const it of items) {
        const mark = it.inPantry ? ' ✓(במזווה)' : '';
        console.log(`  • ${it.name} — ${it.qty} ${it.estimatedTier}${mark}`);
    }
    console.log('');
}

console.log('═══════════════════════════════════════');
console.log('📊 סיכום');
console.log('═══════════════════════════════════════');
const s = plan.weeklySummary;
console.log(`  ממוצע יומי שלך: ${s.avgDailyCaloriesForUser} cal (יעד: ${INPUTS.user.macros.calories})`);
console.log(`  עלות מוערכת: ${s.estimatedTotalCost}`);
console.log(`  מנות ייחודיות: ${s.uniqueDishes}`);
console.log(`  ארוחות שדולגו: ${s.mealsSkipped}`);
console.log('');
