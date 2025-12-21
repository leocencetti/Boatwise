// Application State
const state = {
    quizType: 'base',
    quizOrder: 'sequential',
    allQuizzes: [],
    currentIndex: 0,
    selectedAnswer: null,
    answeredQuizzes: new Map(), // Maps quiz index to {answerIndex, isCorrect}
    correctCount: 0,
    incorrectCount: 0
};

const DATA_ROOT = './data';

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

    // Setup event listeners
    startQuizBtn.addEventListener('click', () => startQuiz(quizData));
    backToSetupBtn.addEventListener('click', backToSetup);
    prevBtn.addEventListener('click', navigatePrevious);
    nextBtn.addEventListener('click', navigateNext);

    // Quiz type radio buttons
    document.querySelectorAll('input[name="quiz-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.quizType = e.target.value;
        });
    });

    // Quiz order radio buttons
    document.querySelectorAll('input[name="quiz-order"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.quizOrder = e.target.value;
        });
    });
}

// Start Quiz
function startQuiz(quizData) {
    // Prepare quiz list based on selected type
    let quizzes = [];

    if (state.quizType === 'base') {
        quizzes = [...quizData.base];
    } else if (state.quizType === 'vela') {
        quizzes = [...quizData.vela];
    } else if (state.quizType === 'both') {
        quizzes = [...quizData.base, ...quizData.vela];
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

    // Show quiz screen
    setupScreen.classList.remove('active');
    quizScreen.classList.add('active');
    header.style.display = 'none';

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
            quizImage.src = `${DATA_ROOT}/figures/${imageNumber}.jpg`;
            quizImageContainer.classList.remove('hidden');
        } else {
            quizImageContainer.classList.add('hidden');
        }
    } else {
        quizImageContainer.classList.add('hidden');
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
    
    // Update the display
    displayQuiz();
    
    nextBtn.disabled = false;
}

// Navigate to Previous Quiz
function navigatePrevious() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        displayQuiz();
    }
}

// Navigate to Next Quiz
function navigateNext() {
    if (state.currentIndex < state.allQuizzes.length - 1) {
        state.currentIndex++;
        displayQuiz();
    } else {
        // Quiz completed
        alert(`Quiz completato! Hai risposto a ${state.answeredQuizzes.size} domande su ${state.allQuizzes.length}.`);
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
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
