import { escapeSelector } from "./taskUtils";

const LIGHT_TEXT_COLOR = "#ffffff";
const DARK_TEXT_COLOR = "#1f2937";

export function applyTaskStyles(tasks, containerEl, styleTagRef) {
  if (!containerEl) {
    return;
  }

  let styleEl = styleTagRef.current;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.type = "text/css";
    styleEl.setAttribute("data-origin", "gantt-dynamic-styles");
    containerEl.prepend(styleEl);
    styleTagRef.current = styleEl;
  }

  const cssParts = tasks
    .filter((task) => task?.id)
    .map((task) => {
      const selector = `.${escapeSelector(task.custom_class || `task-color-${task.id}`)}`;
      const strokeColor = task.color || "#4f46e5";
      const fillColor = task.outline ? "transparent" : strokeColor;
      return `
${selector} .bar {
  fill: ${fillColor};
  stroke: ${strokeColor};
  stroke-width: ${task.outline ? 2 : 1.25}px;
}
${selector} .bar-progress {
  fill: ${strokeColor};
}
${selector} text {
  fill: ${getReadableTextColor(strokeColor, task.outline)};
}
`;
    })
    .join("\n");

  if (styleEl.textContent !== cssParts) {
    styleEl.textContent = cssParts;
  }

  tasks.forEach((task) => {
    if (!task?.id) {
      return;
    }

    const wrapperSelector = `.bar-wrapper[data-id="${escapeSelector(task.id)}"]`;
    const wrapper = containerEl.querySelector(wrapperSelector);
    if (!wrapper) {
      return;
    }

    if (task.custom_class) {
      wrapper.classList.forEach((cls) => {
        if (cls.startsWith("task-color-")) {
          wrapper.classList.remove(cls);
        }
      });
      wrapper.classList.add(task.custom_class);
    }

    const bar = wrapper.querySelector(".bar");
    const barProgress = wrapper.querySelector(".bar-progress");
    const label = wrapper.querySelector("text");

    const strokeColor = task.color || "#4f46e5";
    const fillColor = task.outline ? "transparent" : strokeColor;

    wrapper.classList.toggle("is-outline", Boolean(task.outline));

    if (bar) {
      bar.setAttribute("stroke", strokeColor);
      bar.style.stroke = strokeColor;
      bar.setAttribute("fill", fillColor);
      bar.style.fill = fillColor;
      bar.setAttribute("stroke-width", task.outline ? "2" : "1.25");
      bar.style.strokeWidth = task.outline ? "2px" : "1.25px";
      bar.setAttribute("fill-opacity", task.outline ? "0" : "1");
    }

    if (barProgress) {
      barProgress.setAttribute("fill", strokeColor);
      barProgress.style.fill = strokeColor;
      barProgress.style.opacity = task.outline ? "0" : "1";
    }

    if (!label || !bar) {
      return;
    }

    label.setAttribute("title", task.rawName || task.name || "");

    const barWidth = parseFloat(bar.getAttribute("width") || "0");
    const labelWidth = getSvgTextWidth(label);
    const barX = parseFloat(bar.getAttribute("x") || "0");
    const chartWidth = containerEl.scrollWidth || containerEl.getBoundingClientRect().width;

    const spaceLeft = barX;
    const spaceRight = Math.max(chartWidth - (barX + barWidth), 0);

    const requiresOutside = Boolean(task.outline || barWidth <= labelWidth + 12);
    let placement = "inside";

    if (requiresOutside) {
      const enoughRight = spaceRight >= labelWidth + 16;
      const enoughLeft = spaceLeft >= labelWidth + 16;
      if (enoughRight || spaceRight >= spaceLeft) {
        placement = "after";
      } else if (enoughLeft) {
        placement = "before";
      } else {
        placement = spaceRight >= spaceLeft ? "after" : "before";
      }
    }

    wrapper.classList.toggle("label-outside", placement !== "inside");
    wrapper.classList.toggle("label-outside-left", placement === "before");

    if (placement === "before") {
      label.setAttribute("text-anchor", "end");
      label.style.transform = "translateX(-8px)";
    } else if (placement === "after") {
      label.setAttribute("text-anchor", "start");
      label.style.transform = "translateX(8px)";
    } else {
      label.setAttribute("text-anchor", "middle");
      label.style.transform = "";
    }

    const textColor =
      placement === "inside"
        ? getReadableTextColor(strokeColor, task.outline)
        : strokeColor;
    label.setAttribute("fill", textColor);
    label.style.fill = textColor;
  });
}

