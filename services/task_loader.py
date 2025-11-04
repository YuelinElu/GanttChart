"""Helper utilities for reading and normalising task data from ``data.csv``.

The functions in here stay pure (no FastAPI imports) so they can be
unit-tested independently and reused by background jobs later on.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd


DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "data.csv"

# Map the colour names found in the CSV to consistent styling hints.
COLOR_MAP: Dict[str, Tuple[str, str, bool]] = {
    "orange": ("#f5642d", "Orange", False),
    "grey": ("#a9a9a9", "Grey", False),
    "gray": ("#a9a9a9", "Grey", False),
    "black": ("#000000", "Black", False),
    "black outline": ("#000000", "Black Outline", True),
}


class TaskLoaderError(RuntimeError):
    """Raised when the CSV cannot be read or parsed."""


@dataclass(frozen=True)
class TaskRecord:
    """A normalised representation of a single task row."""

    id: str
    name: str
    position: int
    start: str
    end: str
    color: str
    color_label: str
    outline: bool
    duration_label: str
    duration_hours: float
    duration_days: float
    start_label: str
    end_label: str

    def as_dict(self) -> Dict[str, Any]:
        """Return a JSON-serialisable dict."""

        return {
            "id": self.id,
            "name": self.name,
            "position": self.position,
            "start": self.start,
            "end": self.end,
            "color": self.color,
            "colorLabel": self.color_label,
            "outline": self.outline,
            "durationLabel": self.duration_label,
            "durationHours": self.duration_hours,
            "durationDays": self.duration_days,
            "startLabel": self.start_label,
            "endLabel": self.end_label,
        }


def load_tasks() -> List[Dict[str, Any]]:
    """Read ``data.csv`` and return a list of JSON-ready task dictionaries."""

    if not DATA_PATH.exists():
        raise TaskLoaderError(f"Missing CSV file at {DATA_PATH}")

    try:
        frame = pd.read_csv(DATA_PATH)
    except Exception as exc:  # pragma: no cover - pandas reports the details
        raise TaskLoaderError("Unable to load CSV") from exc

    required_columns = {"Tasks", "Start Date", "Completion"}
    missing = required_columns - set(frame.columns)
    if missing:
        raise TaskLoaderError(
            "CSV missing required columns: " + ", ".join(sorted(missing))
        )

    records: List[TaskRecord] = []

    for index, row in frame.iterrows():
        try:
            start = pd.to_datetime(row["Start Date"], utc=False, errors="coerce")
            end = pd.to_datetime(row["Completion"], utc=False, errors="coerce")
        except (ValueError, TypeError):
            continue

        if pd.isna(start) or pd.isna(end):
            continue

        name = str(row.get("Tasks", "")).strip() or f"Task {index + 1}"
        color_value, color_label, outline = _normalise_color(row.get("Color"))

        delta = end - start
        duration_hours = max(delta.total_seconds() / 3600.0, 0.0)
        duration_days = round(duration_hours / 24.0, 2)
        duration_label = _humanise_duration(delta)

        record = TaskRecord(
            id=f"task-{index}",
            name=name,
            position=index,
            start=start.isoformat(),
            end=end.isoformat(),
            color=color_value,
            color_label=color_label,
            outline=outline,
            duration_label=duration_label,
            duration_hours=round(duration_hours, 2),
            duration_days=duration_days,
            start_label=start.strftime("%b %d, %Y %I:%M %p"),
            end_label=end.strftime("%b %d, %Y %I:%M %p"),
        )

        records.append(record)

    return [record.as_dict() for record in records]


def _normalise_color(raw: Any) -> Tuple[str, str, bool]:
    """Map named colours to hex codes, falling back to safe defaults."""

    if isinstance(raw, str):
        value = raw.strip()
        if value:
            mapped = COLOR_MAP.get(value.lower())
            if mapped:
                return mapped
            return value, value, False

    default = "#4F46E5"
    return default, "Indigo", False


def _humanise_duration(delta: pd.Timedelta) -> str:
    """Create a friendly duration label from a timedelta."""

    total_seconds = max(int(delta.total_seconds()), 0)
    hours_total, remainder_seconds = divmod(total_seconds, 3600)
    minutes = remainder_seconds // 60
    days, hours = divmod(hours_total, 24)

    parts: List[str] = []
    if days:
        parts.append(f"{days} day{'s' if days != 1 else ''}")
    if hours:
        parts.append(f"{hours} hr{'s' if hours != 1 else ''}")
    if not days and minutes:
        parts.append(f"{minutes} min")

    return " ".join(parts) or "< 1 hr"
