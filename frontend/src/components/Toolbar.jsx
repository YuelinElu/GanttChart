import PropTypes from "prop-types";
import { DATASET_OPTIONS } from "../constants/appConstants";

export default function Toolbar({
  datasetMode,
  hasUploadedData,
  uploadedName,
  onDatasetChange,
  onAddTask,
  onShiftClick,
  onExport,
  onImportClick,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasTasks,
  selectedCount,
  totalCount,
  searchQuery,
  onSearchChange,
  onSearchKeyDown,
  onSearchClear,
  searchStatus,
  onSearchPrev,
  onSearchNext,
  hasSearchMatches,
  uploadInputRef,
  onFileInputChange,
  searchInputRef,
}) {
  const shiftLabel = selectedCount > 0 ? `Shift (${selectedCount})` : "Shift timeline";
  const shiftTitle =
    selectedCount > 0
      ? `Shift ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}`
      : totalCount > 0
      ? "Shift all tasks"
      : "No tasks available";
  const selectionSummary = selectedCount > 0 ? `${selectedCount} selected` : "All tasks";

  return (
    <section className="toolbar" aria-label="Timeline controls">
      <div className="toolbar__primary">
        <div className="toolbar__block">
          <span className="toolbar__block-label">Dataset</span>
          <label className="sr-only" htmlFor="dataset-select">
            Choose dataset
          </label>
          <select
            id="dataset-select"
            className="toolbar__select"
            value={datasetMode}
            onChange={onDatasetChange}
          >
            <option value={DATASET_OPTIONS.DEFAULT}>Sample project plan</option>
            <option value={DATASET_OPTIONS.EMPTY}>Start from scratch</option>
            <option value={DATASET_OPTIONS.UPLOADED}>
              {hasUploadedData && uploadedName
                ? `Uploaded CSV (${uploadedName})`
                : "Uploaded CSV"}
            </option>
          </select>
          <div className="toolbar__inline-actions">
            <button
              type="button"
              className="toolbar__chip"
              onClick={onImportClick}
              title="Import CSV"
            >
              Import
            </button>
            <button
              type="button"
              className="toolbar__chip"
              onClick={onExport}
              disabled={!hasTasks}
              title="Export current tasks to CSV"
            >
              Export
            </button>
          </div>
        </div>

        <div className="toolbar__block toolbar__block--stacked">
          <span className="toolbar__block-label">Planning</span>
          <div className="toolbar__pill-group" role="group" aria-label="Timeline editing">
            <button
              type="button"
              className="toolbar__pill"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className="toolbar__pill"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
            >
              Redo
            </button>
            <button
              type="button"
              className="toolbar__pill"
              onClick={onShiftClick}
              disabled={!totalCount}
              title={shiftTitle}
            >
              {shiftLabel}
            </button>
            <span className="toolbar__selection-badge" aria-live="polite">
              {selectionSummary}
            </span>
            <button type="button" className="toolbar__pill toolbar__pill--accent" onClick={onAddTask}>
              Add Task
            </button>
          </div>
        </div>

      </div>

      <div className="toolbar__secondary">
        <form className="toolbar__search" onSubmit={(event) => event.preventDefault()}>
          <label className="toolbar__search-label" htmlFor="task-search">
            Search tasks
          </label>
          <div className="toolbar__search-field">
            <input
              id="task-search"
              className="toolbar__search-input"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={onSearchChange}
              onKeyDown={onSearchKeyDown}
              placeholder="Find task by name"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                className="toolbar__search-clear"
                onClick={onSearchClear}
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </div>
          <div className="toolbar__search-controls">
            <span className="toolbar__search-count">{searchStatus}</span>
            <button
              type="button"
              className="toolbar__search-button"
              onClick={onSearchPrev}
              disabled={!hasSearchMatches}
              aria-label="Previous match"
            >
              Prev
            </button>
            <button
              type="button"
              className="toolbar__search-button"
              onClick={onSearchNext}
              disabled={!hasSearchMatches}
              aria-label="Next match"
            >
              Next
            </button>
          </div>
        </form>
      </div>

      <input
        ref={uploadInputRef}
        className="toolbar__file"
        type="file"
        accept=".csv,text/csv"
        onChange={onFileInputChange}
      />
    </section>
  );
}

Toolbar.propTypes = {
  datasetMode: PropTypes.string.isRequired,
  hasUploadedData: PropTypes.bool,
  uploadedName: PropTypes.string,
  onDatasetChange: PropTypes.func.isRequired,
  onAddTask: PropTypes.func.isRequired,
  onShiftClick: PropTypes.func.isRequired,
  onExport: PropTypes.func.isRequired,
  onImportClick: PropTypes.func.isRequired,
  onUndo: PropTypes.func.isRequired,
  onRedo: PropTypes.func.isRequired,
  canUndo: PropTypes.bool.isRequired,
  canRedo: PropTypes.bool.isRequired,
  hasTasks: PropTypes.bool.isRequired,
  selectedCount: PropTypes.number.isRequired,
  totalCount: PropTypes.number.isRequired,
  searchQuery: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onSearchKeyDown: PropTypes.func.isRequired,
  onSearchClear: PropTypes.func.isRequired,
  searchStatus: PropTypes.string.isRequired,
  onSearchPrev: PropTypes.func.isRequired,
  onSearchNext: PropTypes.func.isRequired,
  hasSearchMatches: PropTypes.bool.isRequired,
  uploadInputRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) }),
  ]).isRequired,
  onFileInputChange: PropTypes.func.isRequired,
  searchInputRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) }),
  ]).isRequired,
};

Toolbar.defaultProps = {
  hasUploadedData: false,
  uploadedName: "",
};