export function highlightSearchMatches(containerEl, matchIds) {
  if (!containerEl) {
    return;
  }
  const ids = new Set(matchIds ?? []);
  containerEl.querySelectorAll(".bar-wrapper").forEach((wrapper) => {
    const id = wrapper.getAttribute("data-id");
    if (id && ids.has(id)) {
      wrapper.classList.add("is-search-match");
    } else {
      wrapper.classList.remove("is-search-match");
    }
  });
}

export function highlightSelectedTasks(containerEl, selectedIds) {
  if (!containerEl) {
    return;
  }
  const ids = new Set(selectedIds ?? []);
  containerEl.querySelectorAll(".bar-wrapper").forEach((wrapper) => {
    const id = wrapper.getAttribute("data-id");
    if (id && ids.has(id)) {
      wrapper.classList.add("is-bulk-selected");
    } else {
      wrapper.classList.remove("is-bulk-selected");
    }
  });
}

export function syncTopScrollbar(mainEl, topScrollbarEl) {
  if (!mainEl || !topScrollbarEl) {
    return;
  }
  const shim = topScrollbarEl.querySelector(".gantt-scrollbar__shim");
  if (!shim) {
    return;
  }
  shim.style.width = `${mainEl.scrollWidth}px`;
  topScrollbarEl.scrollLeft = mainEl.scrollLeft;
}

export function syncSidebarMetrics(containerEl, sidebarRootEl, sidebarInnerEl) {
  if (!containerEl || !sidebarRootEl || !sidebarInnerEl) {
    return;
  }

  const svg = containerEl.querySelector("svg");
  if (!svg) {
    return;
  }

  const headerRect = svg.querySelector(".grid .grid-header");
  const firstRowRect = svg.querySelector(".grid .grid-row");
  const lastRowRect = svg.querySelector(".grid .grid-row:last-of-type");

  const computedRoot = getComputedStyle(sidebarRootEl);
  const computedInner = getComputedStyle(sidebarInnerEl);

  const headerHeight =
    (measureSvgHeight(headerRect) ??
      parseFloat(computedRoot.getPropertyValue("--gantt-header-height"))) || 48;
  const rowHeight =
    (measureSvgHeight(firstRowRect) ??
      parseFloat(computedInner.getPropertyValue("--gantt-row-height"))) || 52;

  const headerBounds = headerRect?.getBoundingClientRect();
  const firstRowBounds = firstRowRect?.getBoundingClientRect();
  const lastRowBounds = lastRowRect?.getBoundingClientRect();
  const svgBounds = svg.getBoundingClientRect();

  const offsetTop =
    headerBounds && firstRowBounds
      ? Math.max(firstRowBounds.top - headerBounds.bottom, 0)
      : 0;

  const offsetBottom =
    svgBounds && lastRowBounds
      ? Math.max(svgBounds.bottom - lastRowBounds.bottom, 0)
      : 0;

  sidebarRootEl.style.setProperty("--gantt-header-height", `${headerHeight}px`);
  sidebarInnerEl.style.setProperty("--gantt-row-height", `${rowHeight}px`);
  sidebarInnerEl.style.setProperty("--gantt-offset-top", `${offsetTop}px`);
  sidebarInnerEl.style.setProperty("--gantt-offset-bottom", `${offsetBottom}px`);
}

export function adjustSidebarWidth(sidebarRootEl, sidebarInnerEl) {
  if (!sidebarRootEl || !sidebarInnerEl) {
    return;
  }
  const texts = sidebarInnerEl.querySelectorAll(".gantt-sidebar__text");
  let maxWidth = 0;
  texts.forEach((node) => {
    maxWidth = Math.max(maxWidth, node.scrollWidth);
  });

  const header = sidebarRootEl.querySelector(".gantt-sidebar__header");
  if (header) {
    maxWidth = Math.max(maxWidth, header.scrollWidth);
  }

  const paddedWidth = Math.min(Math.max(maxWidth + 48, 220), 480);
  sidebarRootEl.style.setProperty("--gantt-sidebar-width", `${paddedWidth}px`);
}

function getSvgTextWidth(element) {
  try {
    return element.getBBox().width;
  } catch {
    const text = element.textContent || "";
    return text.length * 7;
  }
}

function getReadableTextColor(hexColor, outline) {
  if (outline) {
    return DARK_TEXT_COLOR;
  }
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return DARK_TEXT_COLOR;
  }
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.55 ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR;
}

function hexToRgb(value) {
  if (typeof value !== "string") {
    return null;
  }
  const hex = value.replace("#", "").trim();
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }
    return { r, g, b };
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }
    return { r, g, b };
  }
  return null;
}

function measureSvgHeight(element) {
  if (!element) {
    return null;
  }
  try {
    const box = element.getBBox();
    if (box?.height) {
      return box.height;
    }
  } catch {
    /* ignore */
  }
  const rect = element.getBoundingClientRect();
  return rect?.height || null;
}
