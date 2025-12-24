// Application State
const state = {
    quizOrder: 'sequential',
    allQuizzes: [],
    currentIndex: 0,
    selectedAnswer: null,
    answeredQuizzes: new Map(), // Maps quiz index to {answerIndex, isCorrect}
    correctCount: 0,
    incorrectCount: 0,
    filters: {
        chapters: new Set(),
        themes: new Set(),
        entries: new Set()
    },
    availableFilters: {
        chapters: new Map() // Map of chapter -> Map of theme -> Set of entries
    },
    spacedRepetition: new Map() // Maps quiz ID to {easiness, interval, nextReview, repetitions}
};

const DATA_ROOT = './data';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// DOM Elements
const header = document.getElementById('app-header');
const setupScreen = document.getElementById('setup-screen');
const quizScreen = document.getElementById('quiz-screen');
const startQuizBtn = document.getElementById('start-quiz-btn');
const backToSetupBtn = document.getElementById('back-to-setup-btn');
const quizCounter = document.getElementById('quiz-counter');
const quizId = document.getElementById('quiz-id');
const quizImageContainer = document.getElementById('quiz-image-container');
const quizImage = document.getElementById('quiz-image');
const quizQuestionText = document.getElementById('quiz-question-text');
const quizAnswers = document.getElementById('quiz-answers');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const filterModal = document.getElementById('filter-modal');
const openFilterBtn = document.getElementById('open-filter-btn');
const closeFilterBtn = document.getElementById('close-filter-btn');
const applyFilterBtn = document.getElementById('apply-filter-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const filterTree = document.getElementById('filter-tree');
const resetCacheBtn = document.getElementById('reset-cache-btn');

// Cookie utilities
const OPTIONS_COOKIE = 'boatwise_options';
const SESSION_COOKIE = 'boatwise_session';
const SPACED_REPETITION_COOKIE = 'boatwise_spaced_repetition';

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

const USE_COOKIES = isCookiesAvailable();

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

function deleteCookie(name) {
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

// Spaced Repetition Utilities (SM-2 Algorithm)
function initializeSpacedRepetitionItem(quizId) {
    return {
        easiness: 2.5,      // Initial easiness factor (EF)
        interval: 0,        // Days until next review
        nextReview: Date.now(), // Next review timestamp
        repetitions: 0      // Number of successful repetitions
    };
}

function calculateSpacedRepetition(item, quality) {
    // quality: 0-5 scale (0=complete failure, 5=perfect response)
    // SM-2 Algorithm
    let { easiness, interval, repetitions } = item;
    
    // Update easiness factor
    easiness = Math.max(1.3, easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    
    // Update repetitions and interval
    if (quality < 3) {
        // Incorrect answer - reset
        repetitions = 0;
        interval = 1; // Review again in 1 day
    } else {
        // Correct answer
        repetitions++;
        if (repetitions === 1) {
            interval = 1; // First review in 1 day
        } else if (repetitions === 2) {
            interval = 6; // Second review in 6 days
        } else {
            interval = Math.round(interval * easiness);
        }
    }
    
    // Calculate next review date
    const nextReview = Date.now() + (interval * MILLISECONDS_PER_DAY);
    
    return {
        easiness,
        interval,
        nextReview,
        repetitions
    };
}

function saveSpacedRepetitionData() {
    const data = {};
    state.spacedRepetition.forEach((value, key) => {
        data[key] = value;
    });
    const jsonStr = JSON.stringify(data);
    // Use localStorage for spaced repetition data (large data ~140KB exceeds 4KB cookie limit)
    try {
        localStorage.setItem(SPACED_REPETITION_COOKIE, jsonStr);
    } catch (e) {
        console.warn('[saveSpacedRepetitionData] Failed to save to localStorage:', e);
    }
}

function loadSpacedRepetitionData() {
    // Try localStorage first (for large data)
    let raw = localStorage.getItem(SPACED_REPETITION_COOKIE);
    
    // Fallback to cookies if localStorage is empty (for backward compatibility)
    if (!raw) {
        raw = getCookie(SPACED_REPETITION_COOKIE);
    }
    
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        state.spacedRepetition.clear();
        Object.keys(data).forEach(key => {
            state.spacedRepetition.set(key, data[key]);
        });
    } catch (e) {
        console.warn('[loadSpacedRepetitionData] Failed to parse:', e);
    }
}

// CSV Parsing Function
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        return obj;
    });
}

