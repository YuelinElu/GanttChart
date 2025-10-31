import Papa from "papaparse";

const COLOR_PRESETS = [
  { key: "orange", label: "Orange", color: "#f5642d", outline: false },
  { key: "grey", label: "Grey", color: "#a9a9a9", outline: false },
  { key: "black", label: "Black", color: "#000000", outline: false },
  { key: "black-outline", label: "Black Outline", color: "#000000", outline: true },
  { key: "indigo", label: "Indigo", color: "#4f46e5", outline: false },
];

const COLOR_LOOKUP = COLOR_PRESETS.reduce((map, preset) => {
  map.set(preset.label.toLowerCase(), preset);
  map.set(preset.color.toLowerCase(), preset);
  map.set(preset.key, preset);
  return map;
}, new Map());

const DEFAULT_COLOR = COLOR_PRESETS.find((preset) => preset.key === "indigo") ?? COLOR_PRESETS[0];
const CUSTOM_COLOR_KEY = "custom";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function getPresetByKey(key) {
  if (!key) {
    return null;
  }
  return COLOR_LOOKUP.get(String(key).toLowerCase()) ?? null;
}

export function findPresetForTask(task) {
  if (!task) {
    return null;
  }
  const normalizedColor = typeof task.color === "string" ? task.color.toLowerCase() : "";
  const candidates = [task.presetKey, task.colorLabel, task.color];
  for (const candidate of candidates) {
    const preset = getPresetByKey(candidate);
    if (
      preset &&
      preset.color?.toLowerCase() === normalizedColor &&
      Boolean(preset.outline) === Boolean(task.outline)
    ) {
      return preset;
    }
  }

  return (
    COLOR_PRESETS.find(
      (preset) =>
        preset.color.toLowerCase() === normalizedColor &&
        Boolean(preset.outline) === Boolean(task.outline),
    ) ?? null
  );
}

export function ensureStableOrder(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .map((task, idx) => ({
      task,
      sortKey: Number.isFinite(task?.position) ? Number(task.position) : idx,
      idx,
    }))
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.idx - b.idx;
    })
    .map(({ task }, idx) => ({
      ...task,
      position: idx,
    }));
}

export function convertCsvRowsToTasks(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const prepared = rows.map((row, index) => ({
    id: stringOrNull(row?.id ?? row?.ID) ?? undefined,
    name: stringOrNull(row?.Tasks ?? row?.tasks ?? row?.Name ?? row?.name) ?? `Task ${index + 1}`,
    start: stringOrNull(row?.["Start Date"] ?? row?.start ?? row?.Start ?? row?.start_date),
    end: stringOrNull(row?.Completion ?? row?.completion ?? row?.End ?? row?.end),
    color: stringOrNull(row?.Color ?? row?.color ?? row?.colour),
    colorLabel: stringOrNull(row?.Color ?? row?.colorLabel ?? row?.colour),
    position: Number.isFinite(row?.position) ? Number(row.position) : index,
  }));

  return normaliseTaskCollection(prepared);
}

export function normaliseTaskCollection(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  const normalised = [];
  records.forEach((record, index) => {
    const item = normaliseTaskRecord(record, index);
    if (item) {
      const basePosition = Number.isFinite(item.position) ? Number(item.position) : index;
      normalised.push({
        ...item,
        position: basePosition,
      });
    }
  });

  return ensureStableOrder(normalised);
}

export function normaliseTaskRecord(record, index = 0) {
  if (!record) {
    return null;
  }

  const startDate = coerceToDate(record.start ?? record["Start Date"]);
  const endDate = coerceToDate(record.end ?? record["Completion"]);

  if (!startDate || !endDate) {
    return null;
  }

  if (endDate.getTime() < startDate.getTime()) {
    endDate.setTime(startDate.getTime() + 60 * 60 * 1000);
  }

  const name =
    stringOrNull(record.name ?? record.Tasks ?? record.title ?? record.Task) ??
    `Task ${index + 1}`;

  const colorValue = record.color ?? record.Color ?? record.hex ?? record.colour;
  const colorLabel = record.colorLabel ?? record["Color"] ?? record.label ?? record.colour;
  const outlineFlag =
    typeof record.outline === "boolean"
      ? record.outline
      : typeof record.Outline === "boolean"
      ? record.Outline
      : undefined;

  const colour = resolveColorSpec(colorValue, colorLabel, outlineFlag);
  const metrics = computeDurationMetrics(startDate, endDate);

  const idCandidate = record.id ?? record.ID;
  const id =
    typeof idCandidate === "string" && idCandidate.trim()
      ? idCandidate.trim()
      : Number.isFinite(idCandidate)
      ? String(idCandidate)
      : generateTaskId();

  return {
    id,
    name,
    start: formatIsoLocal(startDate),
    end: formatIsoLocal(endDate),
    color: colour.color,
    colorLabel: colour.label,
    outline: colour.outline,
    presetKey: colour.presetKey ?? record.presetKey ?? null,
    durationLabel: metrics.durationLabel,
    durationHours: metrics.durationHours,
    durationDays: metrics.durationDays,
    startLabel: metrics.startLabel,
    endLabel: metrics.endLabel,
    position: Number.isFinite(record.position) ? Number(record.position) : index,
  };
}

