import PropTypes from "prop-types";

export default function SummaryBar({ summary, datasetLabel }) {
  const cards = [
    {
      key: "count",
      label: "Total tasks",
      value: summary.count.toLocaleString(),
      hint: datasetLabel,
    },
    {
      key: "start",
      label: "Earliest start",
      value: summary.earliestLabel,
    },
    {
      key: "end",
      label: "Latest finish",
      value: summary.latestLabel,
    },
    {
      key: "span",
      label: "Timeline span",
      value: summary.spanLabel,
    },
  ];

  return (
    <section className="summary-bar" aria-label="Schedule summary">
      {cards.map((card) => (
        <article key={card.key} className="summary-card">
          <span className="summary-card__label">{card.label}</span>
          <span className="summary-card__value">{card.value}</span>
          {card.hint ? <span className="summary-card__hint">{card.hint}</span> : null}
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
  }).isRequired,
  datasetLabel: PropTypes.string,
};

SummaryBar.defaultProps = {
  datasetLabel: "",
};