// Load Quiz Data
async function loadQuizData() {
    try {
        const [baseResponse, velaResponse, removedResponse] = await Promise.all([
            fetch(`${DATA_ROOT}/quiz_base.csv`),
            fetch(`${DATA_ROOT}/quiz_vela.csv`),
            fetch(`${DATA_ROOT}/quiz_base.rimossi_2024.csv`)
        ]);

        const baseText = await baseResponse.text();
        const velaText = await velaResponse.text();
        const removedText = await removedResponse.text();

        const baseQuizzes = parseCSV(baseText);
        const velaQuizzes = parseCSV(velaText);
        const removedQuizzes = parseCSV(removedText);

        // Get IDs of removed quizzes
        const removedIds = new Set(removedQuizzes.map(q => q.ID).filter(id => id));

        // Filter out removed quizzes from base
        const filteredBaseQuizzes = baseQuizzes
            .filter(q => q.ID && !removedIds.has(q.ID))
            .map(q => ({
                ...q,
                type: 'base'
            }));

        const filteredVelaQuizzes = velaQuizzes
            .filter(q => q.ID)
            .map(q => ({
                ...q,
                type: 'vela'
            }));

        return {
            base: filteredBaseQuizzes,
            vela: filteredVelaQuizzes
        };
    } catch (error) {
        console.error('Error loading quiz data:', error);
        alert('Errore nel caricamento dei quiz. Assicurati che i file CSV siano accessibili.');
        return { base: [], vela: [] };
    }
}

// Initialize App
async function initializeApp() {
    const quizData = await loadQuizData();

    // Extract available filters from quiz data
    extractFilters(quizData);

    // Load options and session from cookies (resume if available)
    loadOptionsFromCookie();
    loadSpacedRepetitionData();
    buildFilterUI();
    const resumed = loadSessionFromCookie(quizData);

    // Setup event listeners
    startQuizBtn.addEventListener('click', () => startQuiz(quizData));
    backToSetupBtn.addEventListener('click', backToSetup);
    prevBtn.addEventListener('click', navigatePrevious);
    nextBtn.addEventListener('click', navigateNext);
    openFilterBtn.addEventListener('click', openFilterModal);
    closeFilterBtn.addEventListener('click', closeFilterModal);
    applyFilterBtn.addEventListener('click', applyFilters);
    selectAllBtn.addEventListener('click', selectAllFilters);
    deselectAllBtn.addEventListener('click', deselectAllFilters);
    resetCacheBtn.addEventListener('click', resetResponseCache);

    // Close modal on backdrop click
    filterModal.addEventListener('click', (e) => {
        if (e.target === filterModal) {
            closeFilterModal();
        }
    });

    // Quiz order radio buttons
    document.querySelectorAll('input[name="quiz-order"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.quizOrder = e.target.value;
            saveOptionsToCookie();
        });
    });

    // Initialize quizOrder from the currently checked radio (default is Sequenziale)
    const checkedOrder = document.querySelector('input[name="quiz-order"]:checked');
    if (checkedOrder) {
        state.quizOrder = checkedOrder.value;
    }
}

