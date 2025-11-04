import PropTypes from "prop-types";

export default function TaskEditor({
  selectedTask,
  isCreating,
  isCollapsed,
  onToggleCollapse,
  onDelete,
  onDiscardNew,
  onSubmit,
  onReset,
  draft,
  onFieldChange,
  onColorModeChange,
  colorSelectValue,
  colorPresets,
  colorPreview,
  isDateInvalid,
  dateErrorMessage,
  disableSubmit,
  editorError,
  canApplyColorToSelection,
  onApplyColorToSelection,
}) {
  const showGlobalError = editorError && editorError !== dateErrorMessage;
  const hasTask = Boolean(selectedTask);
  const deleteDisabled = !isCreating && !hasTask;
  const deleteLabel = isCreating ? "Discard task" : "Delete task";
  const handleDeleteClick = isCreating ? onDiscardNew : onDelete;

  return (
    <section className="editor" aria-label="Task editor">
      <div className="editor__head">
        <div className="editor__head-left">
          <h2>Task details</h2>
          <button
            type="button"
            className="editor__toggle"
            onClick={onToggleCollapse}
            disabled={!hasTask}
          >
            {isCollapsed ? "Show details" : "Hide details"}
          </button>
        </div>
        <button
          type="button"
          className="editor__delete"
          onClick={handleDeleteClick}
          disabled={deleteDisabled}
        >
          {deleteLabel}
        </button>
      </div>

      {hasTask ? (
        isCollapsed ? (
          <div className="editor__collapsed" role="status" aria-live="polite">
            <p className="editor__collapsed-name" title={selectedTask.name}>
              {selectedTask.name}
            </p>
            <p className="editor__collapsed-dates">
              {selectedTask.startLabel} {"->"} {selectedTask.endLabel}
            </p>
            <p className="editor__collapsed-duration">Duration: {selectedTask.durationLabel}</p>
          </div>
        ) : (
          <form className="editor__form" onSubmit={onSubmit} onReset={onReset}>
            <div className="editor__grid">
              <label className="editor__field" htmlFor="task-name">
                <span>Name</span>
                <input
                  id="task-name"
                  name="name"
                  type="text"
                  className="editor__input"
                  value={draft?.name ?? ""}
                  onChange={onFieldChange}
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
                  className={`editor__input${isDateInvalid ? " editor__input--error" : ""}`}
                  value={draft?.start ?? ""}
                  onChange={onFieldChange}
                  required
                  step="60"
                  aria-invalid={isDateInvalid}
                />
              </label>
              <label className="editor__field" htmlFor="task-end">
                <span>End</span>
                <input
                  id="task-end"
                  name="end"
                  type="datetime-local"
                  className={`editor__input${isDateInvalid ? " editor__input--error" : ""}`}
                  value={draft?.end ?? ""}
                  onChange={onFieldChange}
                  required
                  step="60"
                  aria-invalid={isDateInvalid}
                />
                {isDateInvalid && (
                  <span className="editor__hint editor__hint--error">{dateErrorMessage}</span>
                )}
              </label>
              <label className="editor__field editor__field--full">
                <span>Colour</span>
                <div className="editor__color">
                  <div className="editor__color-row">
                    <span
                      className={`editor__color-preview${
                        colorPreview?.outline ? " editor__color-preview--outline" : ""
                      }`}
                      style={{
                        backgroundColor: colorPreview?.outline ? "transparent" : colorPreview?.color,
                        borderColor: colorPreview?.color,
                      }}
                      aria-hidden="true"
                    />
                    <select
                      className="editor__select"
                      value={colorSelectValue}
                      onChange={onColorModeChange}
                    >
                      {colorPresets.map((preset) => (
                        <option key={preset.key} value={preset.key}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    <span className="editor__color-label">
                      {colorPreview?.label || "Colour"}
                    </span>
                  </div>
                </div>
              </label>
              {canApplyColorToSelection && (
                <div className="editor__field editor__field--full">
                  <button
                    type="button"
                    className="editor__button editor__button--ghost"
                    onClick={onApplyColorToSelection}
                  >
                    Apply colour to selected tasks
                  </button>
                </div>
              )}
            </div>
            {showGlobalError && <p className="editor__error">{editorError}</p>}
            <div className="editor__meta">
              <span>Starts: {selectedTask.startLabel}</span>
              <span>Ends: {selectedTask.endLabel}</span>
              <span>Duration: {selectedTask.durationLabel}</span>
            </div>
            <div className="editor__actions">
              <button
                type="submit"
                className="editor__button editor__button--primary"
                disabled={disableSubmit}
              >
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
  );
}

TaskEditor.propTypes = {
  selectedTask: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    startLabel: PropTypes.string.isRequired,
    endLabel: PropTypes.string.isRequired,
    durationLabel: PropTypes.string.isRequired,
  }),
  isCreating: PropTypes.bool,
  isCollapsed: PropTypes.bool.isRequired,
  onToggleCollapse: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onDiscardNew: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  draft: PropTypes.shape({
    name: PropTypes.string,
    start: PropTypes.string,
    end: PropTypes.string,
    colorMode: PropTypes.string,
  }),
  onFieldChange: PropTypes.func.isRequired,
  onColorModeChange: PropTypes.func.isRequired,
  colorSelectValue: PropTypes.string.isRequired,
  colorPresets: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      color: PropTypes.string.isRequired,
      outline: PropTypes.bool,
    }),
  ).isRequired,
  colorPreview: PropTypes.shape({
    color: PropTypes.string,
    outline: PropTypes.bool,
    label: PropTypes.string,
  }),
  isDateInvalid: PropTypes.bool,
  dateErrorMessage: PropTypes.string,
  disableSubmit: PropTypes.bool,
  editorError: PropTypes.string,
  canApplyColorToSelection: PropTypes.bool,
  onApplyColorToSelection: PropTypes.func,
};

TaskEditor.defaultProps = {
  selectedTask: null,
  isCreating: false,
  draft: null,
  colorPreview: null,
  isDateInvalid: false,
  dateErrorMessage: "",
  disableSubmit: false,
  editorError: "",
  canApplyColorToSelection: false,
  onApplyColorToSelection: undefined,
};
