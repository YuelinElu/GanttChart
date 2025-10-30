import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import Gantt from "frappe-gantt";
import "frappe-gantt/dist/frappe-gantt.css";

const VIEW_MODES = ["Day", "Week", "Month"];
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL && stripTrailingSlash(import.meta.env.VITE_API_BASE_URL)) ||
  window.location.origin;

const DATASET_OPTIONS = {
  DEFAULT: "default",
  EMPTY: "empty",
  UPLOADED: "uploaded",
};

const HISTORY_LIMIT = 100;

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

const DEFAULT_COLOR = COLOR_PRESETS.find((preset) => preset.key === "indigo") || COLOR_PRESETS[0];
const CUSTOM_COLOR_KEY = "custom";

function getPresetByKey(key) {
  if (!key) {
    return null;
  }
  return COLOR_LOOKUP.get(String(key).toLowerCase()) ?? null;
}

function findPresetForTask(task) {
  if (!task) {
    return null;
  }
  const normalizedColor = typeof task.color === "string" ? task.color.toLowerCase() : "";
  const candidates = [
    task.presetKey,
    task.colorLabel,
    task.color,
  ];
  for (const candidate of candidates) {
    const preset = getPresetByKey(candidate);
    if (preset && preset.color?.toLowerCase() === normalizedColor && Boolean(preset.outline) === Boolean(task.outline)) {
      return preset;
    }
  }

  const matchByColor = COLOR_PRESETS.find(
    (preset) =>
      preset.color.toLowerCase() === normalizedColor &&
      Boolean(preset.outline) === Boolean(task.outline),
  );
  return matchByColor ?? null;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const tooltipTemplate = (task) => {
  const name = escapeHtml(task.rawName || task.name || "");
  const start = escapeHtml(task.startLabel || "");
  const end = escapeHtml(task.endLabel || "");
  const duration = escapeHtml(task.durationLabel || "");

  return `
    <div class="gantt-tooltip">
      <h3 title="${name}">${name}</h3>
      <dl class="gantt-tooltip__list">
        <div class="gantt-tooltip__row">
          <dt>Starts</dt>
          <dd>${start}</dd>
        </div>
        <div class="gantt-tooltip__row">
          <dt>Ends</dt>
          <dd>${end}</dd>
        </div>
        <div class="gantt-tooltip__row">
          <dt>Duration</dt>
          <dd>${duration}</dd>
        </div>
      </dl>
    </div>
  `;
};

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [defaultTasks, setDefaultTasks] = useState([]);
  const [emptyTasks, setEmptyTasks] = useState([]);
  const [uploadedTasks, setUploadedTasks] = useState([]);
  const [uploadedName, setUploadedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const [datasetMode, setDatasetMode] = useState(DATASET_OPTIONS.DEFAULT);
  const [viewMode, setViewMode] = useState("Week");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [editorDraft, setEditorDraft] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [dragState, setDragState] = useState({
    draggingId: null,
    overId: null,
    overPosition: "before",
  });
  const updateEditorDraft = useCallback((updater) => {
    setEditorDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const patch = typeof updater === "function" ? updater(prev) : updater;
      if (!patch || typeof patch !== "object") {
        return prev;
      }
      return { ...prev, ...patch };
    });
  }, []);

  const ganttContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const topScrollbarRef = useRef(null);
  const mainScrollRef = useRef(null);
  const sidebarRootRef = useRef(null);
  const sidebarInnerRef = useRef(null);
  const styleTagRef = useRef(null);
  const uploadInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const ganttHandlersRef = useRef({ onClick: null, onDateChange: null });
  const historyRef = useRef({
    [DATASET_OPTIONS.DEFAULT]: createHistoryBucket(),
    [DATASET_OPTIONS.EMPTY]: createHistoryBucket(),
    [DATASET_OPTIONS.UPLOADED]: createHistoryBucket(),
  });
  const [, setHistoryVersion] = useState(0);
  const pendingScrollRef = useRef(null);
  const prevDatasetModeRef = useRef(datasetMode);

  const scrollTaskIntoView = useCallback(
    (taskId) => {
      if (!taskId) {
        return;
      }

      const sidebarInner = sidebarInnerRef.current;
      if (sidebarInner) {
        const selector = `[data-task-id="${escapeSelector(taskId)}"]`;
        const sidebarItem = sidebarInner.querySelector(selector);
        if (sidebarItem) {
          sidebarItem.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }

      const mainEl = mainScrollRef.current;
      const containerEl = ganttContainerRef.current;
      if (mainEl && containerEl) {
        const wrapperSelector = `.bar-wrapper[data-id="${escapeSelector(taskId)}"]`;
        const wrapper = containerEl.querySelector(wrapperSelector);
        if (wrapper) {
          wrapper.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
          if (topScrollbarRef.current) {
            topScrollbarRef.current.scrollLeft = mainEl.scrollLeft;
          }
        }
      }
    },
    [],
  );

  const focusTask = useCallback(
    (taskId, { scroll = true, ensureEditorOpen = false } = {}) => {
      if (!taskId) {
        setSelectedTaskId(null);
        return;
      }
      setSelectedTaskId(taskId);
      if (scroll) {
        pendingScrollRef.current = taskId;
      }
      if (ensureEditorOpen) {
        setIsEditorCollapsed(false);
      }
    },
    [setIsEditorCollapsed],
  );

  const bumpHistoryVersion = useCallback(() => {
    setHistoryVersion((value) => value + 1);
  }, []);

  const getHistoryForMode = useCallback((mode) => {
    if (!historyRef.current[mode]) {
      historyRef.current[mode] = createHistoryBucket();
    }
    return historyRef.current[mode];
  }, []);

  const syncHistoryPresent = useCallback(
    (mode, tasks, { resetStacks = false } = {}) => {
      const bucket = getHistoryForMode(mode);
      bucket.present = cloneTasks(normaliseTaskCollection(tasks));
      if (resetStacks) {
        bucket.past = [];
        bucket.future = [];
      }
      bumpHistoryVersion();
    },
    [bumpHistoryVersion, getHistoryForMode],
  );

  useEffect(() => {
    syncHistoryPresent(DATASET_OPTIONS.EMPTY, [], { resetStacks: true });
    syncHistoryPresent(DATASET_OPTIONS.UPLOADED, [], { resetStacks: true });
  }, [syncHistoryPresent]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchTasks() {
      try {
        setError("");
        const response = await fetch(`${API_BASE_URL}/api/tasks`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Fetch failed (${response.status})`);
        }
        const payload = await response.json();
        const normalised = normaliseTaskCollection(payload);
        const ordered = ensureStableOrder(normalised);
        setDefaultTasks(ordered);
        syncHistoryPresent(DATASET_OPTIONS.DEFAULT, ordered, { resetStacks: true });
        if (datasetMode === DATASET_OPTIONS.DEFAULT) {
          setTasks(ordered);
        }
      } catch (fetchError) {
        if (fetchError.name !== "AbortError") {
          setError("Unable to load tasks. Check that the API is running.");
          setDefaultTasks([]);
          setTasks([]);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchTasks();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let sourceTasks = [];
    if (datasetMode === DATASET_OPTIONS.DEFAULT) {
      sourceTasks = defaultTasks;
    } else if (datasetMode === DATASET_OPTIONS.EMPTY) {
      sourceTasks = emptyTasks;
    } else {
      sourceTasks = uploadedTasks;
    }

    const normalized = ensureStableOrder(sourceTasks);

    setTasks((previous) =>
      areTaskArraysEqual(previous, normalized) ? previous : normalized,
    );

    if (prevDatasetModeRef.current !== datasetMode) {
      setSelectedTaskId(null);
      setEditorError("");
      setIsEditorCollapsed(false);
    } else {
      setSelectedTaskId((current) => {
        if (!current) {
          return current;
        }
        return normalized.some((task) => task.id === current) ? current : null;
      });
    }

    prevDatasetModeRef.current = datasetMode;
  }, [datasetMode, defaultTasks, emptyTasks, uploadedTasks]);

  const ganttTasks = useMemo(() => convertTasks(tasks), [tasks]);
  const legendItems = useMemo(() => buildLegend(tasks), [tasks]);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );
  const editorColorPreview = useMemo(() => getDraftColorPreview(editorDraft), [editorDraft]);
  const colorSelectValue = editorDraft?.colorMode ?? DEFAULT_COLOR.key;
  const customColorValue = useMemo(
    () => sanitizeHexColor(editorDraft?.customColor) ?? DEFAULT_COLOR.color,
    [editorDraft?.customColor],
  );

  useEffect(() => {
    if (!selectedTask) {
      setEditorDraft(null);
      setEditorError("");
      return;
    }

    setEditorDraft(createEditorDraftFromTask(selectedTask));
    setEditorError("");
  }, [selectedTask]);

  const commitTasks = useCallback(
    (mutator, { sortMode = "preserve", normalize = false } = {}) => {
      setTasks((previous) => {
        const previousSnapshot = cloneTasks(previous);
        const candidate = typeof mutator === "function" ? mutator(previousSnapshot) : mutator;
        const prepared = normalize
          ? normaliseTaskCollection(candidate)
          : ensureStableOrder(candidate);
        const next =
          sortMode === "by-start"
            ? sortTasksByStart(prepared)
            : ensureStableOrder(prepared);

        if (areTaskArraysEqual(previous, next)) {
          return previous;
        }

        const history = getHistoryForMode(datasetMode);
        history.past.push(previousSnapshot);
        if (history.past.length > HISTORY_LIMIT) {
          history.past.shift();
        }
        history.future = [];
        history.present = cloneTasks(next);
        bumpHistoryVersion();

        if (datasetMode === DATASET_OPTIONS.DEFAULT) {
          setDefaultTasks(next);
        } else if (datasetMode === DATASET_OPTIONS.EMPTY) {
          setEmptyTasks(next);
        } else if (datasetMode === DATASET_OPTIONS.UPLOADED) {
          setUploadedTasks(next);
          if (next.length > 0) {
            setImportError("");
          }
        }

        return next;
      });
    },
    [bumpHistoryVersion, datasetMode, getHistoryForMode],
  );

  const handleTaskClick = useCallback(
    (task) => {
      if (!task?.id) {
        return;
      }
      focusTask(task.id, { scroll: false });
    },
    [focusTask],
  );

  const handleDateChange = useCallback(
    (task, start, end) => {
      if (!task?.id) {
        return;
      }
      const startDate = coerceToDate(start);
      const endDate = coerceToDate(end);
      if (!startDate || !endDate) {
        return;
      }
      const startIso = formatIsoLocal(startDate);
      const endIso = formatIsoLocal(endDate);
      commitTasks(
        (previous) =>
          previous.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  start: startIso,
                  end: endIso,
                }
              : item,
          ),
        { sortMode: "by-start", normalize: true },
      );
    },
    [commitTasks],
  );

  ganttHandlersRef.current.onClick = handleTaskClick;
  ganttHandlersRef.current.onDateChange = handleDateChange;

  const applySnapshotToMode = useCallback(
    (mode, snapshot) => {
      const snapshotTasks = ensureStableOrder(normaliseTaskCollection(snapshot));

      if (mode === DATASET_OPTIONS.DEFAULT) {
        setDefaultTasks(snapshotTasks);
      } else if (mode === DATASET_OPTIONS.EMPTY) {
        setEmptyTasks(snapshotTasks);
      } else if (mode === DATASET_OPTIONS.UPLOADED) {
        setUploadedTasks(snapshotTasks);
      }

      if (mode === datasetMode) {
        setTasks(snapshotTasks);
      }

      setSelectedTaskId((current) =>
        current && snapshotTasks.some((task) => task.id === current) ? current : null,
      );
    },
    [datasetMode],
  );

  const handleUndo = useCallback(() => {
    const history = getHistoryForMode(datasetMode);
    if (!history.past.length) {
      return;
    }

    const previousSnapshot = history.past.pop();
    const currentSnapshot = history.present ?? cloneTasks(tasks);
    history.future.push(cloneTasks(currentSnapshot));
    history.present = cloneTasks(previousSnapshot);

    applySnapshotToMode(datasetMode, previousSnapshot);
    bumpHistoryVersion();
  }, [applySnapshotToMode, bumpHistoryVersion, datasetMode, getHistoryForMode, tasks]);

  const handleRedo = useCallback(() => {
    const history = getHistoryForMode(datasetMode);
    if (!history.future.length) {
      return;
    }

    const nextSnapshot = history.future.pop();
    const currentSnapshot = history.present ?? cloneTasks(tasks);
    history.past.push(cloneTasks(currentSnapshot));
    if (history.past.length > HISTORY_LIMIT) {
      history.past.shift();
    }
    history.present = cloneTasks(nextSnapshot);

    applySnapshotToMode(datasetMode, nextSnapshot);
    bumpHistoryVersion();
  }, [applySnapshotToMode, bumpHistoryVersion, datasetMode, getHistoryForMode, tasks]);

  const hasUploadedData = uploadedTasks.length > 0;
  const showingUploadedPlaceholder =
    datasetMode === DATASET_OPTIONS.UPLOADED && !hasUploadedData;
  const historyBucket = getHistoryForMode(datasetMode);
  const canUndo = (historyBucket?.past.length ?? 0) > 0;
  const canRedo = (historyBucket?.future.length ?? 0) > 0;
  const searchStatus = searchMatches.length
    ? `${searchIndex >= 0 ? searchIndex + 1 : 0} / ${searchMatches.length}`
    : "0 / 0";

  const goToSearchResult = useCallback(
    (direction, { startAtBeginning = false } = {}) => {
      if (!searchMatches.length) {
        return;
      }
      setSearchIndex((prev) => {
        let nextIndex = prev;
        if (prev === -1 || startAtBeginning) {
          nextIndex = direction >= 0 ? 0 : searchMatches.length - 1;
        } else if (direction === 0) {
          nextIndex = prev;
        } else {
          nextIndex = (prev + direction + searchMatches.length) % searchMatches.length;
        }
        const match = searchMatches[nextIndex];
        if (match) {
          focusTask(match.id, { scroll: true });
        }
        return nextIndex;
      });
    },
    [focusTask, searchMatches],
  );

  const handleSearchChange = useCallback((event) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery("");
    setSearchMatches([]);
    setSearchIndex(-1);
    pendingScrollRef.current = null;
    searchInputRef.current?.focus();
  }, []);

  const handleSearchSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (!searchMatches.length) {
        return;
      }
      if (searchIndex === -1) {
        goToSearchResult(0, { startAtBeginning: true });
      } else {
        goToSearchResult(1);
      }
    },
    [goToSearchResult, searchIndex, searchMatches.length],
  );

  const handleSearchNext = useCallback(() => {
    if (!searchMatches.length) {
      return;
    }
    if (searchIndex === -1) {
      goToSearchResult(0, { startAtBeginning: true });
    } else {
      goToSearchResult(1);
    }
  }, [goToSearchResult, searchIndex, searchMatches.length]);

  const handleSearchPrev = useCallback(() => {
    if (!searchMatches.length) {
      return;
    }
    if (searchIndex === -1) {
      goToSearchResult(0, { startAtBeginning: true });
    } else {
      goToSearchResult(-1);
    }
  }, [goToSearchResult, searchIndex, searchMatches.length]);

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleSearchClear();
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
          handleSearchPrev();
        } else {
          handleSearchNext();
        }
      }
    },
    [handleSearchClear, handleSearchNext, handleSearchPrev],
  );

  const handleSidebarDragStart = useCallback(
    (event, taskId) => {
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", taskId);
      } catch {
        /* noop */
      }
      setDragState({ draggingId: taskId, overId: null, overPosition: "before" });
      focusTask(taskId, { scroll: false });
    },
    [focusTask],
  );

  const handleSidebarDragOver = useCallback((event, taskId) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const isAfter = event.clientY - bounds.top > bounds.height / 2;
    const nextPosition = isAfter ? "after" : "before";

    setDragState((prev) => {
      const draggingId =
        prev.draggingId || (() => {
          try {
            return event.dataTransfer.getData("text/plain");
          } catch {
            return null;
          }
        })();
      if (!draggingId || draggingId === taskId) {
        return prev.overId
          ? { draggingId, overId: null, overPosition: "before" }
          : prev;
      }
      if (prev.overId === taskId && prev.overPosition === nextPosition) {
        return prev;
      }
      return {
        draggingId,
        overId: taskId,
        overPosition: nextPosition,
      };
    });
  }, []);

  const handleSidebarDragLeave = useCallback((event) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragState((prev) => (prev.overId ? { ...prev, overId: null } : prev));
  }, []);

  const handleSidebarDrop = useCallback(
    (event, targetId) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceId = dragState.draggingId || (() => {
        try {
          return event.dataTransfer.getData("text/plain");
        } catch {
          return null;
        }
      })();
      if (!sourceId) {
        setDragState({ draggingId: null, overId: null, overPosition: "before" });
        return;
      }
      if (sourceId === targetId) {
        setDragState({ draggingId: null, overId: null, overPosition: "before" });
        return;
      }
      const placeAfter = dragState.overPosition === "after";
      commitTasks(
        (previous) => reorderTasksById(previous, sourceId, targetId, placeAfter),
        { sortMode: "preserve" },
      );
      focusTask(sourceId, { scroll: true });
      setDragState({ draggingId: null, overId: null, overPosition: "before" });
    },
    [commitTasks, dragState.draggingId, dragState.overPosition, focusTask],
  );

  const handleSidebarContainerDragOver = useCallback(
    (event) => {
      if (!dragState.draggingId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragState((prev) => {
        if (prev.overId === null && prev.overPosition === "after") {
          return prev;
        }
        return {
          draggingId: prev.draggingId,
          overId: null,
          overPosition: "after",
        };
      });
    },
    [dragState.draggingId],
  );

  const handleSidebarContainerDrop = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceId = dragState.draggingId || (() => {
        try {
          return event.dataTransfer.getData("text/plain");
        } catch {
          return null;
        }
      })();
      if (!sourceId) {
        setDragState({ draggingId: null, overId: null, overPosition: "before" });
        return;
      }
      commitTasks(
        (previous) => {
          if (!previous.length) {
            return previous;
          }
          const lastId = previous[previous.length - 1].id;
          if (lastId === sourceId) {
            return previous;
          }
          return reorderTasksById(previous, sourceId, lastId, true);
        },
        { sortMode: "preserve" },
      );
      focusTask(sourceId, { scroll: true });
      setDragState({ draggingId: null, overId: null, overPosition: "before" });
    },
    [commitTasks, dragState.draggingId, focusTask],
  );

  const handleSidebarDragEnd = useCallback(() => {
    setDragState({ draggingId: null, overId: null, overPosition: "before" });
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      setSearchMatches([]);
      setSearchIndex(-1);
      return;
    }

    const matches = tasks
      .map((task, index) => ({ id: task.id, index, task }))
      .filter(({ task }) => (task.name || "").toLowerCase().includes(trimmed));

    setSearchMatches(matches);
    setSearchIndex((prev) => {
      if (matches.length === 0) {
        return -1;
      }
      if (prev >= 0 && prev < matches.length) {
        return prev;
      }
      return -1;
    });
  }, [searchQuery, tasks]);

  useEffect(() => {
    if (!searchMatches.length) {
      return;
    }
    if (searchIndex === -1) {
      goToSearchResult(0, { startAtBeginning: true });
    }
  }, [goToSearchResult, searchIndex, searchMatches.length]);

  useEffect(() => {
    if (!selectedTaskId || !searchMatches.length) {
      return;
    }
    const idx = searchMatches.findIndex((entry) => entry.id === selectedTaskId);
    if (idx !== -1 && idx !== searchIndex) {
      setSearchIndex(idx);
    }
  }, [searchMatches, searchIndex, selectedTaskId]);

  useEffect(() => {
    const sidebarInner = sidebarInnerRef.current;
    if (!sidebarInner) {
      return;
    }
    const matchIds = new Set(searchMatches.map((entry) => entry.id));
    sidebarInner.querySelectorAll(".gantt-sidebar__item").forEach((item) => {
      const itemId = item.getAttribute("data-task-id");
      if (itemId && matchIds.has(itemId)) {
        item.classList.add("gantt-sidebar__item--matched");
      } else {
        item.classList.remove("gantt-sidebar__item--matched");
      }
    });
  }, [searchMatches]);

  useEffect(() => {
    const container = ganttContainerRef.current;
    if (!container) {
      return;
    }
    const matchIds = new Set(searchMatches.map((entry) => entry.id));
    container.querySelectorAll(".bar-wrapper").forEach((wrapper) => {
      const wrapperId = wrapper.getAttribute("data-id");
      if (wrapperId && matchIds.has(wrapperId)) {
        wrapper.classList.add("is-search-match");
      } else {
        wrapper.classList.remove("is-search-match");
      }
    });
  }, [searchMatches]);

  useEffect(() => {
    if (!selectedTaskId) {
      pendingScrollRef.current = null;
      return;
    }
    if (pendingScrollRef.current && pendingScrollRef.current === selectedTaskId) {
      scrollTaskIntoView(selectedTaskId);
      pendingScrollRef.current = null;
    }
  }, [scrollTaskIntoView, selectedTaskId]);

  const handleDatasetChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (value === datasetMode) {
        return;
      }

      if (value === DATASET_OPTIONS.UPLOADED && !hasUploadedData) {
        setImportError("Upload a CSV file to use the uploaded dataset.");
      } else {
        setImportError("");
      }

      setDatasetMode(value);
    },
    [datasetMode, hasUploadedData],
  );

  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      setImportError("");

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const fatal = results.errors?.find((err) => err.fatal);
          if (fatal) {
            setImportError(fatal.message || "Unable to read the CSV file.");
            return;
          }

          const parsedTasks = convertCsvRowsToTasks(results.data ?? []);

          if (!parsedTasks.length) {
            setImportError("No valid tasks were detected in the uploaded CSV.");
            setUploadedTasks([]);
            syncHistoryPresent(DATASET_OPTIONS.UPLOADED, [], { resetStacks: true });
            setUploadedName("");
            setDatasetMode(DATASET_OPTIONS.UPLOADED);
            setSelectedTaskId(null);
            return;
          }

          setUploadedTasks(parsedTasks);
          syncHistoryPresent(DATASET_OPTIONS.UPLOADED, parsedTasks, { resetStacks: true });
          setUploadedName(file.name);
          setDatasetMode(DATASET_OPTIONS.UPLOADED);
          setImportError("");
          setSelectedTaskId(null);
          setEditorError("");
        },
        error: (parseError) => {
          setImportError(parseError?.message || "Unable to read the CSV file.");
        },
        transform: (value) => (typeof value === "string" ? value.trim() : value),
      });

      event.target.value = "";
    },
    [],
  );

  const handleAddTask = useCallback(() => {
    const now = new Date();
    const baseline = selectedTask ? coerceToDate(selectedTask.start) ?? now : now;
    const startDate = new Date(baseline.getTime());
    const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);

    const newTask = {
      id: generateTaskId(),
      name: buildNewTaskName(tasks.length + 1),
      start: formatIsoLocal(startDate),
      end: formatIsoLocal(endDate),
      color: DEFAULT_COLOR.color,
      colorLabel: DEFAULT_COLOR.label,
      outline: DEFAULT_COLOR.outline,
      presetKey: DEFAULT_COLOR.key,
    };

    commitTasks((previous) => [...previous, newTask], { normalize: true });
    focusTask(newTask.id, { ensureEditorOpen: true });
  }, [commitTasks, focusTask, selectedTask, tasks.length]);

  const handleDeleteTask = useCallback(() => {
    if (!selectedTask) {
      return;
    }
    commitTasks((previous) => previous.filter((task) => task.id !== selectedTask.id));
    setSelectedTaskId(null);
  }, [commitTasks, selectedTask]);

  const handleEditorFieldChange = useCallback(
    (event) => {
      const { name, type } = event.target;
      const value = type === "checkbox" ? event.target.checked : event.target.value;
      if (name === "customOutline") {
        updateEditorDraft({ [name]: value, colorMode: CUSTOM_COLOR_KEY });
      } else {
        updateEditorDraft({ [name]: value });
      }
    },
    [updateEditorDraft],
  );

  const handleColorModeChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (value === CUSTOM_COLOR_KEY) {
        updateEditorDraft((prev) => ({
          colorMode: CUSTOM_COLOR_KEY,
          customColor: sanitizeHexColor(prev.customColor) ?? prev.customColor ?? DEFAULT_COLOR.color,
        }));
        setEditorError("");
        return;
      }

      const preset = getPresetByKey(value);
      if (preset) {
        updateEditorDraft({
          colorMode: preset.key,
          customColor: preset.color,
          customOutline: preset.outline,
          customLabel: preset.label,
        });
        setEditorError("");
      }
    },
    [updateEditorDraft],
  );

  const handleCustomColorChange = useCallback(
    (event) => {
      const rawValue = event.target.value;
      updateEditorDraft((prev) => ({
        colorMode: CUSTOM_COLOR_KEY,
        customColor:
          sanitizeHexColor(rawValue) ?? sanitizeHexColor(prev.customColor) ?? DEFAULT_COLOR.color,
      }));
      setEditorError("");
    },
    [updateEditorDraft],
  );

  const handleCustomLabelChange = useCallback(
    (event) => {
      const value = event.target.value;
      updateEditorDraft({
        customLabel: value,
        colorMode: CUSTOM_COLOR_KEY,
      });
    },
    [updateEditorDraft],
  );

  const handleEditorReset = useCallback(() => {
    if (!selectedTask) {
      return;
    }
    setEditorDraft(createEditorDraftFromTask(selectedTask));
    setEditorError("");
  }, [selectedTask]);

  const handleEditorSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (!selectedTask || !editorDraft) {
        return;
      }

      const trimmedName = editorDraft.name?.trim() || selectedTask.name;
      const startDate = parseDateTimeLocal(editorDraft.start);
      const endDate = parseDateTimeLocal(editorDraft.end);

      if (!startDate || !endDate) {
        setEditorError("Please provide valid start and end values.");
        return;
      }

      if (endDate.getTime() < startDate.getTime()) {
        setEditorError("End time must be after the start time.");
        return;
      }

      const colorSpec = buildColorSpecFromDraft(editorDraft);
      if (colorSpec?.error) {
        setEditorError(colorSpec.error);
        return;
      }

      const startIso = formatIsoLocal(startDate);
      const endIso = formatIsoLocal(endDate);
      const startChanged = startIso !== selectedTask.start;

      commitTasks(
        (previous) =>
          previous.map((task) =>
            task.id === selectedTask.id
              ? {
                  ...task,
                  name: trimmedName,
                  start: startIso,
                  end: endIso,
                  color: colorSpec.color,
                  colorLabel: colorSpec.label,
                  outline: colorSpec.outline,
                  presetKey: colorSpec.presetKey,
                }
              : task,
          ),
        { sortMode: startChanged ? "by-start" : "preserve", normalize: startChanged },
      );

      setEditorError("");
    },
    [commitTasks, editorDraft, selectedTask],
  );

  const handleExport = useCallback(() => {
    if (!tasks.length) {
      return;
    }

    const csv = tasksToCsv(tasks);
    const filename =
      datasetMode === DATASET_OPTIONS.UPLOADED && uploadedName
        ? `${stripCsvExtension(uploadedName)}-edited.csv`
        : `gantt-tasks-${formatDateForFilename(new Date())}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [datasetMode, tasks, uploadedName]);

  useEffect(() => {
    const container = ganttContainerRef.current;
    if (!container) {
      return;
    }

    if (!ganttTasks.length) {
      container.innerHTML = "";
      if (styleTagRef.current) {
        styleTagRef.current.remove();
        styleTagRef.current = null;
      }
      chartInstanceRef.current = null;
      return;
    }

    const options = {
      view_mode: viewMode,
      date_format: "YYYY-MM-DD HH:mm",
      language: "en",
      custom_popup_html: tooltipTemplate,
      bar_height: 28,
      padding: 22,
      on_click: (task) => ganttHandlersRef.current.onClick?.(task),
      on_date_change: (task, start, end) =>
        ganttHandlersRef.current.onDateChange?.(task, start, end),
    };

    if (chartInstanceRef.current) {
      chartInstanceRef.current.options = {
        ...chartInstanceRef.current.options,
        ...options,
      };
      chartInstanceRef.current.refresh(ganttTasks);
      chartInstanceRef.current.change_view_mode(viewMode);
    } else {
      chartInstanceRef.current = new Gantt(container, ganttTasks, options);
    }

    const frame = requestAnimationFrame(() =>
      applyColours(
        ganttTasks,
        styleTagRef,
        container,
        topScrollbarRef.current,
        mainScrollRef.current,
        sidebarRootRef.current,
        sidebarInnerRef.current,
      ),
    );

    return () => cancelAnimationFrame(frame);
  }, [ganttTasks, viewMode]);

  useEffect(() => {
    const container = ganttContainerRef.current;
    if (!container) {
      return;
    }
    const wrappers = container.querySelectorAll(".bar-wrapper");
    wrappers.forEach((wrapper) => {
      if (wrapper.dataset?.id === selectedTaskId) {
        wrapper.classList.add("is-selected");
      } else {
        wrapper.classList.remove("is-selected");
      }
    });
  }, [ganttTasks, selectedTaskId]);

  useEffect(() => {
    const top = topScrollbarRef.current;
    const main = mainScrollRef.current;
    const sidebar = sidebarRootRef.current;
    if (!top || !main || !sidebar) {
      return undefined;
    }

    let isSyncing = false;

    const syncFromTop = () => {
      if (isSyncing) {
        return;
      }
      isSyncing = true;
      main.scrollLeft = top.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    const syncFromMain = () => {
      if (isSyncing) {
        return;
      }
      isSyncing = true;
      top.scrollLeft = main.scrollLeft;
      sidebar.scrollTop = main.scrollTop;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    const syncFromSidebar = () => {
      if (isSyncing) {
        return;
      }
      isSyncing = true;
      main.scrollTop = sidebar.scrollTop;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    top.addEventListener("scroll", syncFromTop);
    main.addEventListener("scroll", syncFromMain);
    sidebar.addEventListener("scroll", syncFromSidebar);

    return () => {
      top.removeEventListener("scroll", syncFromTop);
      main.removeEventListener("scroll", syncFromMain);
      sidebar.removeEventListener("scroll", syncFromSidebar);
    };
  }, [ganttTasks.length]);

  useEffect(() => {
    const container = ganttContainerRef.current;
    const main = mainScrollRef.current;
    const sidebarRoot = sidebarRootRef.current;
    const sidebarInner = sidebarInnerRef.current;
    syncTopScrollbar(main, topScrollbarRef.current);
    syncSidebarMetrics(container, sidebarRoot, sidebarInner);
    adjustSidebarWidth(ganttTasks, sidebarRoot);
  }, [ganttTasks, viewMode]);

  useEffect(() => {
    const handler = () => {
      const container = ganttContainerRef.current;
      const main = mainScrollRef.current;
      const sidebarRoot = sidebarRootRef.current;
      const sidebarInner = sidebarInnerRef.current;
      syncTopScrollbar(main, topScrollbarRef.current);
      syncSidebarMetrics(container, sidebarRoot, sidebarInner);
      adjustSidebarWidth(ganttTasks, sidebarRoot);
    };

    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [ganttTasks]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented) {
        return;
      }
      const modifierPressed = event.metaKey || event.ctrlKey;
      if (!modifierPressed || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRedo, handleUndo]);

  return (
    <div className="layout">
      <header className="layout__header">
        <div>
          <h1>Project Timeline</h1>
          <p className="subtitle">
            Interactive Gantt chart sourced live from <code>data/data.csv</code>
          </p>
        </div>

        <div className="controls">
          <span className="controls__label">View</span>
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`controls__button${viewMode === mode ? " controls__button--active" : ""}`}
              onClick={() => setViewMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>

      <section className="toolbar" aria-label="Dataset and file controls">
        <div className="toolbar__group">
          <label className="toolbar__label" htmlFor="dataset-select">
            Dataset
          </label>
          <select
            id="dataset-select"
            className="toolbar__select"
            value={datasetMode}
            onChange={handleDatasetChange}
          >
            <option value={DATASET_OPTIONS.DEFAULT}>Show default (data/data.csv)</option>
            <option value={DATASET_OPTIONS.EMPTY}>Show empty</option>
            <option value={DATASET_OPTIONS.UPLOADED}>
              {hasUploadedData && uploadedName
                ? `Show uploaded (${uploadedName})`
                : "Show uploaded"}
            </option>
          </select>
        </div>
        <div className="toolbar__group toolbar__group--search">
          <form className="toolbar__search" onSubmit={handleSearchSubmit}>
            <label className="sr-only" htmlFor="task-search">
              Search tasks
            </label>
            <div className="toolbar__search-field">
              <input
                id="task-search"
                ref={searchInputRef}
                className="toolbar__search-input"
                type="search"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search tasks…"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="toolbar__search-clear"
                  onClick={handleSearchClear}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <div className="toolbar__search-controls">
              <span className="toolbar__search-count">{searchStatus}</span>
              <button
                type="button"
                className="toolbar__search-button"
                onClick={handleSearchPrev}
                disabled={!searchMatches.length}
                aria-label="Previous match"
              >
                Prev
              </button>
              <button
                type="button"
                className="toolbar__search-button"
                onClick={handleSearchNext}
                disabled={!searchMatches.length}
                aria-label="Next match"
              >
                Next
              </button>
            </div>
          </form>
        </div>
        <div className="toolbar__group toolbar__group--actions">
          <button
            type="button"
            className="toolbar__button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="toolbar__button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
          >
            Redo
          </button>
          <button type="button" className="toolbar__button" onClick={handleAddTask}>
            Add Task
          </button>
          <button
            type="button"
            className="toolbar__button"
            onClick={handleExport}
            disabled={!tasks.length}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="toolbar__button toolbar__button--primary"
            onClick={handleUploadClick}
          >
            Import CSV
          </button>
          <input
            ref={uploadInputRef}
            className="toolbar__file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileInputChange}
          />
        </div>
      </section>

      {legendItems.length > 0 && (
        <aside className="legend" aria-label="Task colour legend">
          {legendItems.map((item) => (
            <span
              key={`${item.color}-${item.outline ? "outline" : "solid"}`}
              className="legend__item"
            >
              <span
                className="legend__swatch"
                style={
                  item.outline
                    ? { border: `2px solid ${item.color}`, backgroundColor: "transparent" }
                    : { backgroundColor: item.color }
                }
              />
              <span className="legend__label">{item.label}</span>
            </span>
          ))}
        </aside>
      )}

      <main className="layout__content">
        {loading && <p className="status">Loading tasks...</p>}
        {error && <p className="status status--error">{error}</p>}
        {importError && <p className="status status--error">{importError}</p>}
        {datasetMode === DATASET_OPTIONS.UPLOADED &&
          hasUploadedData &&
          uploadedName &&
          !importError && <p className="status status--info">Showing tasks from {uploadedName}</p>}
        {showingUploadedPlaceholder && !importError && (
          <p className="status status--info">
            Upload a CSV file or add tasks to populate the uploaded dataset.
          </p>
        )}
        {!loading &&
          !error &&
          !importError &&
          !showingUploadedPlaceholder &&
          ganttTasks.length === 0 && (
            <p className="status">
              {datasetMode === DATASET_OPTIONS.EMPTY
                ? 'No tasks yet. Use "Add Task" to start building your timeline.'
                : "No tasks available in the dataset."}
            </p>
          )}

        <section className="editor" aria-label="Task editor">
          <div className="editor__head">
            <div className="editor__head-left">
              <h2>Task details</h2>
              <button
                type="button"
                className="editor__toggle"
                onClick={() => setIsEditorCollapsed((prev) => !prev)}
                disabled={!selectedTask}
              >
                {isEditorCollapsed ? "Show details" : "Hide details"}
              </button>
            </div>
            <button
              type="button"
              className="editor__delete"
              onClick={handleDeleteTask}
              disabled={!selectedTask}
            >
              Delete task
            </button>
          </div>
          {selectedTask ? (
            isEditorCollapsed ? (
              <div className="editor__collapsed" role="status" aria-live="polite">
                <p className="editor__collapsed-name" title={selectedTask.name}>
                  {selectedTask.name}
                </p>
                <p className="editor__collapsed-dates">
                  {selectedTask.startLabel}
                  {" -> "}
                  {selectedTask.endLabel}
                </p>
                <p className="editor__collapsed-duration">Duration: {selectedTask.durationLabel}</p>
              </div>
            ) : (
              <form className="editor__form" onSubmit={handleEditorSubmit} onReset={handleEditorReset}>
                <div className="editor__grid">
                  <label className="editor__field" htmlFor="task-name">
                    <span>Name</span>
                    <input
                      id="task-name"
                    name="name"
                    type="text"
                    value={editorDraft?.name ?? ""}
                    onChange={handleEditorFieldChange}
                    required
                    placeholder="Task name"
                  />
                </label>
                <label className="editor__field" htmlFor="task-start">
                  <span>Start</span>
                  <input
                    id="task-start"
                    name="start"
                    type="datetime-local"
                    value={editorDraft?.start ?? ""}
                    onChange={handleEditorFieldChange}
                    required
                    step="60"
                  />
                </label>
                <label className="editor__field" htmlFor="task-end">
                  <span>End</span>
                  <input
                    id="task-end"
                    name="end"
                    type="datetime-local"
                    value={editorDraft?.end ?? ""}
                    onChange={handleEditorFieldChange}
                    required
                    step="60"
                  />
                </label>
                <label className="editor__field editor__field--full">
                  <span>Colour</span>
                  <div className="editor__color">
                    <div className="editor__color-row">
                      <span
                        className={`editor__color-preview${
                          editorColorPreview?.outline ? " editor__color-preview--outline" : ""
                        }`}
                        style={{
                          backgroundColor: editorColorPreview?.outline
                            ? "transparent"
                            : editorColorPreview?.color ?? DEFAULT_COLOR.color,
                          borderColor: editorColorPreview?.color ?? DEFAULT_COLOR.color,
                          color: editorColorPreview?.color ?? DEFAULT_COLOR.color,
                        }}
                        aria-hidden="true"
                      />
                      <select
                        className="editor__select"
                        value={colorSelectValue}
                        onChange={handleColorModeChange}
                      >
                        {COLOR_PRESETS.map((preset) => (
                          <option key={preset.key} value={preset.key}>
                            {preset.label}
                          </option>
                        ))}
                        <option value={CUSTOM_COLOR_KEY}>Custom</option>
                      </select>
                      <span className="editor__color-label">
                        {editorColorPreview?.label || "—"}
                      </span>
                    </div>
                    {editorDraft?.colorMode === CUSTOM_COLOR_KEY && (
                      <div className="editor__color-custom">
                        <label className="editor__color-picker">
                          <input
                            type="color"
                            value={customColorValue}
                            onChange={handleCustomColorChange}
                          />
                          <span>{customColorValue.toUpperCase()}</span>
                        </label>
                        <label className="editor__checkbox">
                          <input
                            type="checkbox"
                            name="customOutline"
                            checked={Boolean(editorDraft?.customOutline)}
                            onChange={handleEditorFieldChange}
                          />
                          <span>Outline only</span>
                        </label>
                        <label className="editor__field editor__field--nested" htmlFor="task-color-label">
                          <span>Colour label</span>
                          <input
                            id="task-color-label"
                            name="customLabel"
                            type="text"
                            value={editorDraft?.customLabel ?? ""}
                            onChange={handleCustomLabelChange}
                            placeholder="Legend label (optional)"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </label>
              </div>
              {editorError && <p className="editor__error">{editorError}</p>}
              <div className="editor__meta">
                <span>Starts: {selectedTask.startLabel}</span>
                <span>Ends: {selectedTask.endLabel}</span>
                <span>Duration: {selectedTask.durationLabel}</span>
              </div>
              <div className="editor__actions">
                <button type="submit" className="editor__button editor__button--primary">
                  Save changes
                </button>
                <button type="reset" className="editor__button">
                  Reset
                </button>
              </div>
              </form>
            )
          ) : (
            <p className="editor__empty">Select a task to edit its details.</p>
          )}
        </section>

        <div className="gantt-wrapper">
          <div className="gantt-scrollbar" ref={topScrollbarRef}>
            <div className="gantt-scrollbar__shim" />
          </div>
          <div className="gantt-shell">
            <aside className="gantt-sidebar" ref={sidebarRootRef}>
              <div className="gantt-sidebar__header">Task Name</div>
              <div
                className="gantt-sidebar__inner"
                ref={sidebarInnerRef}
                onDragOver={handleSidebarContainerDragOver}
                onDrop={handleSidebarContainerDrop}
              >
                {ganttTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`gantt-sidebar__item${
                      selectedTaskId === task.id ? " gantt-sidebar__item--selected" : ""
                    }${
                      dragState.draggingId === task.id ? " gantt-sidebar__item--dragging" : ""
                    }${
                      dragState.overId === task.id
                        ? dragState.overPosition === "after"
                          ? " gantt-sidebar__item--drag-over-after"
                          : " gantt-sidebar__item--drag-over-before"
                        : ""
                    }`}
                    title={task.rawName}
                    data-task-id={task.id}
                    draggable={ganttTasks.length > 1}
                    onDragStart={(event) => handleSidebarDragStart(event, task.id)}
                    onDragOver={(event) => handleSidebarDragOver(event, task.id)}
                    onDragLeave={handleSidebarDragLeave}
                    onDrop={(event) => handleSidebarDrop(event, task.id)}
                    onDragEnd={handleSidebarDragEnd}
                    onClick={() => focusTask(task.id, { scroll: false })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        focusTask(task.id, { scroll: false });
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="gantt-sidebar__text">{task.rawName}</span>
                  </div>
                ))}
              </div>
            </aside>
            <div className="gantt-main" ref={mainScrollRef}>
              <div ref={ganttContainerRef} className="gantt-container" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function convertCsvRowsToTasks(rows) {
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

function normaliseTaskCollection(records) {
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

function normaliseTaskRecord(record, index = 0) {
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

function sortTasksByStart(tasks) {
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

function convertTasks(rawTasks) {
  const ordered = ensureStableOrder(rawTasks);
  return ordered.map((task) => ({
    ...task,
    rawName: task.name,
    name: truncateLabel(task.name),
    progress: 100,
    custom_class: `task-color-${task.id}`,
  }));
}

function ensureStableOrder(tasks) {
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

function buildLegend(rawTasks) {
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

function resolveColorSpec(colorValue, colorLabel, outlineFlag) {
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

function getPreset(value) {
  if (typeof value !== "string") {
    return null;
  }
  const key = value.trim().toLowerCase();
  if (!key) {
    return null;
  }
  return COLOR_LOOKUP.get(key) ?? null;
}

function computeDurationMetrics(startDate, endDate) {
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

function formatHumanDate(date) {
  return `${DATE_FORMATTER.format(date)} ${TIME_FORMATTER.format(date)}`;
}

function applyColours(
  ganttTasks,
  styleTagRef,
  containerEl,
  topScrollbarEl,
  mainEl,
  sidebarRootEl,
  sidebarInnerEl,
) {
  if (styleTagRef.current) {
    styleTagRef.current.remove();
    styleTagRef.current = null;
  }

  if (!ganttTasks.length || !containerEl) {
    return;
  }

  const styles = ganttTasks
    .map((task) =>
      task.outline
        ? `
.gantt .bar-wrapper[data-id="${task.id}"] .bar {
  fill: transparent;
  stroke: ${task.color};
  stroke-width: 2;
}
.gantt .bar-wrapper[data-id="${task.id}"] .bar-progress {
  opacity: 0;
}
.gantt .bar-wrapper[data-id="${task.id}"] .handle {
  stroke: ${task.color};
}
.gantt .bar-wrapper[data-id="${task.id}"].active .bar {
  stroke: ${task.color};
  stroke-width: 2;
}
`
        : `
.gantt .bar-wrapper[data-id="${task.id}"] .bar {
  fill: ${task.color};
  stroke: rgba(17, 24, 39, 0.15);
}
.gantt .bar-wrapper[data-id="${task.id}"] .bar-progress {
  fill: ${task.color};
  opacity: 0.7;
}
.gantt .bar-wrapper[data-id="${task.id}"] .handle {
  stroke: ${task.color};
}
.gantt .bar-wrapper[data-id="${task.id}"].active .bar {
  stroke: ${task.color};
  stroke-width: 1.5;
}
`,
    )
    .join("\n");

  const styleTag = document.createElement("style");
  styleTag.setAttribute("data-generated", "gantt-colours");
  styleTag.textContent = styles;
  document.head.appendChild(styleTag);
  styleTagRef.current = styleTag;

  requestAnimationFrame(() => {
    adjustLabelPositions(ganttTasks, containerEl, sidebarInnerEl);
    syncTopScrollbar(mainEl, topScrollbarEl);
    syncSidebarMetrics(containerEl, sidebarRootEl, sidebarInnerEl);
    adjustSidebarWidth(ganttTasks, sidebarRootEl);
  });
}

function truncateLabel(value, maxLength = 28) {
  if (!value) {
    return "";
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function stripTrailingSlash(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const luminanceCache = new Map();

function adjustLabelPositions(ganttTasks, containerEl, sidebarInnerEl) {
  if (!containerEl) {
    return;
  }

  const labels = containerEl.querySelectorAll(".bar-label");
  const barWrappers = containerEl.querySelectorAll(".bar-wrapper");

  if (!labels.length || labels.length !== barWrappers.length) {
    return;
  }

  const insidePadding = 32;
  const outsideGap = 24;

  ganttTasks.forEach((task, index) => {
    const label = labels[index];
    const wrapper = barWrappers[index];
    if (!label || !wrapper) {
      return;
    }

    const bar = wrapper.querySelector(".bar");
    if (!bar) {
      return;
    }

    const barX = Number.parseFloat(bar.getAttribute("x") ?? "0");
    const barWidth = Number.parseFloat(bar.getAttribute("width") ?? "0");
    if (!Number.isFinite(barX) || !Number.isFinite(barWidth)) {
      return;
    }

    const labelBox = label.getBBox();
    const labelWidth = labelBox?.width ?? 0;

    label.classList.remove("bar-label--inside", "bar-label--outside", "bar-label--outside-left");

    const fillIsDark = !task.outline && isColorDark(task.color);
    const fitsInside = barWidth > 0 && labelWidth + insidePadding <= barWidth;

    if (fitsInside) {
      const centerX = barX + barWidth / 2;
      label.setAttribute("x", centerX.toString());
      label.setAttribute("text-anchor", "middle");
      label.classList.add("bar-label--inside");
      label.style.fill = fillIsDark ? "#ffffff" : "#0f172a";
    } else {
      let outsideX = barX + barWidth + outsideGap;
      let anchor = "start";
      let outsideClass = "bar-label--outside";

      const containerWidth = containerEl.getBoundingClientRect().width;
      if (outsideX + labelWidth > containerWidth - outsideGap) {
        outsideX = Math.max(barX - outsideGap, outsideGap);
        anchor = "end";
        outsideClass = "bar-label--outside-left";
      }

      label.setAttribute("x", outsideX.toString());
      label.setAttribute("text-anchor", anchor);
      label.classList.add(outsideClass);
      label.style.fill = "#0f172a";
    }
  });

  if (sidebarInnerEl) {
    const bars = containerEl.querySelectorAll(".bar-wrapper");
    if (bars.length) {
      const barRect = bars[0].getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();
      sidebarInnerEl.style.paddingTop = `${Math.max(barRect.top - containerRect.top, 0)}px`;
    }
  }
}

function isColorDark(color) {
  if (!color) {
    return true;
  }

  const key = color.toLowerCase();
  if (luminanceCache.has(key)) {
    return luminanceCache.get(key);
  }

  const rgb = parseCssColor(color);
  if (!rgb) {
    luminanceCache.set(key, true);
    return true;
  }

  const [r, g, b] = rgb.map((channel) => channel / 255);
  const luminance =
    0.2126 * lineariseChannel(r) +
    0.7152 * lineariseChannel(g) +
    0.0722 * lineariseChannel(b);

  const isDark = luminance < 0.6;
  luminanceCache.set(key, isDark);
  return isDark;
}

function lineariseChannel(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function parseCssColor(color) {
  const ctx = parseCssColor._ctx || (parseCssColor._ctx = create2dContext());
  if (!ctx) {
    return null;
  }

  try {
    ctx.fillStyle = "#000000";
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    if (!computed) {
      return null;
    }

    if (computed.startsWith("#")) {
      const hex = computed.slice(1);
      if (hex.length === 3) {
        const [r, g, b] = hex.split("").map((ch) => parseInt(ch + ch, 16));
        if ([r, g, b].some(Number.isNaN)) {
          return null;
        }
        return [r, g, b];
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if ([r, g, b].some(Number.isNaN)) {
          return null;
        }
        return [r, g, b];
      }
      return null;
    }

    const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
  } catch (error) {
    // Ignore parsing errors and fall back to default.
  }

  return null;
}

function create2dContext() {
  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}

function syncTopScrollbar(scrollEl, topScrollbarEl) {
  if (!scrollEl || !topScrollbarEl) {
    return;
  }

  const shim = topScrollbarEl.querySelector(".gantt-scrollbar__shim");
  if (!shim) {
    return;
  }

  const scrollWidth = Math.max(scrollEl.scrollWidth, scrollEl.clientWidth);
  const clientWidth = scrollEl.clientWidth;

  shim.style.width = `${scrollWidth}px`;

  if (scrollWidth > clientWidth + 1) {
    topScrollbarEl.style.display = "block";
  } else {
    topScrollbarEl.style.display = "none";
    topScrollbarEl.scrollLeft = 0;
  }

  if (Math.abs(topScrollbarEl.scrollLeft - scrollEl.scrollLeft) > 1) {
    topScrollbarEl.scrollLeft = scrollEl.scrollLeft;
  }
}

function syncSidebarMetrics(containerEl, sidebarRootEl, sidebarInnerEl) {
  if (!containerEl || !sidebarRootEl || !sidebarInnerEl) {
    return;
  }

  const gridRows = containerEl.querySelectorAll(".grid-row");
  const barWrappers = containerEl.querySelectorAll(".bar-wrapper");
  if (!gridRows.length || !barWrappers.length) {
    return;
  }

  const gridRowRect = gridRows[0].getBoundingClientRect();
  const lastGridRect = gridRows[gridRows.length - 1].getBoundingClientRect();
  const firstBarRect = barWrappers[0].getBoundingClientRect();
  const attrHeight = Number.parseFloat(gridRows[0].getAttribute("height") ?? "0");
  const containerRect = containerEl.getBoundingClientRect();
  const headerRect = containerEl.querySelector(".grid-header")?.getBoundingClientRect();

  const headerHeight =
    headerRect && Number.isFinite(headerRect.height) && headerRect.height > 0
      ? headerRect.height
      : 48;
  const headerBottom = headerRect ? headerRect.bottom : containerRect.top + headerHeight;

  const rowHeight =
    Number.isFinite(gridRowRect.height) && gridRowRect.height > 0
      ? gridRowRect.height
      : Number.isFinite(attrHeight) && attrHeight > 0
      ? attrHeight
      : 52;

  const paddingTop = Math.max(gridRowRect.top - headerBottom, 0);
  const paddingBottom = Math.max(containerRect.bottom - lastGridRect.bottom, 0);
  const barOffset = Math.max(firstBarRect.top - gridRowRect.top, 0);

  sidebarRootEl.style.setProperty("--gantt-header-height", `${headerHeight}px`);
  sidebarRootEl.style.setProperty("--gantt-row-height", `${rowHeight}px`);
  sidebarRootEl.style.setProperty("--gantt-bar-offset", `${barOffset}px`);

  sidebarInnerEl.style.paddingTop = `${paddingTop}px`;
  sidebarInnerEl.style.paddingBottom = `${paddingBottom}px`;
  sidebarInnerEl.style.setProperty("--gantt-offset-top", `${paddingTop}px`);
  sidebarInnerEl.style.setProperty("--gantt-offset-bottom", `${paddingBottom}px`);
}

function adjustSidebarWidth(tasks, sidebarEl) {
  if (!sidebarEl || !tasks?.length) {
    return;
  }

  const ctx = getMeasurementContext();
  if (!ctx) {
    return;
  }

  ctx.font = '600 15px "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  let maxTextWidth = 0;
  for (const task of tasks) {
    const label = task.rawName || task.name || "";
    const metrics = ctx.measureText(label);
    maxTextWidth = Math.max(maxTextWidth, metrics.width);
  }

  const padding = 1.1 * 16 + 0.85 * 16 + 32;
  const desiredWidth = Math.min(420, Math.max(220, Math.ceil(maxTextWidth + padding)));

  sidebarEl.style.setProperty("--gantt-sidebar-width", `${desiredWidth}px`);
}

let measurementCtx = null;

function getMeasurementContext() {
  if (measurementCtx) {
    return measurementCtx;
  }
  const canvas = document.createElement("canvas");
  measurementCtx = canvas.getContext("2d");
  return measurementCtx;
}

function reorderTasksById(tasks, sourceId, targetId, insertAfter = false) {
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

function createEditorDraftFromTask(task) {
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

function buildColorSpecFromDraft(draft) {
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

function getDraftColorPreview(draft) {
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

function sanitizeHexColor(value) {
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

function createHistoryBucket(initial = []) {
  const snapshot = normaliseTaskCollection(initial);
  return {
    past: [],
    future: [],
    present: cloneTasks(snapshot),
  };
}

function cloneTasks(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }
  return tasks.map((task) => ({ ...task }));
}

function areTaskArraysEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (!areTasksEqual(a[index], b[index])) {
      return false;
    }
  }
  return true;
}

function areTasksEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keys = [
    "id",
    "name",
    "start",
    "end",
    "color",
    "colorLabel",
    "outline",
    "durationLabel",
    "durationHours",
    "durationDays",
    "startLabel",
    "endLabel",
    "position",
  ];
  return keys.every((key) => a[key] === b[key]);
}

function formatIsoLocal(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function toDateTimeLocal(value) {
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

function parseDateTimeLocal(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const candidate = value.includes(":") && value.length === 16 ? `${value}:00` : value;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tasksToCsv(tasks) {
  const rows = tasks.map((task) => ({
    Tasks: task.name,
    "Start Date": formatCsvDate(task.start),
    Completion: formatCsvDate(task.end),
    Length: task.durationLabel,
    Color: task.colorLabel,
  }));

  return Papa.unparse(rows, {
    columns: ["Tasks", "Start Date", "Completion", "Length", "Color"],
  });
}

function formatCsvDate(value) {
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

function stripCsvExtension(filename) {
  if (typeof filename !== "string") {
    return "uploaded";
  }
  return filename.replace(/\.csv$/i, "") || "uploaded";
}

function formatDateForFilename(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}${month}${day}-${hours}${minutes}`;
}

function generateTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildNewTaskName(index) {
  return `New Task ${index}`;
}

function stringOrNull(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function coerceToDate(value) {
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

function isValidHexColor(value) {
  if (typeof value !== "string") {
    return false;
  }
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeSelector(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}