// Start Quiz
function startQuiz(quizData) {
    // Start with all quizzes (both base and vela)
    let quizzes = [...quizData.base, ...quizData.vela];

    // Apply filters if any are selected
    if (state.filters.chapters.size > 0 || state.filters.themes.size > 0 || state.filters.entries.size > 0) {
        quizzes = quizzes.filter(quiz => {
            const chapter = quiz.CAPITOLO?.trim();
            const theme = quiz.TEMA?.trim();
            const entry = quiz.VOCE?.trim();
            
            // If chapters are selected, quiz must match one of them
            const chapterMatch = state.filters.chapters.size === 0 || state.filters.chapters.has(chapter);
            // If themes are selected, quiz must match one of them
            const themeMatch = state.filters.themes.size === 0 || state.filters.themes.has(theme);
            // If entries are selected, quiz must match one of them
            const entryMatch = state.filters.entries.size === 0 || state.filters.entries.has(entry);
            
            return chapterMatch && themeMatch && entryMatch;
        });
    }

    // Check if any quizzes match the filters
    if (quizzes.length === 0) {
        alert('Nessun quiz corrisponde ai filtri selezionati. Prova a modificare i filtri.');
        return;
    }

    // Ensure deterministic ordering for sequential mode
    if (state.quizOrder === 'sequential') {
        quizzes.sort((a, b) => {
            const aid = parseInt(String(a.ID).replace(/\D/g, ''), 10);
            const bid = parseInt(String(b.ID).replace(/\D/g, ''), 10);
            if (Number.isFinite(aid) && Number.isFinite(bid)) return aid - bid;
            return String(a.ID).localeCompare(String(b.ID));
        });
    }

    // Randomize if needed
    if (state.quizOrder === 'random') {
        quizzes = shuffleArray(quizzes);
    }

    // Spaced repetition ordering
    if (state.quizOrder === 'spaced-repetition') {
        const now = Date.now();
        // Initialize spaced repetition data for new quizzes
        quizzes.forEach(quiz => {
            const quizKey = `${quiz.type}:${quiz.ID}`;
            if (!state.spacedRepetition.has(quizKey)) {
                state.spacedRepetition.set(quizKey, initializeSpacedRepetitionItem(quizKey));
            }
        });
        
        // Sort by next review date (due items first), then by easiness (harder items first)
        quizzes.sort((a, b) => {
            const keyA = `${a.type}:${a.ID}`;
            const keyB = `${b.type}:${b.ID}`;
            const dataA = state.spacedRepetition.get(keyA);
            const dataB = state.spacedRepetition.get(keyB);
            
            // Items due for review come first
            const dueA = dataA.nextReview <= now;
            const dueB = dataB.nextReview <= now;
            
            if (dueA && !dueB) return -1;
            if (!dueA && dueB) return 1;
            
            // If both due or both not due, sort by next review date
            if (dataA.nextReview !== dataB.nextReview) {
                return dataA.nextReview - dataB.nextReview;
            }
            
            // If same review date, sort by easiness (harder items first)
            return dataA.easiness - dataB.easiness;
        });
        
        saveSpacedRepetitionData();
    }

    state.allQuizzes = quizzes;
    state.currentIndex = 0;
    state.answeredQuizzes.clear();
    state.correctCount = 0;
    state.incorrectCount = 0;

    // Save session cookie (ordered quiz list + index + answers)
    saveSessionToCookie();

    // Show quiz screen
    setupScreen.classList.remove('active');
    quizScreen.classList.add('active');
    header.style.display = 'none';

    // Display first quiz
    displayQuiz();
}

// Session persistence
function saveSessionToCookie() {
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

function loadSessionFromCookie(quizData) {
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
        [...quizData.base, ...quizData.vela].forEach(q => byKey.set(`${q.type}:${q.ID}`, q));
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
        setupScreen.classList.remove('active');
        quizScreen.classList.add('active');
        header.style.display = 'none';
        displayQuiz();
        return true;
    } catch (e) {
        console.warn('Failed to parse session cookie', e);
        return false;
    }
}

