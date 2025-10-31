import PropTypes from "prop-types";

export default function TaskEditor({
  selectedTask,
  isCollapsed,
  onToggleCollapse,
  onDelete,
  onSubmit,
  onReset,
  draft,
  onFieldChange,
  onColorModeChange,
  onCustomColorChange,
  onCustomLabelChange,
  colorSelectValue,
  colorPresets,
  colorPreview,
  customColorValue,
  editorError,
  customModeValue,
}) {
  return (
    <section className="editor" aria-label="Task editor">
      <div className="editor__head">
        <div className="editor__head-left">
          <h2>Task details</h2>
          <button
            type="button"
            className="editor__toggle"
            onClick={onToggleCollapse}
            disabled={!selectedTask}
          >
            {isCollapsed ? "Show details" : "Hide details"}
          </button>
        </div>
        <button type="button" className="editor__delete" onClick={onDelete} disabled={!selectedTask}>
          Delete task
        </button>
      </div>

      {selectedTask ? (
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
                  value={draft?.start ?? ""}
                  onChange={onFieldChange}
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
                  value={draft?.end ?? ""}
                  onChange={onFieldChange}
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
                      <option value={customModeValue}>Custom</option>
                    </select>
                    <span className="editor__color-label">
                      {colorPreview?.label || "Custom colour"}
                    </span>
                  </div>
                  {draft?.colorMode === customModeValue && (
                    <div className="editor__color-custom">
                      <label className="editor__color-picker">
                        <input
                          type="color"
                          value={customColorValue}
                          onChange={onCustomColorChange}
                          aria-label="Select colour"
                        />
                        <span>{customColorValue.toUpperCase()}</span>
                      </label>
                      <label className="editor__checkbox">
                        <input
                          type="checkbox"
                          name="customOutline"
                          checked={Boolean(draft?.customOutline)}
                          onChange={onFieldChange}
                        />
                        <span>Outline only</span>
                      </label>
                      <label className="editor__field editor__field--nested" htmlFor="task-color-label">
                        <span>Colour label</span>
                        <input
                          id="task-color-label"
                          name="customLabel"
                          type="text"
                          value={draft?.customLabel ?? ""}
                          onChange={onCustomLabelChange}
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
  isCollapsed: PropTypes.bool.isRequired,
  onToggleCollapse: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  draft: PropTypes.shape({
    name: PropTypes.string,
    start: PropTypes.string,
    end: PropTypes.string,
    colorMode: PropTypes.string,
    customColor: PropTypes.string,
    customOutline: PropTypes.bool,
    customLabel: PropTypes.string,
  }),
  onFieldChange: PropTypes.func.isRequired,
  onColorModeChange: PropTypes.func.isRequired,
  onCustomColorChange: PropTypes.func.isRequired,
  onCustomLabelChange: PropTypes.func.isRequired,
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
  customColorValue: PropTypes.string.isRequired,
  editorError: PropTypes.string,
  customModeValue: PropTypes.string.isRequired,
};

TaskEditor.defaultProps = {
  selectedTask: null,
  draft: null,
  colorPreview: null,
  editorError: "",
};
