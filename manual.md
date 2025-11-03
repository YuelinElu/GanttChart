# GanttChart User Manual

Welcome! This guide focuses on day-to-day usage of the GanttChart application.  
For installation and deployment steps, see `README.md`.

---

## 1. Launching the app

1. **Start the API**  
   ```powershell
   uvicorn app:app --reload --port 8000
   ```
2. **Start the frontend**  
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
3. Open `http://localhost:5173`. If you see “Unable to load tasks”, confirm the API is reachable at `http://localhost:8000/api/tasks`.

> Production build: run `npm run build` inside `frontend/`, then visit `http://localhost:8000/`.

---

## 2. Interface tour

| Area | Description |
|------|-------------|
| **Toolbar** | Dataset selector, sort dropdown (Original / Start / Completion), import/export, undo/redo, bulk shift, add task, global search. The selection badge shows how many tasks are in scope. |
| **Summary bar** | Totals and milestones (task count, earliest start, latest finish, overall span) update with every edit so you always see schedule health at a glance. |
| **View controls** | Day / Week / Month toggle situated directly above the chart. |
| **Task sidebar** | Frozen task list that stays aligned with the Gantt rows; supports drag-and-drop reordering and multi-select. |
| **Timeline** | Interactive bars (drag to reschedule, click to focus). Sticky horizontal scrollbar sits above the chart. |
| **Task editor** | Detailed panel on the right for editing names, dates, and colours; collapsible when you need more canvas space. |

- **Rename the dashboard** at any time by double-clicking the header title; the custom label is remembered in your browser.

---

## 3. Working with datasets

- **Dataset selector**
  - *Show default*: loads `data/data.csv`.
  - *Show empty*: starts with a blank timeline.
  - *Show uploaded*: switches to the most recent CSV you imported.

- **Import CSV**
  1. Click **Import**.
  2. Choose a UTF-8 CSV containing the documented columns (`Tasks`, `Start Date`, `Completion`, optional `Color`).
  3. The chart refreshes immediately and the dataset selector jumps to “Show uploaded”.

- **Export CSV**
  - Click **Export** to download the current timeline (including edits). Filenames include a timestamp or the uploaded file name.
- **Sort dropdown**
  - *Original order*: restores the source file order (newly created tasks appear at the end).
  - *Start date*: keeps the earliest start at the top; the list reflows automatically after relevant edits.
  - *Completion date*: ranks tasks by finish time so you can focus on impending deadlines.
  - Your manual drag order is preserved—switch back to *Original order* to revisit the baseline.

---

## 4. Viewing and navigation

- Toggle between **Day / Week / Month** to change the scale.
- Scroll vertically inside the sidebar or timeline; the horizontal scrollbar fixed above the chart helps with long schedules.
- Use the **search bar** to highlight tasks:
  - Type to filter; results glow in both the sidebar and chart.
  - Press **Enter** / **Shift + Enter** or click **Prev / Next** to cycle through matches (auto-scroll keeps the active bar in view).

---

## 5. Selecting tasks

- **Single select** – Click any task bar or sidebar entry. The task editor updates and checkboxes stay hidden.
- **Toggle select** – Hold **Ctrl** (Windows/Linux) or **?** (macOS) and click tasks to add/remove them from the selection.
- **Range select** – Click a starting task, hold **Shift**, then click the ending task. Every task in between is selected.
- **Select all / clear all** – Once multi-select is active, a checkbox in the sidebar header toggles the entire list.
- Hover between rows to reveal an "Add task here" control where you can insert a task exactly where you need it.
- A badge in the toolbar (e.g., "3 selected" or "All tasks") summarises the current selection, and selected bars receive a subtle highlight in the timeline for quick visual confirmation.
---

## 6. Editing tasks

### 6.1 Task editor

1. Click a task to load it into the editor.
2. Update **Name**, **Start**, **End** (minute resolution).
   - Inline validation highlights invalid ranges and disables **Save changes** until Start and End make sense.
3. Choose a colour:
   - Preset palette entries (Orange, Grey, Black, Black Outline).
   - Multi-select a set of tasks and click **Apply colour to selected tasks** to push the current colour/outline to all of them at once.
4. Use **Save changes** to persist, or **Reset** to restore the last saved state.
5. Collapse the panel with the toggle in the header when you want maximum Gantt space.

### 6.2 Drag interactions

- Drag bars horizontally to reschedule; duration and tooltip metadata update automatically.
- Drag task names in the sidebar to reorder rows without touching dates.

### 6.3 Add / delete / undo / redo

- **Add Task** launches a draft (4-hour window by default) near the focused task or current time. Tweak the fields and click **Save changes** to add it; use **Discard task** or **Reset** if you change your mind.
- **Delete task** removes the focused task (or discards the draft when you're creating a new task).
- **Undo / Redo** via:
  - Toolbar buttons
  - `Ctrl + Z`
  - `Ctrl + Shift + Z` or `Ctrl + Y`

---

## 7. Bulk shifting the timeline

1. Select one or more tasks (see Section 5). If nothing is selected, the shift will apply to **every** task.
2. Click **Shift timeline** in the Planning block.
3. In the modal:
   - Enter the amount (hours/days/weeks).
   - Choose Forward or Backward.
4. Press **Apply shift**. Start and end dates move by the specified offset.  
   Use **Undo** if you need to revert.

---

## 8. Colour coding

- Named colours in the CSV map to:
  - Orange -> `#f5642d`
  - Grey -> `#a9a9a9`
  - Black -> `#000000`
  - Black Outline -> `#000000` (drawn as an outline-only bar)
- Custom hex values are intentionally disabled to keep the palette consistent across teams.
- To recolour a batch, multi-select the tasks and use **Apply colour to selected tasks** in the editor.
- The legend was removed to reduce clutter. Use custom labels or documentation if you need to describe colour meanings.

---

## 9. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo |
| `Enter` / `Shift + Enter` in search | Next / Previous match |
| `Esc` | Close the shift modal |

---

## 10. Troubleshooting

- **Tasks fail to load** – Ensure the backend is running and the CSV has valid date values. Invalid rows are skipped with a console warning.
- **Shift modal moves everything** – Select specific tasks first (toolbar badge will show “All tasks” if nothing is selected).
- **Editor won’t update** – Make sure you clicked a task without modifier keys; shift/cmd clicks add to the selection without changing focus.

---

## 11. Next steps

- Extend the CSV with extra metadata (owners, status) and surface it in the tooltip or editor.
- Add filters (by colour, owner, status) for large portfolios.
- Connect the API to persistent storage for multi-user environments.

Happy scheduling!