// Extract available filters from quiz data
function extractFilters(quizData) {
    const allQuizzes = [...quizData.base, ...quizData.vela];
    const chaptersMap = new Map();

    allQuizzes.forEach(quiz => {
        const chapter = quiz.CAPITOLO?.trim();
        const theme = quiz.TEMA?.trim();
        const entry = quiz.VOCE?.trim();

        if (chapter) {
            if (!chaptersMap.has(chapter)) {
                chaptersMap.set(chapter, new Map());
            }
            const themesMap = chaptersMap.get(chapter);
            
            if (theme) {
                if (!themesMap.has(theme)) {
                    themesMap.set(theme, new Set());
                }
                if (entry) {
                    themesMap.get(theme).add(entry);
                }
            }
        }
    });

    // Sort chapters alphabetically
    state.availableFilters.chapters = new Map([...chaptersMap.entries()].sort());

    // Build the filter UI
    buildFilterUI();
}

// Build filter UI with hierarchical checkboxes (3 levels: CAPITOLO > TEMA > VOCE)
function buildFilterUI() {
    filterTree.innerHTML = '';

    state.availableFilters.chapters.forEach((themesMap, chapter) => {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'filter-chapter collapsed';

        // Capitolo checkbox
        const chapterLabel = document.createElement('label');
        chapterLabel.className = 'filter-chapter-label';
        
        // Add collapse icon
        const collapseIcon = document.createElement('span');
        collapseIcon.className = 'collapse-icon';
        collapseIcon.textContent = '▼';
        chapterLabel.appendChild(collapseIcon);
        
        const chapterCheckbox = document.createElement('input');
        chapterCheckbox.type = 'checkbox';
        chapterCheckbox.dataset.chapter = chapter;
        chapterCheckbox.checked = state.filters.chapters.has(chapter);
        
        const updateChapterState = () => {
            const themeCheckboxes = [...chapterDiv.querySelectorAll('.filter-theme-label input[type="checkbox"]')];
            const totalThemes = themeCheckboxes.length;
            const checkedThemes = themeCheckboxes.filter(cb => cb.checked).length;
            const hasPartialTheme = themeCheckboxes.some(cb => cb.indeterminate);
            chapterCheckbox.checked = totalThemes > 0 && checkedThemes === totalThemes;
            chapterCheckbox.indeterminate = (checkedThemes > 0 && checkedThemes < totalThemes) || hasPartialTheme;
        };

        chapterCheckbox.addEventListener('change', (e) => {
            e.stopPropagation();
            if (e.target.checked) {
                state.filters.chapters.add(chapter);
                // Also select all themes and entries under this chapter
                themesMap.forEach((entries, theme) => {
                    state.filters.themes.add(theme);
                    entries.forEach(entry => state.filters.entries.add(entry));
                });
                // Update all nested checkboxes
                chapterDiv.querySelectorAll('input[type=\"checkbox\"]').forEach(cb => cb.checked = true);
                // Clear partial states
                chapterDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.indeterminate = false);
            } else {
                state.filters.chapters.delete(chapter);
                // Also deselect all themes and entries under this chapter
                themesMap.forEach((entries, theme) => {
                    state.filters.themes.delete(theme);
                    entries.forEach(entry => state.filters.entries.delete(entry));
                });
                // Update all nested checkboxes
                chapterDiv.querySelectorAll('input[type=\"checkbox\"]').forEach(cb => cb.checked = false);
                chapterDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.indeterminate = false);
            }
            updateChapterState();
        });

        // Prevent checkbox clicks from bubbling to the label
        chapterCheckbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Add click handler to label for collapsing
        chapterLabel.addEventListener('click', (e) => {
            if (e.target === chapterCheckbox) return;
            e.preventDefault();
            chapterDiv.classList.toggle('collapsed');
        });

        chapterLabel.appendChild(chapterCheckbox);
        chapterLabel.appendChild(document.createTextNode(chapter));
        chapterDiv.appendChild(chapterLabel);

        // Themes container
        if (themesMap.size > 0) {
            const themesDiv = document.createElement('div');
            themesDiv.className = 'filter-themes';

            // Sort themes alphabetically
            const sortedThemes = [...themesMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

            sortedThemes.forEach(([theme, entries]) => {
                const themeDiv = document.createElement('div');
                themeDiv.className = 'filter-theme collapsed';

                // Theme checkbox
                const themeLabel = document.createElement('label');
                themeLabel.className = 'filter-theme-label';
                
                // Add collapse icon
                const themeCollapseIcon = document.createElement('span');
                themeCollapseIcon.className = 'collapse-icon';
                themeCollapseIcon.textContent = '▼';
                themeLabel.appendChild(themeCollapseIcon);
                
                const themeCheckbox = document.createElement('input');
                themeCheckbox.type = 'checkbox';
                themeCheckbox.dataset.theme = theme;
                themeCheckbox.dataset.chapter = chapter;
                themeCheckbox.checked = state.filters.themes.has(theme);

                const updateThemeState = () => {
                    const entryCheckboxes = [...themeDiv.querySelectorAll('.filter-entry-label input[type="checkbox"]')];
                    const totalEntries = entryCheckboxes.length;
                    const checkedEntries = entryCheckboxes.filter(cb => cb.checked).length;
                    themeCheckbox.checked = totalEntries > 0 && checkedEntries === totalEntries;
                    themeCheckbox.indeterminate = checkedEntries > 0 && checkedEntries < totalEntries;
                    updateChapterState();
                };
                
                themeCheckbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    if (e.target.checked) {
                        state.filters.themes.add(theme);
                        // Also select all entries under this theme
                        entries.forEach(entry => state.filters.entries.add(entry));
                        // Update entry checkboxes
                        themeDiv.querySelectorAll('.filter-entry-label input').forEach(cb => cb.checked = true);
                        
                        updateThemeState();
                        // Ensure chapter selection reflects current state
                        if (chapterCheckbox.indeterminate || chapterCheckbox.checked) {
                            state.filters.chapters.add(chapter);
                        }
                    } else {
                        state.filters.themes.delete(theme);
                        // Also deselect all entries under this theme
                        entries.forEach(entry => state.filters.entries.delete(entry));
                        // Update entry checkboxes
                        themeDiv.querySelectorAll('.filter-entry-label input').forEach(cb => cb.checked = false);
                        themeCheckbox.indeterminate = false;
                        themeCheckbox.checked = false;
                        updateThemeState();
                        // If nothing selected under chapter, drop chapter from filters
                        const anyThemeSelected = [...themesMap.keys()].some(t => state.filters.themes.has(t));
                        if (!anyThemeSelected) {
                            state.filters.chapters.delete(chapter);
                        }
                    }
                    updateChapterState();
                });

                // Prevent checkbox clicks from bubbling to the label
                themeCheckbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                // Add click handler to label for collapsing
                themeLabel.addEventListener('click', (e) => {
                    if (e.target === themeCheckbox) return;
                    e.preventDefault();
                    themeDiv.classList.toggle('collapsed');
                });

                themeLabel.appendChild(themeCheckbox);
                themeLabel.appendChild(document.createTextNode(theme));
                themeDiv.appendChild(themeLabel);

                // Entries container
                if (entries.size > 0) {
                    const entriesDiv = document.createElement('div');
                    entriesDiv.className = 'filter-entries';

                    // Sort entries alphabetically
                    const sortedEntries = [...entries].sort();

                    sortedEntries.forEach(entry => {
                        const entryLabel = document.createElement('label');
                        entryLabel.className = 'filter-entry-label';

                        const entryCheckbox = document.createElement('input');
                        entryCheckbox.type = 'checkbox';
                        entryCheckbox.dataset.entry = entry;
                        entryCheckbox.dataset.theme = theme;
                        entryCheckbox.dataset.chapter = chapter;
                        entryCheckbox.checked = state.filters.entries.has(entry);

                        entryCheckbox.addEventListener('change', (e) => {
                            if (e.target.checked) {
                                state.filters.entries.add(entry);
                            } else {
                                state.filters.entries.delete(entry);
                            }
                            updateThemeState();
                        });

                        entryLabel.appendChild(entryCheckbox);
                        entryLabel.appendChild(document.createTextNode(entry));
                        entriesDiv.appendChild(entryLabel);
                    });

                    themeDiv.appendChild(entriesDiv);
                    // Initialize indeterminate state after building entries
                    updateThemeState();
                }

                themesDiv.appendChild(themeDiv);
            });

            chapterDiv.appendChild(themesDiv);
            // Initialize chapter state after themes are added
            updateChapterState();
        }

        filterTree.appendChild(chapterDiv);
    });
}

