Interactive Gantt Chart (FastAPI + React)
=========================================

Visualise the tasks stored in `data/data.csv` with a modern, interactive Gantt chart.  
The backend (FastAPI) serves the CSV as JSON, while the frontend (React + Vite + frappe-gantt) renders a polished timeline with colour-coded bars and rich tooltips.


Dataset expectations
--------------------

The CSV must be UTF-8 encoded and include the following columns:

| Column       | Required | Description                                                          |
|--------------|----------|----------------------------------------------------------------------|
| `Tasks`      | Yes      | Task name shown on the chart                                         |
| `Start Date` | Yes      | Task start timestamp (e.g. `2025-06-02 08:00:00`)                    |
| `Completion` | Yes      | Task end timestamp (e.g. `2025-07-04 16:00:00`)                      |
| `Length`     | No       | Ignored by the app (durations are computed from the datetime fields) |
| `Color`      | No       | Colour name or CSS colour used for the bar (see mapping below)       |

Rows with missing or invalid dates are skipped so remaining tasks can still load.

> **Note:** The file `data/data.csv` is intentionally git-ignored so you can keep production datasets private. Create or copy your own CSV to that path when running the FastAPI backend locally.

Colour palette
--------------

Named colours in the CSV are mapped to a consistent palette:

```python
{
    "Orange": "#f5642d",
    "Grey": "#a9a9a9",
    "Black": "#000000",
    "Black Outline": "#000000"  # rendered as an outline-only task bar
}
```

Unknown colour values fall back to the Orange preset so the chart never renders empty bars. You can also switch the editor to **Custom** and enter any hex colour (`#RRGGBB`); those values are preserved when exporting/importing CSV files.


Project structure
-----------------

- `app.py`: FastAPI application served by Uvicorn.
- `services/`: CSV loading and normalisation helpers.
  - `task_loader.py`: parses `data/data.csv` and prepares API-friendly payloads.
- `frontend/`: React + Vite single-page application.
  - `src/App.jsx`: Gantt chart component and UI.
  - `src/styles.css`: modern, minimal styling for the layout and chart.
- `data/`: source dataset (`data.csv`).


Backend (FastAPI)
-----------------

Two endpoints are exposed:

- `GET /api/tasks` - parsed task list.
- `GET /healthz` - lightweight health probe.

Run locally (Python 3.10+ recommended):

```powershell
# From the repo root (reuse your existing venv if you have one)
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Launch the API
uvicorn app:app --reload --port 8000
```

Open `http://localhost:8000/api/tasks` to confirm the JSON feed.


Frontend (React + Vite)
-----------------------

The React app uses the open-source `frappe-gantt` library with custom styling for clearer gridlines, tooltips, and colour theming.

```powershell
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` calls to `http://localhost:8000`. Make sure the backend is running first.

Using the web app
-----------------

With both servers running, open `http://localhost:5173` and use the control bar at the top:

- **Dataset selector** - `Show default` loads `data/data.csv`, `Show empty` provides a blank canvas, and `Show uploaded` switches to an uploaded CSV (same columns as the default dataset).
- **Import CSV** - upload any CSV in the documented format; it renders instantly in the browser, using the same colour mapping as the backend.
- **Add / edit / delete tasks** - select a task (from the chart or the frozen task list) to edit its name and datetimes, choose from the preset palette (Orange, Grey, Black, Black Outline) or switch to **Custom** to enter any hex colour, drag bars to reschedule, or delete tasks outright. Durations and tooltips stay in sync automatically.
- **Undo / Redo** - use the toolbar buttons or shortcuts (`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`) to step backward or forward through your edits without refreshing.
- **Search tasks** - type in the search box to highlight matches, then use Prev/Next (or Enter/Shift+Enter) to cycle through them -- the chart and task list scroll into view automatically.
- **Task details panel** - collapse the detail drawer when you want maximum Gantt real estate, and expand it again to edit the selected task.
- **Reorder tasks** - drag the task name up or down to change its row; the Gantt bars follow instantly without changing dates.
- **Export CSV** - download the current view (including edits and new tasks) in the original schema so you can share or re-import it later. A prompt lets you rename the file before it downloads.


Production build and hosting
----------------------------

Bundle the frontend and let FastAPI serve the static assets:

```powershell
cd frontend
npm install        # pulls dev deps like sass-embedded
npm run build
```

This generates `frontend/dist/`. Restart the backend (`uvicorn app:app --port 8000`) and open `http://localhost:8000/`. FastAPI automatically mounts the built bundle when it detects that directory.

Static hosting (GitHub Pages)
-----------------------------

- The React build now falls back to an anonymised sample CSV at `frontend/public/default-data.csv` whenever `/api/tasks` is unreachable. This keeps the chart populated even when the FastAPI service is offline without exposing private data.
- Replace that CSV locally (and commit only if the contents are safe to share) whenever you want the static site to reflect new baseline data.
- When you do host the API, add a repository variable or secret named `FRONTEND_API_BASE_URL`; the Pages workflow will inject it as `VITE_API_BASE_URL` so the front end switches back to live data.


Features implemented
--------------------

- Dedicated CSV loader (`services/task_loader.py`) that maps colours, computes durations, and formats tooltip metadata.
- FastAPI endpoints (`/api/tasks`, `/healthz`) with CORS enabled for the Vite proxy.
- React workspace (`frontend/src/App.jsx`) featuring dataset switching, CSV import/export, adding/deleting tasks, inline editing, and drag-to-reschedule support.
- Drag-and-drop task reordering keeps the sidebar and bars aligned without touching dates.
- Palette selector with curated colour presets (including outline-only styling) and a **Custom** hex option so each bar can match your preferred styling.
- Search box with previous/next navigation that jumps the timeline and sidebar to each matching task.
- Collapsible task detail drawer so you can keep the focus on the chart when you only need a quick glance.
- Client-side undo/redo history with keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) so edits are reversible without reloading.
- Alignment and labelling enhancements that keep the frozen task list perfectly in sync with the chart grid, with responsive legends and hover tooltips.
- Tailored styling (`frontend/src/styles.css`) for a professional dashboard feel with neutral backgrounds, subtle shadows, readable typography, and outline styling for "Black Outline" tasks.
- README instructions covering setup, development, production builds, and the new runtime controls.


Customisation ideas
-------------------

- Update `COLOR_MAP` inside `services/task_loader.py` to introduce additional palette entries or align with your brand.
- Add progress handling by including a `Progress` column in the CSV and surfacing it in the tooltip/UI.
- Extend the API in `app.py` with filtering or grouping endpoints, then introduce controls in the React UI.
- Enhance the tooltip with extra metadata (owner, status, dependencies) by enriching the CSV and adjusting the serializer.

Happy planning!
