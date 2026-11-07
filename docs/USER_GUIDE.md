# User Guide & Navigation Reference

This guide provides an exhaustive reference to the MattLab Music interface, navigation hierarchies, interaction models, and keyboard shortcuts.

---

## 1. Application Layout & Interaction Model

### Desktop Split-Pane Architecture
The desktop view is engineered around a three-tier layout optimized for high information density and effortless discovery:
1. **Left Navigation Rail (Library Sidebar)**:
   - Quick access to core views: *Home*, *Search*, *Library*, *Liked Songs*.
   - Filterable user playlists list with custom sort options (Alphabetical, Date Added, Custom Order).
   - Drag-and-drop targets allowing tracks from any view to be added directly to playlists.
2. **Main Content Stage**:
   - Dynamic view transitions with persistent scroll preservation.
   - Fluid album grids, artist discographies, and multi-column track tables with quick-play hover buttons.
3. **Persistent Playback Controller (Player Bar)**:
   - Anchored at the screen bottom; guarantees continuous, uninterruptible audio playback across all navigation steps.
   - Comprehensive controls: Previous, Play/Pause, Next, Shuffle, Repeat (Off / All / Track), interactive waveform scrubber, volume control with instant mute toggle, and lyrics drawer toggle.

---

## 2. Mobile Responsive Interaction Patterns

The mobile experience provides a native-grade touch interface adhering to mobile operating system standards:

- **Touch Navigation Bar**: Anchored bottom navigation bar granting instant single-tap access to *Home*, *Search*, *Library*, and *Profile*.
- **Swipeable Now Playing Sheet**: Tapping the mini-player expands an interactive full-screen Now Playing modal supporting drag gestures to dismiss.
- **Queue Bottom Sheet**: Slide-up touch drawer displaying the upcoming playback queue with single-tap track selection and track removal.
- **Contextual Action Sheets**: Long-pressing or tapping the action menu trigger (`...`) opens a native bottom sheet containing track, album, and playlist options.

---

## 3. Global Command Palette (`⌘K` / `Ctrl+K`)

MattLab Music incorporates a keyboard-centric command palette accessible globally via `⌘K` (macOS) or `Ctrl+K` (Windows/Linux), as well as via the mobile profile menu:

- **Instant Search**: Type any string to instantly query tracks, albums, artists, and playlists simultaneously.
- **Playback Control Commands**: Execute `Play`, `Pause`, `Next Track`, `Previous Track`, `Toggle Shuffle`, `Toggle Repeat`.
- **Navigation Shortcuts**: Jump directly to *Settings*, *Account*, *Bulletins*, *Audio Options*, or *System Telemetry*.
- **Quick Track Ingestion**: Trigger the *Request & Download Music* dialog directly with the active search string pre-populated.

---

## 4. Settings & Configuration (iOS-Style Drilldown)

The Settings interface is structured as an iOS-inspired master-detail list:

### Root Settings Master List
- **Profile & Account**: Username, display name, profile avatar upload/removal, and password updates.
- **Audio & Playback**:
  - *Streaming Audio Quality*: Current mode indicator (`Lossless (HQ)` vs `Data Saver (128k)`).
  - *Upcoming Songs Buffer*: Current memory window badge (`Direct Stream` vs `$N$ Songs`).
  - *Autoplay Similar Songs*: Inline toggle switch enabling smart queue continuation when playback concludes.
  - *Floating Miniplayer*: Active mode badge (`Interactive` vs `Video 16:9`).
- **Issues & Notes**: Internal ticket tracking with status filter badges.
- **About & System**: Catalog telemetry (track/album counts, playtime hours) and ecosystem architecture reference.

### Detail Subpages
Clicking any master list row transitions into a dedicated configuration screen with a `< Back` breadcrumb for uncluttered adjustment.

---

## 5. Keyboard Shortcuts Reference

MattLab Music supports comprehensive global hotkeys that remain operational regardless of active view focus (excluding active text inputs):

### Playback Controls
| Shortcut | Action |
| :--- | :--- |
| `Space` | Toggle Play / Pause |
| `Shift + N` | Skip to Next Track |
| `Shift + P` | Return to Previous Track |
| `←` (Left Arrow) | Seek Backward 5 Seconds |
| `→` (Right Arrow) | Seek Forward 5 Seconds |
| `Shift + ←` | Seek Backward 10 Seconds |
| `Shift + →` | Seek Forward 10 Seconds |
| `↑` (Up Arrow) | Increase Volume (+5%) |
| `↓` (Down Arrow) | Decrease Volume (-5%) |
| `M` | Toggle Audio Mute |
| `S` | Toggle Shuffle Mode |
| `R` | Cycle Repeat Mode (Off → All → One) |

### Navigation & Interface
| Shortcut | Action |
| :--- | :--- |
| `⌘K` / `Ctrl + K` | Open Global Command Palette |
| `L` | Toggle Synchronized Lyrics View |
| `Q` | Toggle Queue Drawer |
| `Esc` | Close Active Modal or Drawer |