// Filter modal functions
function openFilterModal() {
    filterModal.classList.add('active');
}

function closeFilterModal() {
    filterModal.classList.remove('active');
}

function applyFilters() {
    closeFilterModal();
    // Update button text to show filters are active
    const filterCount = state.filters.chapters.size + state.filters.themes.size + state.filters.entries.size;
    if (filterCount > 0) {
        openFilterBtn.textContent = `Seleziona chapters/Temi/Voci (${filterCount} attivi)`;
    } else {
        openFilterBtn.textContent = 'Seleziona chapters/Temi/Voci';
    }
    saveOptionsToCookie();
}

function selectAllFilters() {
    state.availableFilters.chapters.forEach((themesMap, chapter) => {
        state.filters.chapters.add(chapter);
        themesMap.forEach((entries, theme) => {
            state.filters.themes.add(theme);
            entries.forEach(entry => state.filters.entries.add(entry));
        });
    });
    buildFilterUI();
}

function deselectAllFilters() {
    state.filters.chapters.clear();
    state.filters.themes.clear();
    state.filters.entries.clear();
    buildFilterUI();
    saveOptionsToCookie();
}

// Options persistence
function saveOptionsToCookie() {
    const payload = {
        order: state.quizOrder,
        chapters: [...state.filters.chapters],
        themes: [...state.filters.themes],
        entries: [...state.filters.entries]
    };
    setCookie(OPTIONS_COOKIE, JSON.stringify(payload));
}

