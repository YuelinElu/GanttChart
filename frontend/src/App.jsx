import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Gantt from "frappe-gantt";
import "frappe-gantt/dist/frappe-gantt.css";
import useTaskManager from "./hooks/useTaskManager";
import Toolbar from "./components/Toolbar";
import TaskEditor from "./components/TaskEditor";
import TaskSidebar from "./components/TaskSidebar";
import SummaryBar from "./components/SummaryBar";
import ShiftModal from "./components/ShiftModal";
import { DATASET_OPTIONS, VIEW_MODES, SORT_MODES } from "./constants/appConstants";
import {
  COLOR_PRESETS,
  CUSTOM_COLOR_KEY,
  DEFAULT_COLOR,
  buildColorSpecFromDraft,
  buildNewTaskName,
  coerceToDate,
  computeDurationMetrics,
  convertTasks,
  createEditorDraftFromTask,
  formatIsoLocal,
  formatHumanDate,
  generateTaskId,
  getDraftColorPreview,
  normaliseHexColor,
  parseDateTimeLocal,
  sortTasksByEnd,
  sortTasksByOriginalPosition,
  sortTasksByStart,
  toDateTimeLocal,
  reorderTasksById,
  escapeSelector,
  stripCsvExtension,
  sanitizeFilenameStem,
} from "./utils/taskUtils";
import {
  adjustSidebarWidth,
  applyTaskStyles,
  highlightSearchMatches,
  highlightSelectedTasks,
  syncSidebarMetrics,
  syncTopScrollbar,
} from "./utils/ganttDom";
import "./styles.css";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL && stripTrailingSlash(import.meta.env.VITE_API_BASE_URL)) ||
  window.location.origin;

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

const DATE_ERROR_MESSAGE = "End time must be after the start time.";
const DEFAULT_TASK_DURATION_MS = 4 * 60 * 60 * 1000;

