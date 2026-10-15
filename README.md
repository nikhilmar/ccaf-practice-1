# CCA-F Practice

A static React practice app for GitHub Pages, with a 350-question bank. Every exam draws 60 questions at random and runs for 120 minutes. The draw is domain-balanced: 16 agentic architecture and orchestration, 12 Claude Code configuration and workflows, 12 prompt engineering and structured output, 11 tool design and MCP integration, and 9 context management and reliability questions. Answers, past attempts, and a resumable session are saved in the browser with IndexedDB.

## Publish on GitHub Pages

1. Add this folder’s files to a GitHub repository and push them to its main or master branch.
2. In the repository, open **Settings → Pages** and set the publishing source to **GitHub Actions**.
3. The included .github/workflows/pages.yml deploys the site after each push. Find the published URL under the repository’s **Settings → Pages** or the workflow deployment summary.
4. Open that Pages URL whenever you want to practice; no local server or install is needed.

The site uses relative asset and question-bank URLs, so it works at both a user site and a repository site path. React and Babel load from the unpkg CDN, so the hosted app needs an internet connection.

## Optional local preview

On Windows, install Node.js and double-click start.bat. Keep the server window open while using the local preview. This is optional once the GitHub Pages site is published.

## Data and privacy

Attempts are saved locally in IndexedDB in the browser profile and origin where you use the app. Local-preview history will not appear on the GitHub Pages origin, and clearing that browser’s site data removes the saved history. No backend or account is used. The question bank is bundled in public/question-bank.json; each completed attempt includes a score breakdown by domain.
