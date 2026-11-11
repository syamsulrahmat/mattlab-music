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

### 3. Push Protocols (`push dev`, `push main`, `/push`)
- **`push dev` (Staging Cloud Backup)**:
  1. Stage all modified and new files in the development worktree (`git add -A`).
  2. Commit with a structured commit message summarizing recent changes.
  3. Push strictly to GitHub `develop` branch (`git push origin develop`).
  4. Send an automatic notification summary to Telegram Dev topic using `/usr/local/bin/tg-notify --dev "<summary>"`.
  5. **Zero Main Impact**: Do NOT merge to `main`. Do NOT publish a community bulletin announcement.
  6. Reply with the commit message, commit hash, and confirmation that `develop` is backed up.
- **`push main` (Production Release & Broadcast)**:
  1. Ensure changes on `develop` have passed the 4-point verification checklist.
  2. Merge `develop` into `main`.
  3. Push `main` to GitHub (`git push origin main`).
  4. Build production frontend and restart production container (`mattlab-music`).
  5. Send an automatic notification summary to Telegram Dev topic using `/usr/local/bin/tg-notify --dev "<summary>"`.
  6. Automatically post a user-facing bulletin broadcast announcement from the **admin** account summarizing the latest improvements.
  7. Reply with the commit message, commit hash, GitHub status, and Bulletin announcement confirmation.
- **Ambiguous `/push` or `push` (Without Specifying Target)**:
  - **Zero Immediate Execution**: NEVER execute a git push or merge when only `push` or `/push` is received without a target.
  - **Confirmation Prompt**: ALWAYS stop immediately and ask:
    *"Did you want to back up your progress to staging (`push dev`) or merge and release to production (`push main`)?"*

## Telegram Notifications Workflow (@mattlabunraid_bot)
1. **Topic Routing Protocol**:
   - **Dev Topic (`--dev` / `-d`, Thread 9)**: Anything about development, code changes, git commits/pushes, PRs, branch merges, builds, container deploys, bug fixes, and engineering tasks MUST go to the Dev topic.
   - **Music Topic (`--music` / `-m`, Thread 6)**: Reserved strictly for operational/user music events (e.g. background crawler/lyrics fetcher status, Spotify playlist sync completions).
   - **Alerts Topic (`--alerts` / `-a`, Thread 12)**: Critical server health, container crashes, watchdog alerts.
   - **Commands Topic (`--commands` / `-c`, Thread 3)**: General admin command output and server status summaries.
2. **Auto-Pilot Notifications**: Whenever any development work, system configuration, Docker container setup, network tweak, script installation, or notable task on MattLab is completed, automatically send a clean summary notification to the user's Telegram bot using `/usr/local/bin/tg-notify --dev "<summary>"` (or appropriate topic flag).
3. **`tg-notify` / `tg` Chat Trigger**:
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

## Continuous Learning & Skill Updates
- **Proactive Post-Mortem & Improvement Logging**: Whenever a bug, operational pitfall, unexpected container issue, configuration glitch, or major server/media improvement is resolved, always prompt the user to document or automatically append the lesson learned to `mattlab-ops` (`.agents/skills/mattlab-ops/SKILL.md` and `/root/.gemini/antigravity-cli/skills/mattlab-ops/SKILL.md`).
- **Never Repeat Mistakes**: Consult `mattlab-ops` whenever operating on the server, handling power recovery, qBittorrent, Servarr, private trackers, or audio services.



