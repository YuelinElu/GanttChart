import { useEffect, useState } from "react";
import PropTypes from "prop-types";

const UNIT_OPTIONS = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
];

export default function ShiftModal({ isOpen, onClose, onSubmit, selectedCount, totalCount }) {
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("days");
  const [direction, setDirection] = useState("forward");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setAmount(1);
      setUnit("days");
      setDirection("forward");
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handler = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Enter a value greater than 0.");
      return;
    }
    onSubmit({ amount: numeric, unit, direction });
  };

  const targetDescription =
    selectedCount > 0
      ? `${selectedCount} selected task${selectedCount === 1 ? "" : "s"}`
      : `${totalCount} task${totalCount === 1 ? "" : "s"}`;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="shift-modal-title">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__dialog">
        <h2 id="shift-modal-title" className="modal__title">
          Shift task dates
        </h2>
        <p className="modal__description">Adjust the schedule for {targetDescription}.</p>
        <form className="modal__form" onSubmit={handleSubmit}>
          <label className="modal__field">
            <span>Shift amount</span>
            <div className="modal__field-group">
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                {UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <fieldset className="modal__fieldset">
            <legend>Direction</legend>
            <label className="modal__radio">
              <input
                type="radio"
                name="shift-direction"
                value="forward"
                checked={direction === "forward"}
                onChange={() => setDirection("forward")}
              />
              <span>Forward</span>
            </label>
            <label className="modal__radio">
              <input
                type="radio"
                name="shift-direction"
                value="backward"
                checked={direction === "backward"}
                onChange={() => setDirection("backward")}
              />
              <span>Backward</span>
            </label>
          </fieldset>

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__actions">
            <button type="button" className="modal__button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal__button modal__button--primary">
              Apply shift
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

ShiftModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  selectedCount: PropTypes.number.isRequired,
  totalCount: PropTypes.number.isRequired,
};