function loadOptionsFromCookie() {
    const raw = getCookie(OPTIONS_COOKIE);
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        if (data.order) state.quizOrder = data.order;
        state.filters.chapters = new Set(data.chapters || []);
        state.filters.themes = new Set(data.themes || []);
        state.filters.entries = new Set(data.entries || []);
        const filterCount = state.filters.chapters.size + state.filters.themes.size + state.filters.entries.size;
        openFilterBtn.textContent = filterCount > 0 ? `Seleziona chapters/Temi/Voci (${filterCount} attivi)` : 'Seleziona chapters/Temi/Voci';
    } catch (e) {
        console.warn('Failed to parse options cookie', e);
    }
}

// Shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// Display Quiz
function displayQuiz() {
    const quiz = state.allQuizzes[state.currentIndex];

    // Update counter with stats
    const remaining = state.allQuizzes.length - state.answeredQuizzes.size;
    quizCounter.innerHTML = `
        <span class="stat-correct">${state.correctCount}</span> / 
        <span class="stat-incorrect">${state.incorrectCount}</span> / 
        <span class="stat-remaining">${remaining}</span>
    `;
    quizId.textContent = `ID: ${quiz.ID}`;

    // Display image if available
    if (quiz.IMMAGINE && quiz.IMMAGINE.trim()) {
        const imageMatch = quiz.IMMAGINE.match(/Figura\s+(\d+)/i);
        if (imageMatch) {
            const imageNumber = imageMatch[1].padStart(3, '0');
            const imageUrl = `${DATA_ROOT}/figures/${imageNumber}.jpg`;
            
            // Show loading state immediately
            quizImageContainer.classList.remove('hidden');
            quizImageContainer.classList.add('loading');
            quizImage.classList.add('loading');
            
            // Preload the image
            const tempImage = new Image();
            tempImage.onload = () => {
                quizImage.src = imageUrl;
                quizImage.classList.remove('loading');
                quizImageContainer.classList.remove('loading');
            };
            tempImage.onerror = () => {
                // Hide container if image fails to load
                quizImageContainer.classList.add('hidden');
                quizImageContainer.classList.remove('loading');
            };
            tempImage.src = imageUrl;
        } else {
            quizImageContainer.classList.add('hidden');
            quizImageContainer.classList.remove('loading');
        }
    } else {
        quizImageContainer.classList.add('hidden');
        quizImageContainer.classList.remove('loading');
    }

    // Display question
    quizQuestionText.textContent = quiz.DOMANDA;

    // Clear previous answers
    quizAnswers.innerHTML = '';
    state.selectedAnswer = null;
    nextBtn.disabled = true;

    // Display answers based on quiz type
    if (quiz.type === 'base') {
        displayBaseQuizAnswers(quiz);
    } else if (quiz.type === 'vela') {
        displayVelaQuizAnswers(quiz);
    }

    // Update navigation buttons
    prevBtn.disabled = state.currentIndex === 0;

    // If quiz was already answered, show the previous answer
    if (state.answeredQuizzes.has(state.currentIndex)) {
        // Quiz was already answered, restore the answer state
        const answerData = state.answeredQuizzes.get(state.currentIndex);
        const selectedIndex = answerData.answerIndex;
        const wasCorrect = answerData.isCorrect;
        const allButtons = quizAnswers.querySelectorAll('.answer-option');
        
        allButtons.forEach((btn, index) => {
            btn.classList.add('disabled');
            
            if (index === selectedIndex) {
                // This was the selected answer
                if (wasCorrect) {
                    btn.classList.add('correct');
                } else {
                    btn.classList.add('incorrect');
                }
            }
            
            // Always highlight the correct answer if the selected answer was wrong
            if (btn.dataset.correct === 'true' && index !== selectedIndex) {
                btn.classList.add('correct');
            }
        });
        
        nextBtn.disabled = false;
    }
}

