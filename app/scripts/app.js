import { lang } from './lang.it.js'
import { DOM } from './dom.js';
import { state } from './state.js'
import { loadQuizData, getFigureURL } from './quiz_data.js';
import { extractFilters, buildFilterUI, openFilterModal, closeFilterModal, applyFilters, selectAllFilters, deselectAllFilters } from "./filters.js";
import { loadOptionsFromCookie, saveSessionToCookie, loadSessionFromCookie, saveOptionsToCookie, deleteCookie, SESSION_COOKIE } from './cookies.js';


// Initialize App
async function initializeApp() {
    console.info("Hey 👋, welcome to Boatwise! Please, look around!");


    const quizData = await loadQuizData();

    // Extract available filters from quiz data
    extractFilters(state, quizData);

    // Load options and session from cookies (resume if available)
    loadOptionsFromCookie(state);
    buildFilterUI(state);
    if (loadSessionFromCookie(state, quizData)) {
        displayQuiz();
    }

    // Setup event listeners
    DOM.startQuizBtn.addEventListener('click', () => startQuiz(quizData));
    DOM.backToSetupBtn.addEventListener('click', backToSetup);
    DOM.prevBtn.addEventListener('click', navigatePrevious);
    DOM.nextBtn.addEventListener('click', navigateNext);
    DOM.openFilterBtn.addEventListener('click', openFilterModal);
    DOM.closeFilterBtn.addEventListener('click', closeFilterModal);
    DOM.applyFilterBtn.addEventListener('click', function () { applyFilters(state); });
    DOM.selectAllBtn.addEventListener('click', function () { selectAllFilters(state); });
    DOM.deselectAllBtn.addEventListener('click', function () { deselectAllFilters(state); });
    DOM.resetCacheBtn.addEventListener('click', resetResponseCache);

    // Close modal on backdrop click
    DOM.filterModal.addEventListener('click', (e) => {
        if (e.target === DOM.filterModal) {
            closeFilterModal();
        }
    });

    // Quiz order radio buttons
    document.querySelectorAll('input[name="quiz-order"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.quizOrder = e.target.value;
            saveOptionsToCookie(state);
        });
    });

    // Initialize quizOrder from the currently checked radio (default is Sequenziale)
    const checkedOrder = document.querySelector('input[name="quiz-order"]:checked');
    if (checkedOrder) {
        state.quizOrder = checkedOrder.value;
    }

    console.info("Boatwise loaded successfully 👍.");
}

// Start Quiz
function startQuiz(quizData) {
    // Start with all quizzes (both basic and sailing)
    let quizzes = [...quizData.basic, ...quizData.sailing];

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
        alert(lang.alerts.errors.empty_selection);
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

    state.allQuizzes = quizzes;
    state.currentIndex = 0;
    state.answeredQuizzes.clear();
    state.correctCount = 0;
    state.incorrectCount = 0;

    // Save session cookie (ordered quiz list + index + answers)
    saveSessionToCookie(state);

    // Show quiz screen
    DOM.setupScreen.classList.remove('active');
    DOM.quizScreen.classList.add('active');
    DOM.header.style.display = 'none';

    // Display first quiz
    displayQuiz();
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
    DOM.quizCounter.innerHTML = `
        <span class="stat-correct">${state.correctCount}</span> / 
        <span class="stat-incorrect">${state.incorrectCount}</span> / 
        <span class="stat-remaining">${remaining}</span>
    `;
    DOM.quizId.textContent = `ID: ${quiz.ID}`;

    // Display image if available
    const imageUrl = getFigureURL(quiz);
    if (imageUrl) {
        // Show loading state immediately
        DOM.quizImageContainer.classList.remove('hidden');
        DOM.quizImageContainer.classList.add('loading');
        DOM.quizImage.classList.add('loading');

        // Preload the image
        const tempImage = new Image();
        tempImage.onload = () => {
            DOM.quizImage.src = imageUrl;
            DOM.quizImage.classList.remove('loading');
            DOM.quizImageContainer.classList.remove('loading');
        };
        tempImage.onerror = () => {
            // Hide container if image fails to load
            DOM.quizImageContainer.classList.add('hidden');
            DOM.quizImageContainer.classList.remove('loading');
        };
        tempImage.src = imageUrl;
    } else {
        DOM.quizImageContainer.classList.add('hidden');
        DOM.quizImageContainer.classList.remove('loading');
    }

    // Display question
    DOM.quizQuestionText.textContent = quiz.DOMANDA;

    // Clear previous answers
    DOM.quizAnswers.innerHTML = '';
    state.selectedAnswer = null;
    DOM.nextBtn.disabled = true;

    // Display answers based on quiz type
    if (quiz.type === 'basic') {
        displayBasicQuizAnswers(quiz);
    } else if (quiz.type === 'sailing') {
        displaySailingQuizAnswers(quiz);
    }

    // Update navigation buttons
    DOM.prevBtn.disabled = state.currentIndex === 0;

    // If quiz was already answered, show the previous answer
    if (state.answeredQuizzes.has(state.currentIndex)) {
        // Quiz was already answered, restore the answer state
        const answerData = state.answeredQuizzes.get(state.currentIndex);
        const selectedIndex = answerData.answerIndex;
        const wasCorrect = answerData.isCorrect;
        const allButtons = DOM.quizAnswers.querySelectorAll('.answer-option');

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

        DOM.nextBtn.disabled = false;
    }
}

// Display Base Quiz Answers (3 options)
function displayBasicQuizAnswers(quiz) {
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

        DOM.quizAnswers.appendChild(button);
    });
}

// Display Sailing Quiz Answers (True/False)
function displaySailingQuizAnswers(quiz) {
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

        DOM.quizAnswers.appendChild(button);
    });
}

// Select Answer
function selectAnswer(selectedButton, quiz) {
    // Prevent selection if already answered
    if (state.answeredQuizzes.has(state.currentIndex)) {
        return;
    }

    const allButtons = DOM.quizAnswers.querySelectorAll('.answer-option');
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

    // Update the display
    displayQuiz();

    DOM.nextBtn.disabled = false;
    saveSessionToCookie(state);
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
    alert(lang.alerts.info.cache_cleared);
}

// Navigate to Previous Quiz
function navigatePrevious() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        displayQuiz();
        saveSessionToCookie(state);
    }
}

// Navigate to Next Quiz
function navigateNext() {
    if (state.currentIndex < state.allQuizzes.length - 1) {
        state.currentIndex++;
        displayQuiz();
        saveSessionToCookie(state);
    } else {
        // Quiz completed
        alert(lang.alerts.info.quiz_completed)
        saveSessionToCookie(state);
    }
}

// Back to Setup
function backToSetup() {
    DOM.quizScreen.classList.remove('active');
    DOM.setupScreen.classList.add('active');
    DOM.header.style.display = 'block';
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
