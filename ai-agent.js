/* ============================================
   DietAgent - AI Agent (Claude API)
   Uses /api/chat serverless proxy on Vercel
   Falls back to direct API for local dev
   ============================================ */

const SYSTEM_PROMPT_DIET = `את דיאטנית קלינית מומחית ואישית. את מדברת בעברית ונותנת ייעוץ חם, מקצועי וממוקד.

הנחיות:
- תמיד דברי בעברית בלשון נקבה (פונה לאישה)
- תני תשובות קצרות וממוקדות
- השתמשי באימוג'ים בצורה מתונה
- כשמנתחת אוכל - תני ערכים מציאותיים ומדויקים
- כשנותנת המלצות - התחשבי בכל הנתונים (משקל, בדיקות דם, ארוחות)
- אם בדיקות הדם מראות ערכים חריגים - ציני זאת והמליצי
- תני טיפים פרקטיים שקל ליישם
- אל תאבחני מצבים רפואיים - המליצי לפנות לרופא כשצריך
- כשנותנת תפריט - התאימי אותו ליעדי הקלוריות של המשתמשת`;

const SYSTEM_PROMPT_FOOD = `את מומחית תזונה. המשימה שלך לנתח ארוחה שמתוארת בטקסט חופשי או בתמונה ולהחזיר ערכים תזונתיים.

החזירי תמיד JSON בפורמט הבא בלבד (ללא טקסט נוסף):
{
  "calories": <number>,
  "protein": <number>,
  "carbs": <number>,
  "fat": <number>,
  "notes": "<הערה קצרה על הארוחה בעברית>",
  "detected_food": "<תיאור קצר של מה שזיהית בתמונה/טקסט>"
}

הנחיות:
- תני ערכים מציאותיים על בסיס מנות ישראליות ממוצעות
- אם לא ניתן לחשב בדיוק, תני הערכה סבירה
- ההערה צריכה להיות טיפ קצר (שורה אחת) על הארוחה
- אם מדובר בתמונת אוכל - זהי את המאכלים, העריכי כמויות ותני ערכים תזונתיים
- detected_food - תארי בקצרה מה זיהית (למשל "סלט ירקות עם טונה וביצה")`;

async function callAPI(systemPrompt, messages, maxTokens = 1024) {
    // Try serverless proxy first (Vercel), fall back to direct API
    const useProxy = !window.location.hostname.includes('localhost') || await proxyAvailable();

    if (useProxy) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ system: systemPrompt, messages, max_tokens: maxTokens })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Error: ${response.status}`);
        }
        return await response.json();
    } else {
        // Direct API call for local dev (uses API key from profile)
        const profile = getProfile();
        if (!profile.apiKey) throw new Error('הגדירי API Key בפרופיל');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': profile.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: maxTokens,
                system: systemPrompt,
                messages
            })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `API Error: ${response.status}`);
        }
        return await response.json();
    }
}

let _proxyChecked = false;
let _proxyOk = false;
async function proxyAvailable() {
    if (_proxyChecked) return _proxyOk;
    try {
        const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        _proxyOk = r.status !== 404;
    } catch { _proxyOk = false; }
    _proxyChecked = true;
    return _proxyOk;
}

// Chat history for multi-turn conversations
let chatHistory = [];

async function chatWithAI(userMessage, context, profile) {
    const systemPrompt = SYSTEM_PROMPT_DIET + '\n\nנתוני המשתמשת:\n' + context;

    chatHistory.push({ role: 'user', content: userMessage });
    if (chatHistory.length > 20) {
        chatHistory = chatHistory.slice(-20);
    }

    const data = await callAPI(systemPrompt, chatHistory, 1500);
    const reply = data.content[0].text;
    chatHistory.push({ role: 'assistant', content: reply });
    return reply;
}

async function analyzeFoodWithAI(foodDescription, profile, imageBase64 = null) {
    let userContent;

    if (imageBase64) {
        // Vision: send image + optional text
        const contentParts = [];
        contentParts.push({
            type: 'image',
            source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imageBase64
            }
        });
        const textPrompt = foodDescription
            ? `נתחי את הארוחה בתמונה. המשתמשת הוסיפה: "${foodDescription}"`
            : 'נתחי את הארוחה שבתמונה. זהי את המאכלים ותני ערכים תזונתיים.';
        contentParts.push({ type: 'text', text: textPrompt });
        userContent = contentParts;
    } else {
        userContent = `נתחי את הארוחה הבאה:\n${foodDescription}`;
    }

    const data = await callAPI(
        SYSTEM_PROMPT_FOOD,
        [{ role: 'user', content: userContent }]
    );
    const text = data.content[0].text;

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                calories: Math.round(parsed.calories || 0),
                protein: Math.round(parsed.protein || 0),
                carbs: Math.round(parsed.carbs || 0),
                fat: Math.round(parsed.fat || 0),
                notes: parsed.notes || '',
                detected_food: parsed.detected_food || foodDescription || ''
            };
        }
        throw new Error('No JSON found');
    } catch {
        throw new Error('לא הצלחתי לנתח את התשובה. נסי שוב.');
    }
}

async function getDailyInsight(profile, context) {
    try {
        const data = await callAPI(
            SYSTEM_PROMPT_DIET + '\n\nנתוני המשתמשת:\n' + context,
            [{ role: 'user', content: 'תני לי תובנה קצרה (2-3 משפטים) על היום שלי - מה עשיתי טוב ומה אפשר לשפר.' }]
        );
        return data.content[0].text;
    } catch {
        return null;
    }
}