export default function App() {
  const {
    tasks,
    datasetMode,
    selectDataset,
    loading,
    error,
    importError,
    uploadedName,
    hasUploadedData,
    showingUploadedPlaceholder,
    mutateTasks,
    undo,
    redo,
    canUndo,
    canRedo,
    importFromFile,
    exportTasks,
  } = useTaskManager(API_BASE_URL);

  const [viewMode, setViewMode] = useState("Week");
  const [sortMode, setSortMode] = useState(SORT_MODES.ORIGINAL);
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
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [pendingNewTask, setPendingNewTask] = useState(null);
  const [title, setTitle] = useState(() => {
    if (typeof window === "undefined") {
      return "Project Timeline";
    }
    try {
      const storage = typeof window !== "undefined" ? window.localStorage : null;
      return storage?.getItem("gantt-title") || "Project Timeline";
    } catch {
      return "Project Timeline";
    }
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [fatalErrorMessage, setFatalErrorMessage] = useState("");

  const ganttContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const topScrollbarRef = useRef(null);
  const mainScrollRef = useRef(null);
  const sidebarRootRef = useRef(null);
  const sidebarInnerRef = useRef(null);
  const styleTagRef = useRef(null);
  const uploadInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const selectionAnchorRef = useRef(null);
  const ganttHandlersRef = useRef({ onClick: null, onDateChange: null });
  const pendingScrollRef = useRef(null);
  const isSyncingScrollRef = useRef({ fromMain: false, fromTop: false });

  const ganttTasks = useMemo(() => convertTasks(tasks), [tasks]);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );
  const editorColorPreview = useMemo(() => getDraftColorPreview(editorDraft), [editorDraft]);
  const colorSelectValue =
    editorDraft?.colorMode ??
    (selectedTask ? selectedTask.presetKey ?? CUSTOM_COLOR_KEY : DEFAULT_COLOR.key);
  const customColorValue = editorDraft?.customColor ?? "";
  const normalisedCustomColor = useMemo(
    () => normaliseHexColor(customColorValue),
    [customColorValue],
  );
  const isCustomMode = editorDraft?.colorMode === CUSTOM_COLOR_KEY;
  const totalTaskCount = tasks.length;
  const selectedCount = selectedTaskIds.length;
  const hasTasks = tasks.length > 0;
  const editorDatesInvalid = useMemo(() => {
    if (!editorDraft) {
      return false;
    }
    const start = parseDateTimeLocal(editorDraft.start);
    const end = parseDateTimeLocal(editorDraft.end);
    if (!start || !end) {
      return false;
    }
    return end.getTime() < start.getTime();
  }, [editorDraft]);
  const customColorError = useMemo(() => {
    if (!isCustomMode) {
      return "";
    }
    return normalisedCustomColor ? "" : "Enter a valid hex colour like #1A3F5C.";
  }, [isCustomMode, normalisedCustomColor]);
  const customColorPickerValue = normalisedCustomColor ?? DEFAULT_COLOR.color;
  const colorOptions = useMemo(
    () => [
      ...COLOR_PRESETS,
      { key: CUSTOM_COLOR_KEY, label: "Custom", color: customColorPickerValue, outline: false },
    ],
    [customColorPickerValue],
  );
  const disableSubmit = editorDatesInvalid || (isCustomMode && Boolean(customColorError));
  const hasSelection = selectedTaskIds.length > 0;
  const applyColorDisabled = !hasSelection || (isCustomMode && Boolean(customColorError));
  const searchStatus = searchMatches.length
    ? `${searchIndex >= 0 ? searchIndex + 1 : 0} / ${searchMatches.length}`
    : "0 / 0";
  const datasetLabel = useMemo(() => {
    switch (datasetMode) {
      case DATASET_OPTIONS.DEFAULT:
        return "Default dataset";
      case DATASET_OPTIONS.EMPTY:
        return "Empty workspace";
      case DATASET_OPTIONS.UPLOADED:
        return uploadedName ? `Uploaded (${uploadedName})` : "Uploaded dataset";
      default:
        return "";
    }
  }, [datasetMode, uploadedName]);
  const scheduleSummary = useMemo(() => {
    if (!tasks.length) {
      return {
        count: 0,
        earliestLabel: "N/A",
        latestLabel: "N/A",
        spanLabel: "N/A",
        progressPercent: null,
        progressLabel: "N/A",
        progressDateLabel: "",
      };
    }

    let earliest = null;
    let latest = null;

    tasks.forEach((task) => {
      const start = coerceToDate(task.start) ?? coerceToDate(task.end);
      const end = coerceToDate(task.end) ?? coerceToDate(task.start);
      if (start && (!earliest || start.getTime() < earliest.getTime())) {
        earliest = start;
      }
      if (end && (!latest || end.getTime() > latest.getTime())) {
        latest = end;
      }
    });

    if (!earliest || !latest) {
      return {
        count: tasks.length,
        earliestLabel: "N/A",
        latestLabel: "N/A",
        spanLabel: "N/A",
      };
    }

    const metrics = computeDurationMetrics(earliest, latest);
    const now = new Date();
    const totalMs = Math.max(latest.getTime() - earliest.getTime(), 0);
    const elapsedMs = Math.min(Math.max(now.getTime() - earliest.getTime(), 0), totalMs);
    const progressPercent = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0;
    const progressLabel = `${progressPercent}% elapsed`;
    const progressDateLabel = `Today · ${formatHumanDate(now)}`;

    return {
      count: tasks.length,
      earliestLabel: metrics?.startLabel ?? formatHumanDate(earliest),
      latestLabel: metrics?.endLabel ?? formatHumanDate(latest),
      spanLabel: metrics?.durationLabel ?? "N/A",
      progressPercent,
      progressLabel,
      progressDateLabel,
    };
  }, [tasks]);

  const currentSortMutationMode = useMemo(() => {
    if (sortMode === SORT_MODES.START) {
      return "by-start";
    }
    if (sortMode === SORT_MODES.END) {
      return "by-end";
    }
    return "preserve";
  }, [sortMode]);

  const pendingPreviewTask = useMemo(() => {
    if (!pendingNewTask || !editorDraft) {
      return null;
    }
    const startDate = parseDateTimeLocal(editorDraft.start);
    const endDate = parseDateTimeLocal(editorDraft.end);
    if (!startDate || !endDate) {
      return null;
    }
    const metrics = computeDurationMetrics(startDate, endDate);
    const preview = getDraftColorPreview(editorDraft) ?? DEFAULT_COLOR;
    return {
      id: "__pending__",
      name: editorDraft.name ?? "",
      start: formatIsoLocal(startDate),
      end: formatIsoLocal(endDate),
      startLabel: metrics.startLabel,
      endLabel: metrics.endLabel,
      durationLabel: metrics.durationLabel,
      color: preview.color,
      colorLabel: preview.label,
      outline: preview.outline,
    };
  }, [editorDraft, pendingNewTask]);

  const editorSubject = pendingPreviewTask ?? selectedTask;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storage = typeof window !== "undefined" ? window.localStorage : null;
      storage?.setItem("gantt-title", title);
    } catch {
      // Ignore storage failures (e.g., private browsing or quota restrictions)
    }
  }, [title]);

  const getNextOriginalPosition = useCallback(() => {
    if (!tasks.length) {
      return 0;
    }
    return (
      tasks.reduce((max, task) => {
        const candidate = Number.isFinite(task?.originalPosition)
          ? Number(task.originalPosition)
          : Number.isFinite(task?.position)
          ? Number(task.position)
          : 0;
        return candidate > max ? candidate : max;
      }, -1) + 1
    );
  }, [tasks]);

  const computeBaselineForIndex = useCallback(
    (index) => {
      const now = new Date();
      const before = index > 0 ? tasks[index - 1] : null;
      const after = index < tasks.length ? tasks[index] : null;
      if (before) {
        const candidate =
          coerceToDate(before.end) ?? coerceToDate(before.start);
        if (candidate) {
          return new Date(candidate.getTime());
        }
      }
      if (after) {
        const candidate = coerceToDate(after.start);
        if (candidate) {
          return new Date(candidate.getTime());
        }
      }
      return now;
    },
    [tasks],
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
    [],
  );

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

      const container = ganttContainerRef.current;
      const main = mainScrollRef.current;
      const top = topScrollbarRef.current;
      if (container && main) {
        const wrapper = container.querySelector(
          `.bar-wrapper[data-id="${escapeSelector(taskId)}"]`,
        );
        if (wrapper) {
          wrapper.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
          if (top) {
            top.scrollLeft = main.scrollLeft;
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    const pendingId = pendingScrollRef.current;
    if (pendingId && selectedTaskId === pendingId) {
      scrollTaskIntoView(pendingId);
      pendingScrollRef.current = null;
    }
  }, [scrollTaskIntoView, selectedTaskId]);

  useEffect(() => {
    setSelectedTaskId((current) => {
      if (!current) {
        return current;
      }
      return tasks.some((task) => task.id === current) ? current : null;
    });
  }, [tasks]);

  useEffect(() => {
    setSelectedTaskIds((prev) => {
      const filtered = prev.filter((id) => tasks.some((task) => task.id === id));
      if (filtered.length !== prev.length) {
        selectionAnchorRef.current =
          filtered.length > 0 ? filtered[filtered.length - 1] : selectedTaskId ?? null;
        return filtered;
      }
      return prev;
    });
  }, [selectedTaskId, tasks]);

  const discardPendingNewTask = useCallback(() => {
    if (!pendingNewTask) {
      return;
    }
    setPendingNewTask(null);
    setEditorDraft(null);
    setEditorError("");
    setSelectedTaskId(null);
    setSelectedTaskIds([]);
    selectionAnchorRef.current = null;
  }, [pendingNewTask]);

  const handleTaskClick = useCallback(
    (task) => {
      if (pendingNewTask) {
        discardPendingNewTask();
      }
      if (task?.id) {
        setSelectedTaskIds([]);
        selectionAnchorRef.current = task.id;
        focusTask(task.id, { scroll: false });
      }
    },
    [discardPendingNewTask, focusTask, pendingNewTask],
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
      const startChanged = startIso !== task.start;
      const endChanged = endIso !== task.end;
      let sortDirective = currentSortMutationMode;
      if (sortMode === SORT_MODES.START && (startChanged || endChanged)) {
        sortDirective = "by-start";
      } else if (sortMode === SORT_MODES.END && (startChanged || endChanged)) {
        sortDirective = "by-end";
      }

      mutateTasks(
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
        { normalize: true, sortMode: sortDirective },
      );
    },
    [currentSortMutationMode, mutateTasks, sortMode],
  );

  useEffect(() => {
    ganttHandlersRef.current.onClick = handleTaskClick;
    ganttHandlersRef.current.onDateChange = handleDateChange;
  }, [handleDateChange, handleTaskClick]);

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
      highlightSearchMatches(container, []);
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

    const frame = requestAnimationFrame(() => {
      applyTaskStyles(ganttTasks, container, styleTagRef);
      const sidebarRoot = sidebarRootRef.current;
      const sidebarInner = sidebarInnerRef.current;
      const mainScroll = mainScrollRef.current;
      const topScrollbar = topScrollbarRef.current;
      if (mainScroll && topScrollbar) {
        syncTopScrollbar(mainScroll, topScrollbar);
      }
      if (container && sidebarRoot && sidebarInner) {
        syncSidebarMetrics(container, sidebarRoot, sidebarInner);
        adjustSidebarWidth(sidebarRoot, sidebarInner);
      }
      highlightSearchMatches(
        container,
        searchMatches.map((entry) => entry.id),
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [ganttTasks, viewMode, searchMatches]);

  useEffect(() => {
    const handleResize = () => {
      const container = ganttContainerRef.current;
      const sidebarRoot = sidebarRootRef.current;
      const sidebarInner = sidebarInnerRef.current;
      const mainScroll = mainScrollRef.current;
      const topScrollbar = topScrollbarRef.current;
      if (mainScroll && topScrollbar) {
        syncTopScrollbar(mainScroll, topScrollbar);
      }
      if (container && sidebarRoot && sidebarInner) {
        syncSidebarMetrics(container, sidebarRoot, sidebarInner);
        adjustSidebarWidth(sidebarRoot, sidebarInner);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const main = mainScrollRef.current;
    const top = topScrollbarRef.current;
    if (!main || !top) {
      return;
    }

    const syncState = isSyncingScrollRef.current;

    const handleMainScroll = () => {
      if (syncState.fromTop) {
        return;
      }
      syncState.fromMain = true;
      top.scrollLeft = main.scrollLeft;
      syncState.fromMain = false;
    };

    const handleTopScroll = () => {
      if (syncState.fromMain) {
        return;
      }
      syncState.fromTop = true;
      main.scrollLeft = top.scrollLeft;
      syncState.fromTop = false;
    };

    main.addEventListener("scroll", handleMainScroll);
    top.addEventListener("scroll", handleTopScroll);

    return () => {
      main.removeEventListener("scroll", handleMainScroll);
      top.removeEventListener("scroll", handleTopScroll);
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchMatches([]);
      setSearchIndex(-1);
      const container = ganttContainerRef.current;
      if (container) {
        highlightSearchMatches(container, []);
      }
      return;
    }

    const matches = tasks
      .filter((task) => (task.name || "").toLowerCase().includes(query))
      .map((task) => ({ id: task.id }));
    setSearchMatches(matches);
    setSearchIndex(matches.length ? 0 : -1);
  }, [searchQuery, tasks]);

  useEffect(() => {
    const sidebarInner = sidebarInnerRef.current;
    if (!sidebarInner) {
      return;
    }
    const matchIds = new Set(searchMatches.map((entry) => entry.id));
    sidebarInner.querySelectorAll(".gantt-sidebar__item").forEach((item) => {
      const id = item.getAttribute("data-task-id");
      if (id && matchIds.has(id)) {
        item.classList.add("gantt-sidebar__item--matched");
      } else {
        item.classList.remove("gantt-sidebar__item--matched");
      }
    });
  }, [searchMatches]);

  useEffect(() => {
    if (searchIndex < 0 || !searchMatches[searchIndex]) {
      return;
    }
    const target = searchMatches[searchIndex];
    focusTask(target.id, { scroll: true });
  }, [focusTask, searchIndex, searchMatches]);

  useEffect(() => {
    setSelectedTaskIds([]);
    selectionAnchorRef.current = null;
  }, [datasetMode]);

  useEffect(() => {
    const container = ganttContainerRef.current;
    const ids =
      selectedTaskIds.length > 0
        ? selectedTaskIds
        : selectedTaskId
        ? [selectedTaskId]
        : [];
    highlightSelectedTasks(container, ids);
  }, [selectedTaskId, selectedTaskIds]);

  useEffect(() => {
    if (editorDatesInvalid) {
      setEditorError((prev) => (prev === DATE_ERROR_MESSAGE ? prev : DATE_ERROR_MESSAGE));
    } else if (editorError === DATE_ERROR_MESSAGE) {
      setEditorError("");
    }
  }, [editorDatesInvalid, editorError]);

  useEffect(() => {
    if (pendingNewTask) {
      return;
    }
    if (!selectedTask) {
      setEditorDraft(null);
      setEditorError("");
      return;
    }
    setEditorDraft(createEditorDraftFromTask(selectedTask));
    setEditorError("");
  }, [pendingNewTask, selectedTask]);

  useEffect(() => {
    setSortMode(SORT_MODES.ORIGINAL);
    setPendingNewTask(null);
    setEditorDraft(null);
    setEditorError("");
    setSelectedTaskId(null);
    setSelectedTaskIds([]);
    selectionAnchorRef.current = null;
    mutateTasks((previous) => [...previous], { sortMode: "by-original" });
  }, [datasetMode, mutateTasks]);

  useEffect(() => {
    const handleWindowError = (event) => {
      const message = event?.message || event?.error?.message;
      if (message) {
        setFatalErrorMessage(message);
      }
    };
    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      const message =
        reason?.message || event?.message || (typeof reason === "string" ? reason : "");
      if (message) {
        setFatalErrorMessage(message);
      }
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (isEditingTitle) {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    }
  }, [isEditingTitle]);

  const handleDatasetChange = useCallback(
    (event) => {
      const value = event.target.value;
      setPendingNewTask(null);
      setEditorDraft(null);
      setEditorError("");
      setSelectedTaskId(null);
      setSelectedTaskIds([]);
      selectionAnchorRef.current = null;
      selectDataset(value);
    },
    [selectDataset],
  );

  const handleSortChange = useCallback(
    (event) => {
      const mode = event.target.value;
      if (
        mode !== SORT_MODES.ORIGINAL &&
        mode !== SORT_MODES.START &&
        mode !== SORT_MODES.END
      ) {
        return;
      }
      setSortMode(mode);
      const sortDirective =
        mode === SORT_MODES.START
          ? "by-start"
          : mode === SORT_MODES.END
          ? "by-end"
          : "by-original";
      mutateTasks((previous) => [...previous], { normalize: false, sortMode: sortDirective });
    },
    [mutateTasks],
  );

  const handleTitleChange = useCallback((event) => {
    setTitleDraft(event.target.value);
  }, []);

  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (trimmed) {
      setTitle(trimmed);
    }
    setIsEditingTitle(false);
  }, [titleDraft]);

  const handleTitleDoubleClick = useCallback(() => {
    setTitleDraft(title);
    setIsEditingTitle(true);
  }, [title]);

  const handleTitleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTitle();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setIsEditingTitle(false);
      }
    },
    [commitTitle],
  );

  const handleTitleBlur = useCallback(() => {
    commitTitle();
  }, [commitTitle]);

  const handleSidebarTaskClick = useCallback(
    (
      taskId,
      { shiftKey = false, metaKey = false, ctrlKey = false } = {},
    ) => {
      if (pendingNewTask) {
        discardPendingNewTask();
      }
      const multiKey = metaKey || ctrlKey;
      const hasSelection = selectedTaskIds.length > 0;
      const anchor =
        selectionAnchorRef.current ??
        (selectedTaskIds.length > 0
          ? selectedTaskIds[selectedTaskIds.length - 1]
          : selectedTaskId ?? taskId);

      if (shiftKey && tasks.length > 0) {
        const anchorIndex = tasks.findIndex((task) => task.id === anchor);
        const targetIndex = tasks.findIndex((task) => task.id === taskId);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          const rangeIds = tasks.slice(start, end + 1).map((task) => task.id);
          setSelectedTaskIds(rangeIds);
          selectionAnchorRef.current = taskId;
        } else {
          setSelectedTaskIds([taskId]);
          selectionAnchorRef.current = taskId;
        }
        return;
      }

      if (multiKey) {
        setSelectedTaskIds((prev) => {
          const set = new Set(prev);
          if (set.has(taskId)) {
            set.delete(taskId);
          } else {
            set.add(taskId);
          }
          const ordered = tasks
            .map((task) => task.id)
            .filter((id) => set.has(id));
          return ordered;
        });
        selectionAnchorRef.current = taskId;
        return;
      }

      if (hasSelection) {
        selectionAnchorRef.current = taskId;
        return;
      }

      setSelectedTaskIds([]);
      selectionAnchorRef.current = taskId;
      focusTask(taskId, { scroll: true, ensureEditorOpen: true });
    },
    [discardPendingNewTask, focusTask, pendingNewTask, selectedTaskId, selectedTaskIds, tasks],
  );

  const handleToggleTaskSelection = useCallback(
    (taskId, isSelected) => {
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        if (isSelected) {
          next.add(taskId);
          selectionAnchorRef.current = taskId;
        } else {
          next.delete(taskId);
          if (selectionAnchorRef.current === taskId) {
            const orderedRemaining = tasks
              .map((task) => task.id)
              .filter((id) => next.has(id));
            selectionAnchorRef.current =
              orderedRemaining.length > 0
                ? orderedRemaining[orderedRemaining.length - 1]
                : selectedTaskId ?? null;
          }
        }
        const ordered = tasks
          .map((task) => task.id)
          .filter((id) => next.has(id));
        return ordered;
      });
    },
    [selectedTaskId, tasks],
  );

  const handleToggleSelectAll = useCallback(
    (checked) => {
      if (checked) {
        const ids = tasks.map((task) => task.id);
        setSelectedTaskIds(ids);
        selectionAnchorRef.current = ids.length ? ids[ids.length - 1] : null;
      } else {
        setSelectedTaskIds([]);
        selectionAnchorRef.current = selectedTaskId ?? null;
      }
    },
    [selectedTaskId, tasks],
  );

  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        const result = await importFromFile(file);
        if (result?.success) {
          setSelectedTaskId(null);
          setEditorError("");
          setIsEditorCollapsed(false);
        }
      } finally {
        // Reset the input so the same file can be selected again.
        event.target.value = "";
      }
    },
    [importFromFile],
  );

  const beginCreateTask = useCallback(
    (insertIndex, baselineDate) => {
      const startDate =
        baselineDate instanceof Date ? new Date(baselineDate.getTime()) : new Date();
      const endDate = new Date(startDate.getTime() + DEFAULT_TASK_DURATION_MS);
      const draft = {
        name: buildNewTaskName(tasks.length + 1),
        start: toDateTimeLocal(startDate),
        end: toDateTimeLocal(endDate),
        colorMode: DEFAULT_COLOR.key,
        customColor: DEFAULT_COLOR.color,
      };
      setPendingNewTask({
        insertIndex,
        baselineStart: startDate.toISOString(),
        baselineEnd: endDate.toISOString(),
      });
      setEditorDraft(draft);
      setEditorError("");
      setIsEditorCollapsed(false);
      setSelectedTaskId(null);
      setSelectedTaskIds([]);
      selectionAnchorRef.current = null;
    },
    [tasks.length],
  );

  const handleAddTask = useCallback(() => {
    const anchorId =
      selectionAnchorRef.current ??
      (selectedTaskIds.length > 0
        ? selectedTaskIds[selectedTaskIds.length - 1]
        : selectedTaskId);
    let insertIndex = tasks.length;
    if (anchorId) {
      const anchorIndex = tasks.findIndex((task) => task.id === anchorId);
      if (anchorIndex !== -1) {
        insertIndex = anchorIndex + 1;
      }
    }
    const baseline = computeBaselineForIndex(insertIndex);
    beginCreateTask(insertIndex, baseline);
  }, [
    beginCreateTask,
    computeBaselineForIndex,
    selectedTaskId,
    selectedTaskIds,
    tasks,
  ]);

  const handleInsertTaskAtIndex = useCallback(
    (index) => {
      const baseline = computeBaselineForIndex(index);
      beginCreateTask(index, baseline);
    },
    [beginCreateTask, computeBaselineForIndex],
  );

  const handleDeleteTask = useCallback(() => {
    if (pendingNewTask) {
      discardPendingNewTask();
      return;
    }
    if (!selectedTask) {
      return;
    }
    mutateTasks((previous) => previous.filter((task) => task.id !== selectedTask.id), {
      normalize: true,
      sortMode: currentSortMutationMode,
    });
    setSelectedTaskId(null);
  }, [currentSortMutationMode, discardPendingNewTask, mutateTasks, pendingNewTask, selectedTask]);

  const handleEditorFieldChange = useCallback((event) => {
    const { name, type, value, checked } = event.target;
    setEditorDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const nextValue = type === "checkbox" ? checked : value;
      return {
        ...prev,
        [name]: nextValue,
      };
    });
    if (name !== "start" && name !== "end") {
      setEditorError("");
    }
  }, []);

  const handleColorModeChange = useCallback(
    (event) => {
      const value = event.target.value;
      if (value === CUSTOM_COLOR_KEY) {
        setEditorDraft((prev) => {
          if (!prev) {
            return prev;
          }
          const fromDraft =
            typeof prev.customColor === "string" && prev.customColor.trim()
              ? prev.customColor.trim()
              : null;
          const fromTask =
            selectedTask && typeof selectedTask.color === "string"
              ? selectedTask.color.trim()
              : null;
          const fallback =
            fromDraft ||
            (fromTask && fromTask.startsWith("#") ? fromTask : null) ||
            DEFAULT_COLOR.color;
          return {
            ...prev,
            colorMode: CUSTOM_COLOR_KEY,
            customColor: fallback,
          };
        });
        setEditorError("");
        return;
      }

      const preset = COLOR_PRESETS.find((item) => item.key === value) ?? DEFAULT_COLOR;
      setEditorDraft((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          colorMode: preset.key,
        };
      });
      setEditorError("");
    },
    [selectedTask],
  );

  const handleApplyColorToSelection = useCallback(() => {
    if (!editorDraft) {
      return;
    }
    if (editorDraft.colorMode === CUSTOM_COLOR_KEY && customColorError) {
      setEditorError(customColorError);
      return;
    }
    const colorSpec = buildColorSpecFromDraft(editorDraft);
    if (colorSpec?.error) {
      setEditorError(colorSpec.error);
      return;
    }
    const targetIds = new Set(selectedTaskIds);
    if (!targetIds.size && selectedTaskId) {
      targetIds.add(selectedTaskId);
    }
    if (!targetIds.size) {
      setEditorError("Select at least one task to apply colour.");
      return;
    }
    mutateTasks(
      (previous) =>
        previous.map((task) =>
          targetIds.has(task.id)
            ? {
                ...task,
                color: colorSpec.color,
                colorLabel: colorSpec.label,
                outline: colorSpec.outline,
                presetKey: colorSpec.presetKey ?? null,
              }
            : task,
        ),
      { normalize: true, sortMode: currentSortMutationMode },
    );
    setEditorError("");
  }, [
    currentSortMutationMode,
    editorDraft,
    customColorError,
    mutateTasks,
    selectedTaskId,
    selectedTaskIds,
    setEditorError,
  ]);

  const handleEditorReset = useCallback(() => {
    if (pendingNewTask) {
      const startDate = coerceToDate(pendingNewTask.baselineStart) ?? new Date();
      const endDate =
        coerceToDate(pendingNewTask.baselineEnd) ??
        new Date(startDate.getTime() + DEFAULT_TASK_DURATION_MS);
        setEditorDraft({
          name: buildNewTaskName(tasks.length + 1),
          start: toDateTimeLocal(startDate),
          end: toDateTimeLocal(endDate),
          colorMode: DEFAULT_COLOR.key,
          customColor: DEFAULT_COLOR.color,
        });
      setEditorError("");
      return;
    }
    if (!selectedTask) {
      return;
    }
    setEditorDraft(createEditorDraftFromTask(selectedTask));
    setEditorError("");
  }, [pendingNewTask, selectedTask, tasks.length]);

  const handleEditorSubmit = useCallback(
    (event) => {
      event.preventDefault();
      if (!editorDraft) {
        return;
      }

      const trimmedName = editorDraft.name?.trim();
      if (!trimmedName) {
        setEditorError("Please provide a task name.");
        return;
      }

      const startDate = parseDateTimeLocal(editorDraft.start);
      const endDate = parseDateTimeLocal(editorDraft.end);
      if (!startDate || !endDate) {
        setEditorError("Please provide valid start and end values.");
        return;
      }
      if (editorDatesInvalid || endDate.getTime() < startDate.getTime()) {
        setEditorError(DATE_ERROR_MESSAGE);
        return;
      }
      if (editorDraft.colorMode === CUSTOM_COLOR_KEY && customColorError) {
        setEditorError(customColorError);
        return;
      }

      const colorSpec = buildColorSpecFromDraft(editorDraft);
      if (colorSpec?.error) {
        setEditorError(colorSpec.error);
        return;
      }

      const startIso = formatIsoLocal(startDate);
      const endIso = formatIsoLocal(endDate);

      if (pendingNewTask) {
        const newId = generateTaskId();
        const insertIndex = Math.max(
          0,
          Math.min(pendingNewTask.insertIndex ?? tasks.length, tasks.length),
        );
        const originalPosition = getNextOriginalPosition();

        mutateTasks(
          (previous) => {
            const next = [...previous];
            const draftRecord = {
              id: newId,
              name: trimmedName,
              start: startIso,
              end: endIso,
              color: colorSpec.color,
              colorLabel: colorSpec.label,
              outline: colorSpec.outline,
              presetKey: colorSpec.presetKey ?? null,
              position: insertIndex,
              originalPosition,
            };
            next.splice(insertIndex, 0, draftRecord);
            return next;
          },
          { normalize: true, sortMode: currentSortMutationMode },
        );

        setPendingNewTask(null);
        setEditorError("");
        setSelectedTaskIds([]);
        selectionAnchorRef.current = newId;
        setSelectedTaskId(newId);
        pendingScrollRef.current = newId;
        return;
      }

      if (!selectedTask) {
        return;
      }

      const startChanged = startIso !== selectedTask.start;
      const endChanged = endIso !== selectedTask.end;
      let sortDirective = currentSortMutationMode;
      if (sortMode === SORT_MODES.START && (startChanged || endChanged)) {
        sortDirective = "by-start";
      } else if (sortMode === SORT_MODES.END && (startChanged || endChanged)) {
        sortDirective = "by-end";
      }

      mutateTasks(
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
                  presetKey: colorSpec.presetKey ?? null,
                }
              : task,
          ),
        { normalize: true, sortMode: sortDirective },
      );

      setEditorError("");
    },
    [
      currentSortMutationMode,
      editorDatesInvalid,
      editorDraft,
      customColorError,
      getNextOriginalPosition,
      mutateTasks,
      pendingNewTask,
      selectedTask,
      sortMode,
    ],
  );

  const handleExport = useCallback(() => {
    const snapshot = exportTasks();
    if (!snapshot) {
      return;
    }

    const defaultStem = stripCsvExtension(snapshot.filename);
    let chosenStem = defaultStem;

    try {
      const userInput = window.prompt(
        "Name this export (the .csv extension is added automatically):",
        defaultStem,
      );

      if (userInput === null) {
        return;
      }

      if (typeof userInput === "string") {
        const sanitized = sanitizeFilenameStem(userInput);
        if (sanitized) {
          chosenStem = sanitized;
        } else if (userInput.trim()) {
          // If input contained only invalid characters, keep the default stem.
          chosenStem = defaultStem;
        } else {
          chosenStem = defaultStem;
        }
      }
    } catch {
      chosenStem = defaultStem;
    }

    const filename = `${chosenStem || defaultStem}.csv`;
    const blob = new Blob([snapshot.csvContent], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [exportTasks, sanitizeFilenameStem, stripCsvExtension]);

  const handleSearchChange = useCallback((event) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleSearchNext = useCallback(() => {
    if (!searchMatches.length) {
      return;
    }
    setSearchIndex((prev) => {
      if (prev < 0) {
        return 0;
      }
      return (prev + 1) % searchMatches.length;
    });
  }, [searchMatches.length]);

  const handleSearchPrev = useCallback(() => {
    if (!searchMatches.length) {
      return;
    }
    setSearchIndex((prev) => {
      if (prev <= 0) {
        return searchMatches.length - 1;
      }
      return prev - 1;
    });
  }, [searchMatches.length]);

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        handleSearchPrev();
      } else {
        handleSearchNext();
      }
    },
    [handleSearchNext, handleSearchPrev],
  );

  const handleSearchClear = useCallback(() => {
    setSearchQuery("");
    setSearchMatches([]);
    setSearchIndex(-1);
    searchInputRef.current?.focus();
  }, []);

  const openShiftModal = useCallback(() => {
    if (totalTaskCount === 0) {
      return;
    }
    setIsShiftModalOpen(true);
  }, [totalTaskCount]);

  const handleCloseShiftModal = useCallback(() => {
    setIsShiftModalOpen(false);
  }, []);

  const handleShiftSubmit = useCallback(
    ({ amount, unit, direction }) => {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return;
      }
      const unitMap = {
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
      };
      const unitMs = unitMap[unit] ?? unitMap.days;
      const offset = numericAmount * unitMs * (direction === "backward" ? -1 : 1);
      if (offset === 0) {
        setIsShiftModalOpen(false);
        return;
      }
      const selection = selectedTaskIds.length ? new Set(selectedTaskIds) : null;

      mutateTasks(
        (previous) =>
          previous.map((task) => {
            if (selection && !selection.has(task.id)) {
              return task;
            }
            const startDate = coerceToDate(task.start);
            const endDate = coerceToDate(task.end);
            if (!startDate || !endDate) {
              return task;
            }
            return {
              ...task,
              start: formatIsoLocal(new Date(startDate.getTime() + offset)),
              end: formatIsoLocal(new Date(endDate.getTime() + offset)),
            };
          }),
        { normalize: true, sortMode: currentSortMutationMode },
      );

      setIsShiftModalOpen(false);
    },
    [currentSortMutationMode, mutateTasks, selectedTaskIds],
  );

  const handleSidebarDragStart = useCallback(
    (event, taskId) => {
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", taskId);
      } catch {
        /* ignore */
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

    setDragState((prev) => {
      const draggingId =
        prev.draggingId ||
        (() => {
          try {
            return event.dataTransfer.getData("text/plain");
          } catch {
            return null;
          }
        })();

      if (!draggingId || draggingId === taskId) {
        return {
          draggingId,
          overId: null,
          overPosition: "before",
        };
      }

      return {
        draggingId,
        overId: taskId,
        overPosition: isAfter ? "after" : "before",
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
      const sourceId =
        dragState.draggingId ||
        (() => {
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
      mutateTasks(
        (previous) => reorderTasksById(previous, sourceId, targetId, placeAfter),
        { normalize: false },
      );
      focusTask(sourceId, { scroll: true });
      setDragState({ draggingId: null, overId: null, overPosition: "before" });
    },
    [dragState.draggingId, dragState.overPosition, focusTask, mutateTasks],
  );

  const handleSidebarContainerDragOver = useCallback(
    (event) => {
      if (!dragState.draggingId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragState((prev) => ({
        draggingId: prev.draggingId,
        overId: null,
        overPosition: "after",
      }));
    },
    [dragState.draggingId],
  );

  const handleSidebarContainerDrop = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceId =
        dragState.draggingId ||
        (() => {
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

      mutateTasks((previous) => reorderTasksById(previous, sourceId, null, true));
      focusTask(sourceId, { scroll: true });
      setDragState({ draggingId: null, overId: null, overPosition: "before" });
    },
    [dragState.draggingId, focusTask, mutateTasks],
  );

  const handleSidebarDragEnd = useCallback(() => {
    setDragState({ draggingId: null, overId: null, overPosition: "before" });
  }, []);

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
          redo();
        } else {
          undo();
        }
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo]);

  let content;
  try {
    content = (
      <div className="layout">
        {fatalErrorMessage ? (
          <div className="fatal-error-banner" role="alert">
            <strong>Runtime error:</strong> {fatalErrorMessage}
          </div>
        ) : null}
        <header className="layout__header">
          <div className="layout__headline">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                className="layout__title-input"
                value={titleDraft}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                aria-label="Project title"
              />
            ) : (
              <h1 onDoubleClick={handleTitleDoubleClick} title="Double-click to rename project">
                {title}
              </h1>
            )}
            <p className="subtitle">Real-time project scheduling dashboard for teams</p>
          </div>
          <SummaryBar summary={scheduleSummary} datasetLabel={datasetLabel} />
        </header>

      <Toolbar
        datasetMode={datasetMode}
        hasUploadedData={hasUploadedData}
        uploadedName={uploadedName}
        onDatasetChange={handleDatasetChange}
        onAddTask={handleAddTask}
        onExport={handleExport}
        onImportClick={handleUploadClick}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          hasTasks={hasTasks}
          selectedCount={selectedCount}
          totalCount={totalTaskCount}
          onShiftClick={openShiftModal}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearchKeyDown={handleSearchKeyDown}
          onSearchClear={handleSearchClear}
          searchStatus={searchStatus}
          onSearchPrev={handleSearchPrev}
          onSearchNext={handleSearchNext}
          hasSearchMatches={searchMatches.length > 0}
          uploadInputRef={uploadInputRef}
          onFileInputChange={handleFileInputChange}
          searchInputRef={searchInputRef}
        />

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

          <TaskEditor
            selectedTask={editorSubject}
            isCreating={Boolean(pendingNewTask)}
            isCollapsed={isEditorCollapsed}
            onToggleCollapse={() => setIsEditorCollapsed((prev) => !prev)}
            onDelete={handleDeleteTask}
            onDiscardNew={discardPendingNewTask}
          onSubmit={handleEditorSubmit}
          onReset={handleEditorReset}
          draft={editorDraft}
          onFieldChange={handleEditorFieldChange}
          onColorModeChange={handleColorModeChange}
          colorSelectValue={String(colorSelectValue)}
          colorPresets={colorOptions}
          colorPreview={editorColorPreview}
          customColorKey={CUSTOM_COLOR_KEY}
          customColorValue={customColorValue}
          customColorPickerValue={customColorPickerValue}
          customColorError={customColorError}
          isDateInvalid={editorDatesInvalid}
          dateErrorMessage={DATE_ERROR_MESSAGE}
          disableSubmit={disableSubmit}
          editorError={editorError}
          canApplyColorToSelection={hasSelection}
          applyColorDisabled={applyColorDisabled}
          onApplyColorToSelection={handleApplyColorToSelection}
        />
          <div className="gantt-wrapper">
            <div className="gantt-controls">
              <div className="gantt-view" role="group" aria-label="Timeline view mode">
                <span className="gantt-view__label">View</span>
                <div className="gantt-view__buttons">
                  {VIEW_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`gantt-view__button${viewMode === mode ? " gantt-view__button--active" : ""}`}
                      onClick={() => setViewMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="gantt-sort">
                <label className="gantt-sort__label" htmlFor="gantt-sort-select">
                  Sort
                </label>
                <select
                  id="gantt-sort-select"
                  className="gantt-sort__select"
                  value={sortMode}
                  onChange={handleSortChange}
                >
                  <option value={SORT_MODES.ORIGINAL}>Original order</option>
                  <option value={SORT_MODES.START}>Start date</option>
                  <option value={SORT_MODES.END}>Completion date</option>
                </select>
              </div>
            </div>
            <div className="gantt-scrollbar" ref={topScrollbarRef}>
              <div className="gantt-scrollbar__shim" />
            </div>
            <div className="gantt-shell">
              <TaskSidebar
                tasks={ganttTasks}
                selectedTaskId={selectedTaskId}
                selectedTaskIds={selectedTaskIds}
                onTaskClick={handleSidebarTaskClick}
                onToggleTaskSelection={handleToggleTaskSelection}
                onToggleSelectAll={handleToggleSelectAll}
                onInsertAtIndex={handleInsertTaskAtIndex}
                sidebarRootRef={sidebarRootRef}
                sidebarInnerRef={sidebarInnerRef}
                dragState={dragState}
                onDragStart={handleSidebarDragStart}
                onDragOver={handleSidebarDragOver}
                onDragLeave={handleSidebarDragLeave}
                onDrop={handleSidebarDrop}
                onDragEnd={handleSidebarDragEnd}
                onContainerDragOver={handleSidebarContainerDragOver}
                onContainerDrop={handleSidebarContainerDrop}
              />
              <div className="gantt-main" ref={mainScrollRef}>
                <div ref={ganttContainerRef} className="gantt-container" />
              </div>
            </div>
          </div>
        </main>
        <ShiftModal
          isOpen={isShiftModalOpen}
          onClose={handleCloseShiftModal}
          onSubmit={handleShiftSubmit}
          selectedCount={selectedCount}
          totalCount={totalTaskCount}
        />
      </div>
    );
  } catch (renderError) {
    console.error(renderError);
    content = (
      <div className="layout layout--error">
        <div className="fatal-error">
          <h1>Something went wrong</h1>
          <p>{fatalErrorMessage || renderError?.message || "Unknown error"}</p>
        </div>
      </div>
    );
  }

  return content;
}

function stripTrailingSlash(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

