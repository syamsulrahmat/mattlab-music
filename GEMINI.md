# MattLab Guidelines & Custom Rules

## Slash Commands Protocol

### 1. `/discuss <topic or idea>`
- **Zero Immediate Execution**: NEVER execute terminal commands, run scripts, create files, or modify code when `/discuss` is received.
- **Architectural Deliberation**: Break down technical architecture, system components, trade-offs, pros & cons, and performance implications.
- **Clarification & Options**: Ask clarifying questions if any ambiguity exists and propose clear decision paths.
- **Strict Stop**: Stop completely and await the `/proceed` command before taking any action.

### 2. `/proceed [instructions]`
- **Execution Green Light**: Signals explicit authorization to begin implementing the agreed architecture or plan.
- **Step-by-Step Implementation**: Proceed with development, testing, and deployment.

### 3. `/push [custom note]`
- **Automated Git Sync**:
  1. Stage all modified and new files (`git add -A`).
  2. Commit with a detailed, structured commit message summarizing recent changes and features (or the user-provided note if provided).
  3. Push to GitHub (`git push origin main` or current branch).
  4. Send an automatic notification summary to Telegram using `/usr/local/bin/tg-notify`.
  5. Reply with the commit message, commit hash, and GitHub status.

## Telegram Notifications Workflow (@mattlabunraid_bot)
1. **Auto-Pilot Notifications**: Whenever any system configuration, Docker container setup, network tweak, script installation, or notable task on MattLab is completed, automatically send a clean summary notification to the user's Telegram bot using `/usr/local/bin/tg-notify "<summary>"`.
2. **`tg-notify` / `tg` Chat Trigger**:
   - When the user sends `tg-notify` or `tg` with no arguments, compile a comprehensive summary of latest changes, server status, and active URLs, and push it to Telegram immediately.
   - When the user includes specific text (e.g. `tg-notify <message>`), send that specified message to the bot.

## Branching & Risk Management
- **Proactive Feature Branching**: Always suggest and use a dedicated `feature/<name>` branch during planning (`/plan`) or whenever executing risky changes (e.g. database schema migrations, background services/crawlers, audio playback pipeline, authentication overhauls). Keep `main` clean, stable, and operational for daily listening.
- **Merge After Verification**: Only merge into `main` after the feature has been verified and tested.

## 4-Point Green Light Verification Protocol
Before merging any feature branch or major update into `main`, always present an interactive 4-point verification checklist tailored specifically to the changes:
1. **The "Happy Path" (Core Experience)**: Clear step-by-step instructions verifying the primary feature or enhancement works as expected.
2. **The "Edge Cases" (Unusual Situations)**: Boundary conditions (e.g. empty / incognito localStorage, cold boot, track completion / 0:00 boundary, rapid user interactions).
3. **The "Regression Checks" (Existing Core Features)**: Verification that critical adjacent features remain completely intact (e.g. queue continuity, new song selection, lyrics sync, scrubber navigation).
4. **The "Clean Logs Check" (Zero Errors)**: Browser DevTools console inspection (zero uncaught exceptions / red errors) and clean production build verification.


