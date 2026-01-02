import { DOM } from './dom.js';

// Cookie utilities
export const OPTIONS_COOKIE = 'boatwise_options';
export const SESSION_COOKIE = 'boatwise_session';
export const USE_COOKIES = isCookiesAvailable();

// Fallback to localStorage if cookies don't work (e.g., file:// protocol)
function isCookiesAvailable() {
    try {
        const test = '__test__';
        document.cookie = `${test}=1; path=/`;
        const hasCookie = document.cookie.includes(test);
        document.cookie = `${test}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        return hasCookie;
    } catch (e) {
        return false;
    }
}

function setCookie(name, value, days = 30) {
    try {
        if (USE_COOKIES) {
            const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
            const cookieValue = encodeURIComponent(value);
            const fullCookie = `${encodeURIComponent(name)}=${cookieValue}; expires=${expires}; path=/; SameSite=Lax`;
            document.cookie = fullCookie;
            // Verify it was actually set; warn only if missing
            const allCookies = document.cookie;
            const cookieSet = allCookies.includes(encodeURIComponent(name));
            if (!cookieSet) {
                console.warn(`[setCookie] WARNING: Cookie '${name}' was not found after setting!`);
            }
        } else {
            localStorage.setItem(name, value);
        }
    } catch (e) {
        console.warn('Failed to set storage', name, e);
    }
}

function getCookie(name) {
    try {
        if (USE_COOKIES) {
            const cookieString = document.cookie || '';
            const encodedName = encodeURIComponent(name) + '=';
            const parts = cookieString.split(';');
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.startsWith(encodedName)) {
                    try {
                        return decodeURIComponent(trimmed.substring(encodedName.length));
                    } catch (e) {
                        console.warn('Failed to decode cookie value', name, e);
                        return null;
                    }
                }
            }
            return null;
        } else {
            return localStorage.getItem(name);
        }
    } catch (e) {
        console.warn('Failed to get storage', name, e);
        return null;
    }
}

export function deleteCookie(name) {
    try {
        if (USE_COOKIES) {
            document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        } else {
            localStorage.removeItem(name);
        }
    } catch (e) {
        console.warn('Failed to delete storage', name, e);
    }
}

// Session persistence
export function saveSessionToCookie(state) {
    const quizList = state.allQuizzes.map(q => ({ id: q.ID, type: q.type }));
    const answers = [...state.answeredQuizzes.entries()].map(([i, v]) => ({ i, a: v.answerIndex, c: v.isCorrect }));
    const payload = { list: quizList, idx: state.currentIndex, ans: answers, cc: state.correctCount, ic: state.incorrectCount, order: state.quizOrder };
    const jsonStr = JSON.stringify(payload);
    // Use localStorage for session (large data ~93KB exceeds 4KB cookie limit)
    try {
        localStorage.setItem(SESSION_COOKIE, jsonStr);
    } catch (e) {
        console.warn('[saveSessionToCookie] Failed to save to localStorage:', e);
    }
}

export function loadSessionFromCookie(state, quizData) {
    // Try localStorage first (for large session data)
    let raw = localStorage.getItem(SESSION_COOKIE);

    // Fallback to cookies if localStorage is empty (for backward compatibility)
    if (!raw) {
        raw = getCookie(SESSION_COOKIE);
    }

    if (!raw) {
        return false;
    }
    try {
        const data = JSON.parse(raw);
        if (!data.list || !Array.isArray(data.list) || data.list.length === 0) {
            return false;
        }
        // Rebuild ordered quizzes by matching id+type
        const byKey = new Map();
        [...quizData.basic, ...quizData.sailing].forEach(q => byKey.set(`${q.type}:${q.ID}`, q));
        const ordered = [];
        for (const item of data.list) {
            const key = `${item.type}:${item.id}`;
            const q = byKey.get(key);
            if (q) ordered.push(q);
        }
        if (ordered.length === 0) return false;
        state.allQuizzes = ordered;
        state.quizOrder = data.order || state.quizOrder;
        state.currentIndex = Math.min(Math.max(0, data.idx || 0), ordered.length - 1);
        state.answeredQuizzes.clear();
        (data.ans || []).forEach(rec => {
            state.answeredQuizzes.set(rec.i, { answerIndex: rec.a, isCorrect: rec.c });
        });
        // Recompute counts if not provided
        if (typeof data.cc === 'number' && typeof data.ic === 'number') {
            state.correctCount = data.cc;
            state.incorrectCount = data.ic;
        } else {
            let cc = 0, ic = 0;
            state.answeredQuizzes.forEach(v => { v.c ? cc++ : ic++; });
            state.correctCount = cc;
            state.incorrectCount = ic;
        }
        // Resume UI
        DOM.setupScreen.classList.remove('active');
        DOM.quizScreen.classList.add('active');
        DOM.header.style.display = 'none';
        return true;
    } catch (e) {
        console.warn('Failed to parse session cookie', e);
        return false;
    }
}

// Options persistence
export function saveOptionsToCookie(state) {
    const payload = {
        order: state.quizOrder,
        chapters: [...state.filters.chapters],
        themes: [...state.filters.themes],
        entries: [...state.filters.entries]
    };
    setCookie(OPTIONS_COOKIE, JSON.stringify(payload));
}

export function loadOptionsFromCookie(state) {
    const raw = getCookie(OPTIONS_COOKIE);
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        if (data.order) state.quizOrder = data.order;
        state.filters.chapters = new Set(data.chapters || []);
        state.filters.themes = new Set(data.themes || []);
        state.filters.entries = new Set(data.entries || []);
        const filterCount = state.filters.chapters.size + state.filters.themes.size + state.filters.entries.size;
        DOM.openFilterBtn.textContent = filterCount > 0 ? `Seleziona Capitoli/Temi/Voci (${filterCount} attivi)` : 'Seleziona Capitoli/Temi/Voci';
    } catch (e) {
        console.warn('Failed to parse options cookie', e);
    }
}