// Display Base Quiz Answers (3 options)
function displayBaseQuizAnswers(quiz) {
    const answers = [
        { text: quiz['RISPOSTA 1'], isCorrect: quiz['RISPOSTA 1 V/F'] === 'V' },
        { text: quiz['RISPOSTA 2'], isCorrect: quiz['RISPOSTA 2 V/F'] === 'V' },
        { text: quiz['RISPOSTA 3'], isCorrect: quiz['RISPOSTA 3 V/F'] === 'V' }
    ];

    answers.forEach((answer, index) => {
        if (!answer.text) return;

        const button = document.createElement('button');
        button.className = 'answer-option';
        button.textContent = answer.text;
        button.dataset.correct = answer.isCorrect;
        button.dataset.index = index;

        button.addEventListener('click', () => selectAnswer(button, quiz));

        quizAnswers.appendChild(button);
    });
}

// Display Vela Quiz Answers (True/False)
function displayVelaQuizAnswers(quiz) {
    const answers = [
        { text: quiz['RISPOSTA 1'], isCorrect: quiz['RISPOSTA 1 V/F'] === 'V' },
        { text: quiz['RISPOSTA 2'], isCorrect: quiz['RISPOSTA 2 V/F'] === 'V' }
    ];

    answers.forEach((answer, index) => {
        if (!answer.text) return;

        const button = document.createElement('button');
        button.className = 'answer-option';
        button.textContent = answer.text;
        button.dataset.correct = answer.isCorrect;
        button.dataset.index = index;

        button.addEventListener('click', () => selectAnswer(button, quiz));

        quizAnswers.appendChild(button);
    });
}

