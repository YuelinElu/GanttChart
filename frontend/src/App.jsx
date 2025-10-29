import { useEffect, useMemo, useRef, useState } from "react";
import Gantt from "frappe-gantt";
import "frappe-gantt/dist/frappe-gantt.css";

const VIEW_MODES = ["Day", "Week", "Month"];
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

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("Week");

  const ganttContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const topScrollbarRef = useRef(null);
  const mainScrollRef = useRef(null);
  const sidebarRootRef = useRef(null);
  const sidebarInnerRef = useRef(null);
  const styleTagRef = useRef(null);

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
        setTasks(payload);
      } catch (fetchError) {
        if (fetchError.name !== "AbortError") {
          setError("Unable to load tasks. Check that the API is running.");
          setTasks([]);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchTasks();

    return () => controller.abort();
  }, []);

  const ganttTasks = useMemo(() => convertTasks(tasks), [tasks]);
  const legendItems = useMemo(() => buildLegend(tasks), [tasks]);

  useEffect(() => {
    if (!ganttContainerRef.current || ganttTasks.length === 0) {
      return;
    }

    const options = {
      view_mode: viewMode,
      date_format: "YYYY-MM-DD HH:mm",
      language: "en",
      custom_popup_html: tooltipTemplate,
      bar_height: 28,
      padding: 22,
    };

    if (chartInstanceRef.current) {
      chartInstanceRef.current.refresh(ganttTasks);
      chartInstanceRef.current.change_view_mode(viewMode);
    } else {
      chartInstanceRef.current = new Gantt(ganttContainerRef.current, ganttTasks, options);
    }

    const frame = requestAnimationFrame(() =>
      applyColours(
        ganttTasks,
        styleTagRef,
        ganttContainerRef.current,
        topScrollbarRef.current,
        mainScrollRef.current,
        sidebarRootRef.current,
        sidebarInnerRef.current,
      ),
    );

    return () => cancelAnimationFrame(frame);
  }, [ganttTasks, viewMode]);

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
        {!loading && !error && ganttTasks.length === 0 && (
          <p className="status">No tasks available in the dataset.</p>
        )}

        <div className="gantt-wrapper">
          <div className="gantt-scrollbar" ref={topScrollbarRef}>
            <div className="gantt-scrollbar__shim" />
          </div>
          <div className="gantt-shell">
            <aside className="gantt-sidebar" ref={sidebarRootRef}>
              <div className="gantt-sidebar__header">Task Name</div>
              <div className="gantt-sidebar__inner" ref={sidebarInnerRef}>
                {ganttTasks.map((task) => (
                  <div key={task.id} className="gantt-sidebar__item" title={task.rawName}>
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

function convertTasks(rawTasks) {
  return rawTasks.map((task) => ({
    ...task,
    rawName: task.name,
    name: truncateLabel(task.name),
    progress: 100,
    custom_class: `task-color-${task.id}`,
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








