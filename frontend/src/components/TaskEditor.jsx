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
  customColorKey,
  customColorValue,
  customColorPickerValue,
  customColorError,
  isDateInvalid,
  dateErrorMessage,
  disableSubmit,
  editorError,
  canApplyColorToSelection,
  applyColorDisabled,
  onApplyColorToSelection,
}) {
  const showGlobalError =
    Boolean(
      editorError &&
        editorError !== dateErrorMessage &&
        editorError !== customColorError,
    );
  const hasTask = Boolean(selectedTask);
  const deleteDisabled = !isCreating && !hasTask;
  const deleteLabel = isCreating ? "Discard task" : "Delete task";
  const handleDeleteClick = isCreating ? onDiscardNew : onDelete;
  const isCustomMode = colorSelectValue === customColorKey;
  const showCustomError = Boolean(customColorError);
  const activeHex = (() => {
    const candidate =
      (isCustomMode && (customColorPickerValue || customColorValue)) ||
      colorPreview?.color ||
      "#f5642d";
    return typeof candidate === "string" ? candidate.toUpperCase() : "";
  })();
  const activeNameBase = isCustomMode
    ? "Custom colour"
    : colorPreview?.label || "Colour";
  const activeName =
    !isCustomMode && colorPreview?.outline
      ? `${activeNameBase} (outline)`
      : activeNameBase;
  const activeMeta = [];
  if (activeHex) {
    activeMeta.push(activeHex);
  }
  if (!isCustomMode && colorPreview?.outline) {
    activeMeta.push("Outline");
  }

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
              <div className="editor__field editor__field--full editor__field--color">
                <span className="editor__field-title">Colour</span>
                <div className="editor__color">
                  <div className="editor__color-summary">
                    <span
                      className={`editor__color-preview${
                        colorPreview?.outline ? " editor__color-preview--outline" : ""
                      }`}
                      style={{
                        backgroundColor: colorPreview?.outline ? "transparent" : colorPreview?.color,
                        borderColor: colorPreview?.color || activeHex,
                      }}
                      aria-hidden="true"
                    />
                    <div className="editor__color-details">
                      <span className="editor__color-current-label">Active colour</span>
                      <span className="editor__color-current-value">{activeName}</span>
                      {activeMeta.length > 0 && (
                        <div className="editor__color-meta">
                          {activeMeta.map((item) => (
                            <span key={item} className="editor__color-badge">
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="editor__color-controls">
                    <div className="editor__color-select">
                      <label className="editor__label" htmlFor="task-color-select">
                        Palette
                      </label>
                      <select
                        id="task-color-select"
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
                    </div>
                    {isCustomMode && (
                      <div className="editor__custom">
                        <div className="editor__custom-color">
                          <label className="sr-only" htmlFor="task-custom-color-picker">
                            Pick custom colour
                          </label>
                          <input
                            id="task-custom-color-picker"
                            type="color"
                            name="customColor"
                            className="editor__custom-color-picker"
                            value={customColorPickerValue || "#000000"}
                            onChange={onFieldChange}
                            aria-label="Pick custom colour"
                          />
                          <label className="sr-only" htmlFor="task-custom-color-input">
                            Custom colour hex value
                          </label>
                          <input
                            id="task-custom-color-input"
                            type="text"
                            name="customColor"
                            className={`editor__input editor__input--custom${
                              showCustomError ? " editor__input--error" : ""
                            }`}
                            value={customColorValue ?? ""}
                            onChange={onFieldChange}
                            placeholder="#1A3F5C"
                            aria-label="Custom colour hex value"
                            autoComplete="off"
                            spellCheck="false"
                            aria-invalid={showCustomError}
                          />
                        </div>
                        <p className="editor__custom-hint">Hex format (#RRGGBB)</p>
                        {showCustomError && (
                          <span className="editor__hint editor__hint--error">{customColorError}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {canApplyColorToSelection && (
                <div className="editor__field editor__field--full">
                  <button
                    type="button"
                    className="editor__button editor__button--ghost"
                    onClick={onApplyColorToSelection}
                    disabled={applyColorDisabled}
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
    customColor: PropTypes.string,
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
  customColorKey: PropTypes.string.isRequired,
  customColorValue: PropTypes.string,
  customColorPickerValue: PropTypes.string,
  customColorError: PropTypes.string,
  isDateInvalid: PropTypes.bool,
  dateErrorMessage: PropTypes.string,
  disableSubmit: PropTypes.bool,
  editorError: PropTypes.string,
  canApplyColorToSelection: PropTypes.bool,
  applyColorDisabled: PropTypes.bool,
  onApplyColorToSelection: PropTypes.func,
};

TaskEditor.defaultProps = {
  selectedTask: null,
  isCreating: false,
  draft: null,
  colorPreview: null,
  customColorValue: "",
  customColorPickerValue: "#f5642d",
  customColorError: "",
  isDateInvalid: false,
  dateErrorMessage: "",
  disableSubmit: false,
  editorError: "",
  canApplyColorToSelection: false,
  applyColorDisabled: false,
  onApplyColorToSelection: undefined,
};