// Select Answer
function selectAnswer(selectedButton, quiz) {
    // Prevent selection if already answered
    if (state.answeredQuizzes.has(state.currentIndex)) {
        return;
    }

    const allButtons = quizAnswers.querySelectorAll('.answer-option');
    const isCorrect = selectedButton.dataset.correct === 'true';

    // Disable all buttons
    allButtons.forEach(btn => btn.classList.add('disabled'));

    // Mark selected answer
    selectedButton.classList.add('selected');

    // Show feedback
    if (isCorrect) {
        selectedButton.classList.remove('selected');
        selectedButton.classList.add('correct');
    } else {
        selectedButton.classList.remove('selected');
        selectedButton.classList.add('incorrect');

        // Highlight correct answer
        allButtons.forEach(btn => {
            if (btn.dataset.correct === 'true') {
                btn.classList.add('correct');
            }
        });
    }

    // Mark quiz as answered and enable next button
    state.answeredQuizzes.set(state.currentIndex, {
        answerIndex: parseInt(selectedButton.dataset.index),
        isCorrect: isCorrect
    });
    
    // Update counters
    if (isCorrect) {
        state.correctCount++;
    } else {
        state.incorrectCount++;
    }
    
    // Update spaced repetition data if in spaced repetition mode
    if (state.quizOrder === 'spaced-repetition') {
        const quizKey = `${quiz.type}:${quiz.ID}`;
        const currentData = state.spacedRepetition.get(quizKey) || initializeSpacedRepetitionItem(quizKey);
        
        // Convert correctness to quality score (0-5 scale)
        // For simplicity: correct = 4 (good), incorrect = 0 (fail)
        // Note: More sophisticated quality assessment (based on answer time, confidence, etc.)
        // could be implemented in the future, but binary feedback works well for MVP
        const quality = isCorrect ? 4 : 0;
        
        // Calculate new spaced repetition data
        const newData = calculateSpacedRepetition(currentData, quality);
        state.spacedRepetition.set(quizKey, newData);
        saveSpacedRepetitionData();
    }
    
    // Update the display
    displayQuiz();
    
    nextBtn.disabled = false;
    saveSessionToCookie();
}

// Reset response cache
function resetResponseCache() {
    deleteCookie(SESSION_COOKIE);
    localStorage.removeItem(SESSION_COOKIE);
    state.answeredQuizzes.clear();
    state.correctCount = 0;
    state.incorrectCount = 0;
    // Keep current quiz order and index, just clear answers and refresh UI
    if (state.allQuizzes.length > 0) {
        displayQuiz();
    }
    alert('Cache risposte eliminata. Le risposte salvate sono state cancellate.');
}

// Navigate to Previous Quiz
function navigatePrevious() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        displayQuiz();
        saveSessionToCookie();
    }
}

// Navigate to Next Quiz
function navigateNext() {
    if (state.currentIndex < state.allQuizzes.length - 1) {
        state.currentIndex++;
        displayQuiz();
        saveSessionToCookie();
    } else {
        // Quiz completed
        alert(`Quiz completato! Hai risposto a ${state.answeredQuizzes.size} domande su ${state.allQuizzes.length}.`);
        saveSessionToCookie();
    }
}

// Back to Setup
function backToSetup() {
    quizScreen.classList.remove('active');
    setupScreen.classList.add('active');
    header.style.display = 'block';
    state.allQuizzes = [];
    state.currentIndex = 0;
    state.answeredQuizzes.clear();
    state.correctCount = 0;
    state.incorrectCount = 0;
    deleteCookie(SESSION_COOKIE);
}

// Viewport height fallback for mobile browsers (iOS Safari, etc.)
function updateVhVar() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    updateVhVar();
    initializeApp();
});

// Update on resize/orientation changes
window.addEventListener('resize', updateVhVar);
window.addEventListener('orientationchange', updateVhVar);
