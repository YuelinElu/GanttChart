"""FastAPI backend for serving task data and (optionally) the built frontend."""

from __future__ import annotations

from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from services.task_loader import TaskLoaderError, load_tasks


class Task(BaseModel):
    """Schema returned to the frontend for each task."""

    id: str
    name: str
    start: str
    end: str
    color: str = Field(default="#4F46E5")
    colorLabel: str = Field(default="Indigo")
    outline: bool = Field(default=False)
    durationLabel: str = Field(default="")
    durationHours: float = Field(default=0.0)
    durationDays: float = Field(default=0.0)
    startLabel: str = Field(default="")
    endLabel: str = Field(default="")


app = FastAPI(
    title="Gantt Chart API",
    version="1.0.0",
    description=(
        "Serves CSV-backed task data and, when available, the built React frontend."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/tasks", response_model=List[Task], tags=["tasks"])
def get_tasks() -> List[Task]:
    """Return all tasks from the CSV in a normalised structure."""

    try:
        payload = load_tasks()
    except TaskLoaderError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return [Task(**item) for item in payload]


@app.get("/healthz", tags=["meta"])
def healthcheck() -> dict:
    """Simple health endpoint for deployments."""

    return {"status": "ok"}


def _mount_frontend_if_present(application: FastAPI) -> None:
    """Serve the built React bundle when ``frontend/dist`` exists."""

    dist_path = Path(__file__).resolve().parent / "frontend" / "dist"
    index_file = dist_path / "index.html"
    if index_file.exists():
        application.mount(
            "/",
            StaticFiles(directory=dist_path, html=True),
            name="frontend",
        )


_mount_frontend_if_present(app)