export function sortTasksByStart(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }
  return [...tasks]
    .map((task, idx) => ({
      task,
      start: coerceToDate(task?.start)?.getTime() ?? Number.MAX_SAFE_INTEGER,
      position: Number.isFinite(task?.position) ? task.position : idx,
      idx,
    }))
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return a.idx - b.idx;
    })
    .map(({ task }, idx) => ({
      ...task,
      position: idx,
    }));
}

export function convertTasks(rawTasks) {
  const ordered = ensureStableOrder(rawTasks);
  return ordered.map((task) => ({
    ...task,
    rawName: task.name,
    name: truncateLabel(task.name),
    progress: 100,
    custom_class: `task-color-${task.id}`,
  }));
}

export function buildLegend(rawTasks) {
  const seen = new Map();

  rawTasks.forEach((task) => {
    const colorKey = `${(task.color || "").toLowerCase()}|${task.outline ? "outline" : "solid"}`;
    if (!colorKey || seen.has(colorKey)) {
      return;
    }

    seen.set(colorKey, {
      color: task.color,
      label: task.colorLabel || task.color,
      outline: Boolean(task.outline),
    });
  });

  return Array.from(seen.values());
}

export function resolveColorSpec(colorValue, colorLabel, outlineFlag) {
  const presetFromLabel = getPreset(colorLabel);
  const presetFromValue = getPreset(colorValue);

  if (presetFromLabel) {
    return {
      color: presetFromLabel.color,
      label: presetFromLabel.label,
      outline:
        outlineFlag === undefined ? presetFromLabel.outline : Boolean(outlineFlag),
      presetKey: presetFromLabel.key,
    };
  }

  if (presetFromValue) {
    return {
      color: presetFromValue.color,
      label: presetFromValue.label,
      outline:
        outlineFlag === undefined ? presetFromValue.outline : Boolean(outlineFlag),
      presetKey: presetFromValue.key,
    };
  }

  if (typeof colorValue === "string" && isValidHexColor(colorValue)) {
    return {
      color: colorValue,
      label: stringOrNull(colorLabel) ?? colorValue,
      outline: Boolean(outlineFlag),
      presetKey: null,
    };
  }

  if (typeof colorLabel === "string" && isValidHexColor(colorLabel)) {
    return {
      color: colorLabel,
      label: colorLabel,
      outline: Boolean(outlineFlag),
      presetKey: null,
    };
  }

  if (typeof colorLabel === "string" && colorLabel.trim()) {
    return {
      color: DEFAULT_COLOR.color,
      label: colorLabel.trim(),
      outline: Boolean(outlineFlag),
      presetKey: DEFAULT_COLOR.key,
    };
  }

  return {
    color: DEFAULT_COLOR.color,
    label: DEFAULT_COLOR.label,
    outline: Boolean(
      outlineFlag === undefined ? DEFAULT_COLOR.outline : outlineFlag,
    ),
    presetKey: DEFAULT_COLOR.key,
  };
}

export function getPreset(value) {
  if (typeof value !== "string") {
    return null;
  }
  const key = value.trim().toLowerCase();
  if (!key) {
    return null;
  }
  return COLOR_LOOKUP.get(key) ?? null;
}

export function computeDurationMetrics(startDate, endDate) {
  const diffMs = Math.max(endDate.getTime() - startDate.getTime(), 0);
  const totalSeconds = Math.floor(diffMs / 1000);
  const hoursTotal = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const days = Math.floor(hoursTotal / 24);
  const hours = hoursTotal % 24;

  const durationParts = [];
  if (days) {
    durationParts.push(`${days} day${days === 1 ? "" : "s"}`);
  }
  if (hours) {
    durationParts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  }
  if (!days && minutes) {
    durationParts.push(`${minutes} min`);
  }

  const durationLabel = durationParts.length ? durationParts.join(" ") : "< 1 hr";
  const durationHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  const durationDays = Math.round((durationHours / 24) * 100) / 100;

  return {
    durationLabel,
    durationHours,
    durationDays,
    startLabel: formatHumanDate(startDate),
    endLabel: formatHumanDate(endDate),
  };
}

export function formatHumanDate(date) {
  return `${DATE_FORMATTER.format(date)} ${TIME_FORMATTER.format(date)}`;
}

export function createEditorDraftFromTask(task) {
  if (!task) {
    return null;
  }

  const preset = findPresetForTask(task);
  if (preset) {
    return {
      name: task.name,
      start: toDateTimeLocal(task.start),
      end: toDateTimeLocal(task.end),
      colorMode: preset.key,
      customColor: preset.color,
      customOutline: preset.outline,
      customLabel: preset.label,
    };
  }

  const sanitizedColor = sanitizeHexColor(task.color) ?? DEFAULT_COLOR.color;
  return {
    name: task.name,
    start: toDateTimeLocal(task.start),
    end: toDateTimeLocal(task.end),
    colorMode: CUSTOM_COLOR_KEY,
    customColor: sanitizedColor,
    customOutline: Boolean(task.outline),
    customLabel: task.colorLabel || "",
  };
}

