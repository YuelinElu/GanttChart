import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { DATASET_OPTIONS } from "../constants/appConstants";
import {
  convertCsvRowsToTasks,
  ensureStableOrder,
  formatDateForFilename,
  normaliseTaskCollection,
  sortTasksByStart,
  sortTasksByEnd,
  sortTasksByOriginalPosition,
  stripCsvExtension,
  tasksToCsv,
} from "../utils/taskUtils";

const HISTORY_LIMIT = 100;

/**
 * Centralised task management hook that encapsulates dataset switching,
 * undo/redo stacks, CSV import/export, and shared task mutation helpers.
 */
export default function useTaskManager(apiBaseUrl) {
  const [datasetMode, setDatasetMode] = useState(DATASET_OPTIONS.DEFAULT);
  const [records, setRecords] = useState(() => ({
    [DATASET_OPTIONS.DEFAULT]: [],
    [DATASET_OPTIONS.EMPTY]: [],
    [DATASET_OPTIONS.UPLOADED]: [],
  }));
  const [uploadedName, setUploadedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");

  // Used purely to force React re-renders when undo/redo stacks mutate.
  const [, setHistoryVersion] = useState(0);
  const bumpHistoryVersion = useCallback(
    () => setHistoryVersion((value) => value + 1),
    [],
  );

  const historyRef = useRef({
    [DATASET_OPTIONS.DEFAULT]: createHistoryBucket(),
    [DATASET_OPTIONS.EMPTY]: createHistoryBucket(),
    [DATASET_OPTIONS.UPLOADED]: createHistoryBucket(),
  });

  const getHistoryForMode = useCallback((mode) => {
    if (!historyRef.current[mode]) {
      historyRef.current[mode] = createHistoryBucket();
    }
    return historyRef.current[mode];
  }, []);

  const replaceDatasetTasks = useCallback(
    (mode, tasks, { resetStacks = false } = {}) => {
      const prepared = ensureStableOrder(normaliseTaskCollection(tasks));
      let didChange = false;
      setRecords((previous) => {
        const current = previous[mode] ?? [];
        if (areTaskArraysEqual(current, prepared)) {
          return previous;
        }
        didChange = true;
        return {
          ...previous,
          [mode]: prepared,
        };
      });

      const bucket = getHistoryForMode(mode);
      bucket.present = cloneTasks(prepared);
      if (resetStacks) {
        bucket.past = [];
        bucket.future = [];
      }

      if (didChange || resetStacks) {
        bumpHistoryVersion();
      }

      return prepared;
    },
    [bumpHistoryVersion, getHistoryForMode],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function fetchDefaultTasks() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${apiBaseUrl}/api/tasks`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Fetch failed (${response.status})`);
        }
        const payload = await response.json();
        replaceDatasetTasks(DATASET_OPTIONS.DEFAULT, payload, { resetStacks: true });
      } catch (fetchError) {
        if (fetchError?.name !== "AbortError") {
          setError("Unable to load tasks. Check that the API is running.");
          replaceDatasetTasks(DATASET_OPTIONS.DEFAULT, [], { resetStacks: true });
        }
      } finally {
        setLoading(false);
      }
    }

    fetchDefaultTasks();

    return () => controller.abort();
  }, [apiBaseUrl, replaceDatasetTasks]);

  useEffect(() => {
    replaceDatasetTasks(DATASET_OPTIONS.EMPTY, [], { resetStacks: true });
    replaceDatasetTasks(DATASET_OPTIONS.UPLOADED, [], { resetStacks: true });
  }, [replaceDatasetTasks]);

  const tasks = records[datasetMode] ?? [];
  const hasUploadedData = (records[DATASET_OPTIONS.UPLOADED]?.length ?? 0) > 0;
  const showingUploadedPlaceholder =
    datasetMode === DATASET_OPTIONS.UPLOADED && !hasUploadedData && !importError;

  const selectDataset = useCallback(
    (mode) => {
      setDatasetMode((current) => {
        if (current === mode) {
          if (mode === DATASET_OPTIONS.UPLOADED && !hasUploadedData) {
            setImportError("Upload a CSV file to use the uploaded dataset.");
          }
          return current;
        }

        if (mode === DATASET_OPTIONS.UPLOADED && !hasUploadedData) {
          setImportError("Upload a CSV file to use the uploaded dataset.");
        } else {
          setImportError("");
        }

        return mode;
      });
    },
    [hasUploadedData],
  );

  const mutateTasks = useCallback(
    (mutator, { sortMode = "preserve", normalize = false } = {}) => {
      let didMutate = false;
      let nextSnapshot = null;

      setRecords((previous) => {
        const current = previous[datasetMode] ?? [];
        const previousSnapshot = cloneTasks(current);
        const candidate = typeof mutator === "function" ? mutator(previousSnapshot) : mutator;
        const asArray = Array.isArray(candidate) ? candidate : [];
        const base = normalize ? normaliseTaskCollection(asArray) : ensureStableOrder(asArray);
        let next;
        switch (sortMode) {
          case "by-start":
            next = sortTasksByStart(base);
            break;
          case "by-end":
            next = sortTasksByEnd(base);
            break;
          case "by-original":
            next = sortTasksByOriginalPosition(base);
            break;
          default:
            next = ensureStableOrder(base);
            break;
        }

        if (areTaskArraysEqual(current, next)) {
          return previous;
        }

        const history = getHistoryForMode(datasetMode);
        history.past.push(previousSnapshot);
        if (history.past.length > HISTORY_LIMIT) {
          history.past.shift();
        }
        history.future = [];
        history.present = cloneTasks(next);

        nextSnapshot = next;
        didMutate = true;

        return {
          ...previous,
          [datasetMode]: next,
        };
      });

      if (didMutate) {
        if (datasetMode === DATASET_OPTIONS.UPLOADED && (nextSnapshot?.length ?? 0) > 0) {
          setImportError("");
        }
        bumpHistoryVersion();
      }
    },
    [bumpHistoryVersion, datasetMode, getHistoryForMode],
  );

  const undo = useCallback(() => {
    const history = getHistoryForMode(datasetMode);
    if (!history.past.length) {
      return;
    }

    const previousSnapshot = history.past.pop();
    const currentSnapshot = history.present ?? cloneTasks(records[datasetMode] ?? []);
    history.future.push(cloneTasks(currentSnapshot));
    history.present = cloneTasks(previousSnapshot);

    setRecords((prev) => ({
      ...prev,
      [datasetMode]: cloneTasks(previousSnapshot),
    }));

    bumpHistoryVersion();
  }, [bumpHistoryVersion, datasetMode, getHistoryForMode, records]);

  const redo = useCallback(() => {
    const history = getHistoryForMode(datasetMode);
    if (!history.future.length) {
      return;
    }

    const nextSnapshot = history.future.pop();
    const currentSnapshot = history.present ?? cloneTasks(records[datasetMode] ?? []);
    history.past.push(cloneTasks(currentSnapshot));
    if (history.past.length > HISTORY_LIMIT) {
      history.past.shift();
    }
    history.present = cloneTasks(nextSnapshot);

    setRecords((prev) => ({
      ...prev,
      [datasetMode]: cloneTasks(nextSnapshot),
    }));

    bumpHistoryVersion();
  }, [bumpHistoryVersion, datasetMode, getHistoryForMode, records]);

  const canUndo = useMemo(
    () => (getHistoryForMode(datasetMode)?.past.length ?? 0) > 0,
    [datasetMode, getHistoryForMode],
  );
  const canRedo = useMemo(
    () => (getHistoryForMode(datasetMode)?.future.length ?? 0) > 0,
    [datasetMode, getHistoryForMode],
  );

  const importFromFile = useCallback(
    (file) =>
      new Promise((resolve) => {
        if (!file) {
          const message = "No file provided.";
          setImportError(message);
          resolve({ success: false, error: message });
          return;
        }

        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          transform: (value) => (typeof value === "string" ? value.trim() : value),
          complete: (results) => {
            const fatal = results.errors?.find((entry) => entry?.fatal);
            if (fatal) {
              const message = fatal.message || "Unable to read the CSV file.";
              setImportError(message);
              replaceDatasetTasks(DATASET_OPTIONS.UPLOADED, [], { resetStacks: true });
              setUploadedName("");
              setDatasetMode(DATASET_OPTIONS.UPLOADED);
              resolve({ success: false, error: message });
              return;
            }

            const parsedTasks = convertCsvRowsToTasks(results.data ?? []);
            if (!parsedTasks.length) {
              const message = "No valid tasks were detected in the uploaded CSV.";
              setImportError(message);
              replaceDatasetTasks(DATASET_OPTIONS.UPLOADED, [], { resetStacks: true });
              setUploadedName("");
              setDatasetMode(DATASET_OPTIONS.UPLOADED);
              resolve({ success: false, error: message, tasks: [] });
              return;
            }

            replaceDatasetTasks(DATASET_OPTIONS.UPLOADED, parsedTasks, { resetStacks: true });
            setUploadedName(file.name);
            setDatasetMode(DATASET_OPTIONS.UPLOADED);
            setImportError("");
            resolve({ success: true, tasks: parsedTasks });
          },
          error: (parseError) => {
            const message = parseError?.message || "Unable to read the CSV file.";
            setImportError(message);
            resolve({ success: false, error: message });
          },
        });
      }),
    [replaceDatasetTasks],
  );

  const exportTasks = useCallback(() => {
    if (!tasks.length) {
      return null;
    }

    const csvContent = tasksToCsv(tasks);
    const filename =
      datasetMode === DATASET_OPTIONS.UPLOADED && uploadedName
        ? `${stripCsvExtension(uploadedName)}-edited.csv`
        : `gantt-tasks-${formatDateForFilename(new Date())}.csv`;

    return { filename, csvContent };
  }, [datasetMode, tasks, uploadedName]);

  const clearImportError = useCallback(() => setImportError(""), []);

  return {
    tasks,
    datasetMode,
    selectDataset,
    loading,
    error,
    importError,
    setImportError,
    clearImportError,
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
    setUploadedName,
    replaceDatasetTasks,
  };
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
    "presetKey",
    "durationLabel",
    "durationHours",
    "durationDays",
    "startLabel",
    "endLabel",
    "position",
  ];
  return keys.every((key) => a[key] === b[key]);
}
