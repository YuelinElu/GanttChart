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

Unknown colour values fall back to the raw CSS colour (if valid) or a neutral indigo accent.


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


Production build and hosting
----------------------------

Bundle the frontend and let FastAPI serve the static assets:

```powershell
cd frontend
npm install        # pulls dev deps like sass-embedded
npm run build
```

This generates `frontend/dist/`. Restart the backend (`uvicorn app:app --port 8000`) and open `http://localhost:8000/`. FastAPI automatically mounts the built bundle when it detects that directory.


Features implemented
--------------------

- Dedicated CSV loader (`services/task_loader.py`) that maps colours, computes durations, and formats tooltip metadata.
- `/api/tasks` FastAPI endpoint (`app.py`) with CORS for Vite dev tooling.
- React component (`frontend/src/App.jsx`) that fetches tasks, switches view modes (day/week/month), injects per-task colours, and renders a legend.
- Tailored styling (`frontend/src/styles.css`) for a professional dashboard feel with neutral backgrounds, subtle shadows, readable typography, and outline styling for “Black Outline” tasks.
- README instructions covering setup, development, and production build workflows.


Customisation ideas
-------------------

- Update `COLOR_MAP` inside `services/task_loader.py` to introduce additional palette entries or align with your brand.
- Add progress handling by including a `Progress` column in the CSV and surfacing it in the tooltip/UI.
- Extend the API in `app.py` with filtering or grouping endpoints, then introduce controls in the React UI.
- Enhance the tooltip with extra metadata (owner, status, dependencies) by enriching the CSV and adjusting the serializer.

Happy planning!
