import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Gantt from "frappe-gantt";
import "frappe-gantt/dist/frappe-gantt.css";
import useTaskManager from "./hooks/useTaskManager";
import Toolbar from "./components/Toolbar";
import TaskEditor from "./components/TaskEditor";
import TaskSidebar from "./components/TaskSidebar";
import SummaryBar from "./components/SummaryBar";
import ShiftModal from "./components/ShiftModal";
import { DATASET_OPTIONS, VIEW_MODES } from "./constants/appConstants";
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
  parseDateTimeLocal,
  reorderTasksById,
  sanitizeHexColor,
  escapeSelector,
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

  const ganttContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const topScrollbarRef = useRef(null);
  const mainScrollRef = useRef(null);
  const sidebarRootRef = useRef(null);
  const sidebarInnerRef = useRef(null);
  const styleTagRef = useRef(null);
  const uploadInputRef = useRef(null);
  const searchInputRef = useRef(null);
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
    editorDraft?.colorMode ?? (selectedTask?.presetKey ?? DEFAULT_COLOR.key);
  const customColorValue = useMemo(
    () => sanitizeHexColor(editorDraft?.customColor) ?? DEFAULT_COLOR.color,
    [editorDraft?.customColor],
  );
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
        earliestLabel: "—",
        latestLabel: "—",
        spanLabel: "—",
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
        earliestLabel: "—",
        latestLabel: "—",
        spanLabel: "—",
      };
    }

    const metrics = computeDurationMetrics(earliest, latest);
    return {
      count: tasks.length,
      earliestLabel: metrics?.startLabel ?? formatHumanDate(earliest),
      latestLabel: metrics?.endLabel ?? formatHumanDate(latest),
      spanLabel: metrics?.durationLabel ?? "—",
    };
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

  const insertTaskAtPosition = useCallback(
    (insertIndex, baselineDate) => {
      const safeBaseline =
        baselineDate instanceof Date
          ? new Date(baselineDate.getTime())
          : new Date();
      let createdTask = null;

      mutateTasks(
        (previous) => {
          const startDate = new Date(safeBaseline.getTime());
          const endDate = new Date(startDate.getTime() + DEFAULT_TASK_DURATION_MS);
          createdTask = {
            id: generateTaskId(),
            name: buildNewTaskName(previous.length + 1),
            start: formatIsoLocal(startDate),
            end: formatIsoLocal(endDate),
            color: DEFAULT_COLOR.color,
            colorLabel: DEFAULT_COLOR.label,
            outline: DEFAULT_COLOR.outline,
            presetKey: DEFAULT_COLOR.key,
          };
          const next = [...previous];
          const boundedIndex = Math.max(0, Math.min(insertIndex, next.length));
          next.splice(boundedIndex, 0, createdTask);
          return next;
        },
        { normalize: true, sortMode: "preserve" },
      );

      if (createdTask) {
        selectionAnchorRef.current = createdTask.id;
        setSelectedTaskId(createdTask.id);
        setSelectedTaskIds([]);
        setIsEditorCollapsed(false);
        setEditorError("");
        pendingScrollRef.current = createdTask.id;
      }
    },
    [mutateTasks],
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

  const handleTaskClick = useCallback(
    (task) => {
      if (task?.id) {
        setSelectedTaskIds([]);
        selectionAnchorRef.current = task.id;
        focusTask(task.id, { scroll: false });
      }
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
      const startChanged = startIso !== task.start;

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
        { normalize: true, sortMode: startChanged ? "by-start" : "preserve" },
      );
    },
    [mutateTasks],
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
    if (!selectedTask) {
      setEditorDraft(null);
      setEditorError("");
      return;
    }
    setEditorDraft(createEditorDraftFromTask(selectedTask));
    setEditorError("");
  }, [selectedTask]);

  const handleDatasetChange = useCallback(
    (event) => {
      selectDataset(event.target.value);
    },
    [selectDataset],
  );

  const handleSidebarTaskClick = useCallback(
    (
      taskId,
      { shiftKey = false, metaKey = false, ctrlKey = false } = {},
    ) => {
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
    [focusTask, selectedTaskId, selectedTaskIds, tasks],
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
    insertTaskAtPosition(insertIndex, baseline);
  }, [
    computeBaselineForIndex,
    insertTaskAtPosition,
    selectedTaskId,
    selectedTaskIds,
    tasks,
  ]);

  const handleInsertTaskAtIndex = useCallback(
    (index) => {
      const baseline = computeBaselineForIndex(index);
      insertTaskAtPosition(index, baseline);
    },
    [computeBaselineForIndex, insertTaskAtPosition],
  );

  const handleDeleteTask = useCallback(() => {
    if (!selectedTask) {
      return;
    }
    mutateTasks((previous) => previous.filter((task) => task.id !== selectedTask.id), {
      normalize: true,
    });
    setSelectedTaskId(null);
  }, [mutateTasks, selectedTask]);

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

  const handleColorModeChange = useCallback((event) => {
    const value = event.target.value;
    setEditorDraft((prev) => {
      if (!prev) {
        return prev;
      }
      if (value === CUSTOM_COLOR_KEY) {
        return {
          ...prev,
          colorMode: CUSTOM_COLOR_KEY,
        };
      }
      const preset = COLOR_PRESETS.find((item) => item.key === value);
      if (!preset) {
        return prev;
      }
      return {
        ...prev,
        colorMode: preset.key,
        customColor: preset.color,
        customOutline: preset.outline,
        customLabel: preset.label,
      };
    });
    setEditorError("");
  }, []);

  const handleCustomColorChange = useCallback((event) => {
    const rawValue = event.target.value;
    setEditorDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const sanitized = sanitizeHexColor(rawValue) ?? sanitizeHexColor(prev.customColor);
      return {
        ...prev,
        colorMode: CUSTOM_COLOR_KEY,
        customColor: sanitized ?? DEFAULT_COLOR.color,
      };
    });
    setEditorError("");
  }, []);

  const handleCustomLabelChange = useCallback((event) => {
    const value = event.target.value;
    setEditorDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        colorMode: CUSTOM_COLOR_KEY,
        customLabel: value,
      };
    });
  }, []);

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

      const colorSpec = buildColorSpecFromDraft(editorDraft);
      if (colorSpec?.error) {
        setEditorError(colorSpec.error);
        return;
      }

      const startIso = formatIsoLocal(startDate);
      const endIso = formatIsoLocal(endDate);
      const startChanged = startIso !== selectedTask.start;

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
        { normalize: true, sortMode: startChanged ? "by-start" : "preserve" },
      );

      setEditorError("");
    },
    [editorDatesInvalid, editorDraft, mutateTasks, selectedTask],
  );

  const handleExport = useCallback(() => {
    const snapshot = exportTasks();
    if (!snapshot) {
      return;
    }
    const blob = new Blob([snapshot.csvContent], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = snapshot.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [exportTasks]);

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
        { normalize: true, sortMode: "by-start" },
      );

      setIsShiftModalOpen(false);
    },
    [mutateTasks, selectedTaskIds],
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

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__headline">
          <h1>Project Timeline</h1>
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
          selectedTask={selectedTask}
          isCollapsed={isEditorCollapsed}
          onToggleCollapse={() => setIsEditorCollapsed((prev) => !prev)}
          onDelete={handleDeleteTask}
          onSubmit={handleEditorSubmit}
          onReset={handleEditorReset}
          draft={editorDraft}
          onFieldChange={handleEditorFieldChange}
          onColorModeChange={handleColorModeChange}
          onCustomColorChange={handleCustomColorChange}
          onCustomLabelChange={handleCustomLabelChange}
          colorSelectValue={String(colorSelectValue)}
          colorPresets={COLOR_PRESETS}
          colorPreview={editorColorPreview}
          customColorValue={customColorValue}
          isDateInvalid={editorDatesInvalid}
          dateErrorMessage={DATE_ERROR_MESSAGE}
          disableSubmit={editorDatesInvalid}
          editorError={editorError}
          customModeValue={CUSTOM_COLOR_KEY}
        />
        <div className="gantt-wrapper">
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