export function buildColorSpecFromDraft(draft) {
  if (!draft) {
    return { error: "No task selected." };
  }

  if (draft.colorMode && draft.colorMode !== CUSTOM_COLOR_KEY) {
    const preset = getPresetByKey(draft.colorMode);
    if (preset) {
      return {
        color: preset.color,
        label: preset.label,
        outline: preset.outline,
        presetKey: preset.key,
      };
    }
  }

  const sanitizedColor =
    sanitizeHexColor(draft.customColor) ?? sanitizeHexColor(DEFAULT_COLOR.color);
  if (!sanitizedColor || !isValidHexColor(sanitizedColor)) {
    return { error: "Please choose a valid colour value." };
  }

  const label = stringOrNull(draft.customLabel) ?? sanitizedColor;
  return {
    color: sanitizedColor,
    label,
    outline: Boolean(draft.customOutline),
    presetKey: null,
  };
}

export function getDraftColorPreview(draft) {
  if (!draft) {
    return null;
  }

  if (draft.colorMode && draft.colorMode !== CUSTOM_COLOR_KEY) {
    const preset = getPresetByKey(draft.colorMode);
    if (preset) {
      return {
        color: preset.color,
        outline: preset.outline,
        label: preset.label,
      };
    }
  }

  const sanitizedColor =
    sanitizeHexColor(draft.customColor) ?? sanitizeHexColor(DEFAULT_COLOR.color);
  return {
    color: sanitizedColor ?? DEFAULT_COLOR.color,
    outline: Boolean(draft.customOutline),
    label: stringOrNull(draft.customLabel) ?? sanitizedColor ?? DEFAULT_COLOR.label,
  };
}

export function sanitizeHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }
  let hex = value.trim();
  if (!hex) {
    return null;
  }
  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (shortMatch) {
    const [, group] = shortMatch;
    return `#${group[0]}${group[0]}${group[1]}${group[1]}${group[2]}${group[2]}`.toLowerCase();
  }
  const longMatch = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (longMatch) {
    return `#${longMatch[1].toLowerCase()}`;
  }
  return null;
}

export function tasksToCsv(tasks) {
  const rows = tasks.map((task) => ({
    Tasks: task.name,
    "Start Date": formatCsvDate(task.start),
    Completion: formatCsvDate(task.end),
    Length: task.durationLabel,
    Color: task.colorLabel,
    position: task.position,
  }));

  return Papa.unparse(rows, {
    columns: ["Tasks", "Start Date", "Completion", "Length", "Color", "position"],
  });
}

export function formatCsvDate(value) {
  const date = coerceToDate(value);
  if (!date) {
    return "";
  }
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function stripCsvExtension(filename) {
  if (typeof filename !== "string") {
    return "uploaded";
  }
  return filename.replace(/\.csv$/i, "") || "uploaded";
}

export function formatDateForFilename(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}${month}${day}-${hours}${minutes}`;
}

export function generateTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function buildNewTaskName(index) {
  return `New Task ${index}`;
}

export function stringOrNull(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function coerceToDate(value) {
  if (!value && value !== 0) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalised = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    const date = new Date(normalised);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function toDateTimeLocal(value) {
  const date = coerceToDate(value);
  if (!date) {
    return "";
  }
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseDateTimeLocal(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const candidate = value.includes(":") && value.length === 16 ? `${value}:00` : value;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatIsoLocal(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function isValidHexColor(value) {
  if (typeof value !== "string") {
    return false;
  }
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function escapeSelector(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

export function reorderTasksById(tasks, sourceId, targetId, insertAfter = false) {
  if (!Array.isArray(tasks) || !sourceId) {
    return tasks;
  }
  const next = [...tasks];
  const sourceIndex = next.findIndex((task) => task.id === sourceId);
  if (sourceIndex === -1) {
    return tasks;
  }

  const [moved] = next.splice(sourceIndex, 1);

  if (!targetId || sourceId === targetId) {
    const insertIndex = insertAfter ? next.length : 0;
    next.splice(insertIndex, 0, moved);
    return next.map((task, idx) => ({ ...task, position: idx }));
  }

  let targetIndex = next.findIndex((task) => task.id === targetId);
  if (targetIndex === -1) {
    next.push(moved);
    return next.map((task, idx) => ({ ...task, position: idx }));
  }

  if (insertAfter) {
    targetIndex += 1;
  }
  if (targetIndex < 0) {
    targetIndex = 0;
  }
  if (targetIndex > next.length) {
    targetIndex = next.length;
  }

  next.splice(targetIndex, 0, moved);
  return next.map((task, idx) => ({ ...task, position: idx }));
}

function truncateLabel(value, maxLength = 28) {
  if (!value) {
    return "";
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

export {
  COLOR_PRESETS,
  DEFAULT_COLOR,
  CUSTOM_COLOR_KEY,
  DATE_FORMATTER,
  TIME_FORMATTER,
};
