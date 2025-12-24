# Testing Spaced Repetition Feature

## Local Testing

To test the spaced repetition feature locally:

1. **Clone the branch:**
   ```bash
   git clone https://github.com/leocencetti/Boatwise.git
   cd Boatwise
   git checkout copilot/add-spaced-repetition-mode
   ```

2. **Start a local server:**
   
   Using Python:
   ```bash
   cd app
   python3 -m http.server 8080
   ```
   
   Or using Node.js:
   ```bash
   cd app
   npx http-server -p 8080
   ```

3. **Open in browser:**
   Navigate to `http://localhost:8080`

## Testing the Spaced Repetition Feature

1. **Select the mode:**
   - On the setup screen, select "Ripetizione Spaziata" (Spaced Repetition)
   - Click "Inizia Quiz" to start

2. **Answer some quizzes:**
   - Answer some quizzes correctly and some incorrectly
   - Notice how the counter tracks: correct / incorrect / remaining

3. **Verify persistence:**
   - Click "Torna alla Selezione" to return to setup
   - Close and reopen the browser
   - Start a new quiz with "Ripetizione Spaziata" mode
   - The spaced repetition data should persist (quizzes will be ordered by review schedule)

4. **Check localStorage:**
   - Open browser DevTools (F12)
   - Go to Application > Local Storage
   - Find `boatwise_spaced_repetition` to see the stored data

## Expected Behavior

- **Initial run:** All quizzes are due for review and ordered by ID
- **After answering correctly:** Quiz interval increases (1 day, then 6 days, then multiplied by easiness factor)
- **After answering incorrectly:** Quiz interval resets to 1 day, easiness decreases
- **Due quizzes:** Appear first in the list
- **Harder quizzes:** Among due quizzes, harder ones (lower easiness) appear first

## Deployment to GitHub Pages

The application is configured to deploy automatically from the `main` branch. To deploy this feature:

1. Merge this PR into `main`
2. GitHub Actions will automatically deploy to GitHub Pages
3. Access at: https://leocencetti.github.io/Boatwise/

## Alternative: Preview Deployment

To create a preview deployment for this PR, you could:

1. Add a workflow file that deploys PR branches to a preview URL
2. Or manually deploy using GitHub Pages from this branch (requires repository settings change)
