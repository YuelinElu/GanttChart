import { useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";

export default function TaskSidebar({
  tasks,
  selectedTaskId,
  selectedTaskIds,
  onTaskClick,
  onToggleTaskSelection,
  onToggleSelectAll,
  sidebarRootRef,
  sidebarInnerRef,
  dragState,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onContainerDragOver,
  onContainerDrop,
}) {
  const headerCheckboxRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const allSelected = tasks.length > 0 && selectedSet.size === tasks.length;
  const someSelected = selectedSet.size > 0 && !allSelected;
  const sidebarClassName = `gantt-sidebar${selectedSet.size ? " gantt-sidebar--selection" : ""}`;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleItemActivate = (taskId, { shiftKey, metaKey, ctrlKey } = {}) => {
    onTaskClick(taskId, {
      shiftKey: Boolean(shiftKey),
      metaKey: Boolean(metaKey),
      ctrlKey: Boolean(ctrlKey),
      scroll: true,
    });
  };

  return (
    <aside className={sidebarClassName} ref={sidebarRootRef}>
      <div className="gantt-sidebar__header">
        <label className="gantt-sidebar__select-all">
          <input
            ref={headerCheckboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={(event) => onToggleSelectAll(event.target.checked)}
            aria-label={allSelected ? "Deselect all tasks" : "Select all tasks"}
          />
          <span>Task Name</span>
        </label>
      </div>
      <div
        className="gantt-sidebar__inner"
        ref={sidebarInnerRef}
        onDragOver={onContainerDragOver}
        onDrop={onContainerDrop}
      >
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`gantt-sidebar__item${
              selectedTaskId === task.id ? " gantt-sidebar__item--selected" : ""
            }${
              selectedSet.has(task.id) ? " gantt-sidebar__item--multi-selected" : ""
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
            draggable={tasks.length > 1}
            onDragStart={(event) => onDragStart(event, task.id)}
            onDragOver={(event) => onDragOver(event, task.id)}
            onDragLeave={onDragLeave}
            onDrop={(event) => onDrop(event, task.id)}
            onDragEnd={onDragEnd}
            onClick={(event) => handleItemActivate(task.id, event)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleItemActivate(task.id, event);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <input
              type="checkbox"
              className="gantt-sidebar__checkbox"
              checked={selectedSet.has(task.id)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                onToggleTaskSelection(task.id, event.target.checked)
              }
              aria-label={selectedSet.has(task.id) ? "Deselect task" : "Select task"}
            />
            <span className="gantt-sidebar__text">{task.rawName}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

TaskSidebar.propTypes = {
  tasks: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      rawName: PropTypes.string.isRequired,
    }),
  ).isRequired,
  selectedTaskId: PropTypes.string,
  selectedTaskIds: PropTypes.arrayOf(PropTypes.string),
  onTaskClick: PropTypes.func.isRequired,
  onToggleTaskSelection: PropTypes.func.isRequired,
  onToggleSelectAll: PropTypes.func.isRequired,
  sidebarRootRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) }),
  ]).isRequired,
  sidebarInnerRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) }),
  ]).isRequired,
  dragState: PropTypes.shape({
    draggingId: PropTypes.string,
    overId: PropTypes.string,
    overPosition: PropTypes.oneOf(["before", "after"]),
  }).isRequired,
  onDragStart: PropTypes.func.isRequired,
  onDragOver: PropTypes.func.isRequired,
  onDragLeave: PropTypes.func.isRequired,
  onDrop: PropTypes.func.isRequired,
  onDragEnd: PropTypes.func.isRequired,
  onContainerDragOver: PropTypes.func.isRequired,
  onContainerDrop: PropTypes.func.isRequired,
};

TaskSidebar.defaultProps = {
  selectedTaskId: null,
  selectedTaskIds: [],
};
