# GanttChart User Manual

This guide walks through the day-to-day features available in the GanttChart project.  
Use it alongside `README.md`, which covers installation and developer notes.

---

## 1. Launching the app

1. Start the FastAPI backend (default `http://localhost:8000`).
2. Start the React frontend (`npm run dev` inside `frontend/`), then open `http://localhost:5173`.
3. Make sure the banner does **not** show “Unable to load tasks”. If it does, verify that the backend is running and reachable.

> Tip: The backend also serves the production build at `http://localhost:8000/` after `npm run build`.

---

## 2. Interface tour

| Area | Description |
|------|-------------|
| **Toolbar (top)** | Dataset selector, import/export, undo/redo, bulk shift, add task, global search. |
| **View controls** | Day / Week / Month toggle above the chart for quick zoom changes. |
| **Task sidebar (left)** | Frozen list of task names that stays aligned with the Gantt rows. Drag to reorder. |
| **Timeline (center)** | Interactive bars (drag to reschedule, click to focus). Scrollbars at top/bottom handle long ranges. |
| **Task editor (right)** | Details for the currently focused task; collapse for maximum canvas space. |

---

## 3. Working with datasets

- **Dataset selector**  
  - *Show default*: loads `data/data.csv`.  
  - *Show empty*: starts with an empty timeline.  
  - *Show uploaded*: displays the last CSV you uploaded (see below).

- **Import CSV**  
  1. Click **Import**.
  2. Choose a UTF-8 CSV with the documented columns (see README).  
  3. The chart refreshes instantly. The active dataset switches to “Show uploaded”.

- **Export CSV**  
  - Click **Export** to download the current timeline (including edits) in the same schema.  
  - The filename includes a timestamp or your uploaded file name.

---

## 4. Viewing and navigation

- Use the **Day / Week / Month** toggle to adjust the timeline scale.
- Scroll vertically inside the sidebar or timeline; a sticky horizontal scrollbar sits above the chart for long-range navigation.
- The **search box** highlights matching tasks:
  - Type to filter.
  - Press **Enter** / **Shift + Enter** or use **Prev / Next** to move between hits. The chart and sidebar auto-scroll to the active match.

---

## 5. Selecting tasks

- **Single select**  
  - Click a task in the sidebar or chart to focus it. The task editor updates and checkboxes remain hidden.

- **Toggle selection (multi-select)**  
  - Hold **Ctrl** (Windows/Linux) or **⌘** (macOS) and click tasks to add/remove them from the selection.
  - Once you select multiple tasks, checkboxes appear to indicate the selection.

- **Range selection**  
  - Click the first task in the range, hold **Shift**, then click the last task. Every task in between becomes selected.

- **Select all / clear all**  
  - Use the checkbox in the sidebar header when it becomes visible (only after a multi-select begins).

---

## 6. Editing tasks

### 6.1 Task editor

1. Click a task to load it into the editor.  
2. Update **Name**, **Start**, **End** (minute resolution).  
3. Choose a colour:
   - Preset palette (orange, grey, black, indigo, etc.).
   - **Custom** colour picker with outline toggle and optional label.
4. `Save changes` persists the edit; `Reset` restores the last saved state.
5. Use the button in the editor header to collapse/expand the panel.

### 6.2 Drag interactions

- **Reschedule** by dragging the bar; start/end labels update automatically.
- **Reorder rows** by dragging task names up/down in the sidebar.

### 6.3 Add / delete / undo / redo

- **Add Task** creates a 4-hour task near the selected task’s start time (or “now” if nothing is selected).
- **Delete Task** (button inside the editor) removes the focused task.
- **Undo / Redo** via toolbar buttons or shortcuts:
  - `Ctrl + Z`
  - `Ctrl + Shift + Z` or `Ctrl + Y`

---

## 7. Bulk shifting the timeline

1. Select one or more tasks (see Section 5).  
   - If nothing is selected, the shift applies to **all** tasks.
2. Click **Shift timeline** in the Planning block.
3. In the modal:
   - Set the amount (`1` by default).
   - Choose **hours / days / weeks**.
   - Pick **Forward** or **Backward**.
4. Press **Apply shift**. Start/end times for the targeted tasks move by the chosen offset.
5. Use **Undo** if needed.

---

## 8. Colour coding

- CSV colour names map to the following palette:
  - Orange, Grey, Black (filled)
  - Black Outline (stroke only)
- Custom colours allow any valid hex; outline-only mode is supported for contrast.
- The legend has been removed to reduce clutter; use custom labels to document meanings when necessary.

---

## 9. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` or `Ctrl + Y` | Redo |
| `Enter` / `Shift + Enter` while searching | Next / Previous match |
| `Esc` | Close the shift modal (when open) |

---

## 10. Troubleshooting

- **Tasks fail to load**  
  - Confirm the backend is running on `http://localhost:8000`.  
  - Check the console/logs for parsing errors (invalid dates are skipped automatically).

- **Shift modal always moves every task**  
  - Ensure you have an active multi-selection (checkboxes visible). Otherwise, the modal intentionally targets the full timeline.

- **Editor not updating**  
  - Verify you single-clicked a task (without Ctrl/⌘ modifiers). Multi-select mode keeps the editor showing the last focused task until you pick a specific one.

---

## 11. Next steps

- Extend the CSV with additional metadata (owners, status) and surface it in the tooltip or editor.
- Introduce filters (e.g., by colour, status, ownership) to focus on specific subsets.
- Persist changes to disk or a database via additional FastAPI endpoints if you need multi-user collaboration.

Happy scheduling!
