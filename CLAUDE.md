# Think & Make PWA — Claude Code Instructions

## Project Overview
Google Apps Script web app (PWA) for the Think & Make programme. The codebase lives in this repo and is synced to Google Apps Script via `clasp`.

## After Every Code Change — Always Do This

### 1. Push to Apps Script
```
clasp push --force
```

### 2. Deploy the live versioned web app
```
clasp deploy --deploymentId AKfycbyRWOzhC12yIn9Lnlrzo088n1t-mhsuzMK7Ua0ZEuQjmht-N7VuvZ1jq6b4bfVcK_lX7g --description "<short description of change>"
```
`clasp push` alone does NOT update the live app — the deploy step is mandatory every time.

### 3. Push to both Git remotes
This repo has two remotes — always push to both:
```
git push origin <branch>
git push iif <branch>
```
- `origin` → https://github.com/Geetha-Inquilab/tm_pwa_test
- `iif` → https://github.com/IIF-2026/tm-form

## Git Workflow
- Work on feature branches, not directly on `main` or `multiobservations`
- Create PRs into `multiobservations` (not directly into `main`)
- Commit messages should be descriptive (what changed and why)

## Key Files
- `Code.gs` — all server-side logic (Google Apps Script)
- `index.html` — entire frontend (single-file PWA)
- `appsscript.json` — Apps Script manifest

## Deployment ID
Live versioned deployment: `AKfycbyRWOzhC12yIn9Lnlrzo088n1t-mhsuzMK7Ua0ZEuQjmht-N7VuvZ1jq6b4bfVcK_lX7g`
