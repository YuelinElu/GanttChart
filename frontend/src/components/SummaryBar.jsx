import PropTypes from "prop-types";

export default function SummaryBar({ summary, datasetLabel }) {
  const safeSummary = summary || {
    count: 0,
    earliestLabel: "N/A",
    latestLabel: "N/A",
    spanLabel: "N/A",
    progressPercent: null,
    progressLabel: "N/A",
    progressDateLabel: "",
  };

  const cards = [
    {
      key: "count",
      label: "Total tasks",
      value:
        typeof safeSummary.count === "number" && Number.isFinite(safeSummary.count)
          ? safeSummary.count.toLocaleString()
          : "0",
      hint: datasetLabel,
    },
    {
      key: "start",
      label: "Earliest start",
      value: safeSummary.earliestLabel,
    },
    {
      key: "end",
      label: "Latest finish",
      value: safeSummary.latestLabel,
    },
    {
      key: "span",
      label: "Timeline span",
      value: safeSummary.spanLabel,
    },
  ];

  if (typeof safeSummary.progressPercent === "number" && !Number.isNaN(safeSummary.progressPercent)) {
    cards.push({
      key: "progress",
      label: "Timeline progress",
      value: safeSummary.progressLabel,
      hint: safeSummary.progressDateLabel,
      progress: Math.min(Math.max(safeSummary.progressPercent, 0), 100),
    });
  }

  return (
    <section className="summary-bar" aria-label="Schedule summary">
      {cards.map((card) => (
        <article key={card.key} className="summary-card">
          <span className="summary-card__label">{card.label}</span>
          <span className="summary-card__value">{card.value}</span>
          {card.hint ? <span className="summary-card__hint">{card.hint}</span> : null}
          {typeof card.progress === "number" ? (
            <div className="summary-card__progress" aria-hidden="true">
              <div className="summary-card__progress-track">
                <div
                  className="summary-card__progress-bar"
                  style={{ width: `${card.progress}%` }}
                />
              </div>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

SummaryBar.propTypes = {
  summary: PropTypes.shape({
    count: PropTypes.number.isRequired,
    earliestLabel: PropTypes.string.isRequired,
    latestLabel: PropTypes.string.isRequired,
    spanLabel: PropTypes.string.isRequired,
    progressPercent: PropTypes.number,
    progressLabel: PropTypes.string,
    progressDateLabel: PropTypes.string,
  }).isRequired,
  datasetLabel: PropTypes.string,
};

SummaryBar.defaultProps = {
  datasetLabel: "",
};
