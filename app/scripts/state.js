// Application State
export const state = {
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
    }
};
