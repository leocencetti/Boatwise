import { DOM } from './dom.js';
import { saveOptionsToCookie } from './cookies.js';

// Extract available filters from quiz data
export function extractFilters(state, quizData) {
    const allQuizzes = [...quizData.basic, ...quizData.sailing];
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
    buildFilterUI(state);
}

// Build filter UI with hierarchical checkboxes (3 levels: CAPITOLO > TEMA > VOCE)
export function buildFilterUI(state) {
    DOM.filterTree.innerHTML = '';

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

        DOM.filterTree.appendChild(chapterDiv);
    });
}

// Filter modal functions
export function openFilterModal() {
    DOM.filterModal.classList.add('active');
}

export function closeFilterModal() {
    DOM.filterModal.classList.remove('active');
}

export function applyFilters(state) {
    closeFilterModal();
    // Update button text to show filters are active
    const filterCount = state.filters.chapters.size + state.filters.themes.size + state.filters.entries.size;
    if (filterCount > 0) {
        DOM.openFilterBtn.textContent = `Seleziona Capitoli/Temi/Voci (${filterCount} attivi)`;
    } else {
        DOM.openFilterBtn.textContent = 'Seleziona Capitoli/Temi/Voci';
    }
    saveOptionsToCookie(state);
}

export function selectAllFilters(state) {
    state.availableFilters.chapters.forEach((themesMap, chapter) => {
        state.filters.chapters.add(chapter);
        themesMap.forEach((entries, theme) => {
            state.filters.themes.add(theme);
            entries.forEach(entry => state.filters.entries.add(entry));
        });
    });
    buildFilterUI(state);
}

export function deselectAllFilters(state) {
    state.filters.chapters.clear();
    state.filters.themes.clear();
    state.filters.entries.clear();
    buildFilterUI(state);
    saveOptionsToCookie(state);
}
