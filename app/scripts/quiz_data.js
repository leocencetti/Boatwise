import { parseCSV } from './csv.js';
import { lang } from './lang.it.js';

const DATA_ROOT = './data';
const BASIC_QUIZ_URL = `${DATA_ROOT}/quiz_base.csv`;
const SAILING_QUIZ_URL = `${DATA_ROOT}/quiz_vela.csv`;
const REMOVED_QUIZ_URL = `${DATA_ROOT}/quiz_base.rimossi_2024.csv`;
const FIGURE_ROOT = `${DATA_ROOT}/figures`;


// Load Quiz Data
export async function loadQuizData() {
    try {
        const [basicResponse, sailingResponse, removedResponse] =
            await Promise.all([
                fetch(BASIC_QUIZ_URL), fetch(SAILING_QUIZ_URL),
                fetch(REMOVED_QUIZ_URL)
            ]);

        const basicText = await basicResponse.text();
        const sailingText = await sailingResponse.text();
        const removedText = await removedResponse.text();

        const basicQuizzes = parseCSV(basicText);
        const sailingQuizzes = parseCSV(sailingText);
        const removedQuizzes = parseCSV(removedText);

        // Get IDs of removed quizzes
        const removedIds = new Set(removedQuizzes.map(q => q.ID).filter(id => id));

        // Filter out removed quizzes from basic
        const filteredBasicQuizzes =
            basicQuizzes.filter(q => q.ID && !removedIds.has(q.ID))
                .map(q => ({ ...q, type: 'basic' }));

        const filteredSailingQuizzes =
            sailingQuizzes.filter(q => q.ID).map(q => ({ ...q, type: 'sailing' }));

        return { basic: filteredBasicQuizzes, sailing: filteredSailingQuizzes };
    } catch (error) {
        console.error('Error loading quiz data:', error);
        alert(lang.alerts.errors.load_failed);
        return { basic: [], sailing: [] };
    }
}

export function getFigureURL(quiz) {
    if (quiz.IMMAGINE && quiz.IMMAGINE.trim()) {
        const imageMatch = quiz.IMMAGINE.match(/Figura\s+(\d+)/i);
        if (imageMatch) {
            const imageNumber = imageMatch[1].padStart(3, '0');
            return `${FIGURE_ROOT}/${imageNumber}.jpg`;
        } else {
            console.error('Invalid image format in quiz:', quiz);
        }
    }
    return null;
}
