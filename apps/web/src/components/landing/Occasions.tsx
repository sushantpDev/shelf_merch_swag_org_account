const OCCASIONS = [
  { className: "occasion-0", marker: "✦", label: "Employee Appreciation" },
  { className: "occasion-1", marker: "✦", label: "Sales Incentives" },
  { className: "occasion-2", marker: "✦", label: "Work Anniversaries" },
  { className: "occasion-3", marker: "✦", label: "Awards & Recognition" },
  { className: "occasion-4", marker: "✦", label: "WFH Kits" },
  { className: "occasion-5", marker: "✦", label: "Reward Redemption" },
  { className: "occasion-0", marker: "✦", label: "Birthday Treats" },
  { className: "occasion-1", marker: "✦", label: "Store Redemption" },
  { className: "occasion-2", marker: "✦", label: "Team Morale" },
  { className: "occasion-3", marker: "✦", label: "Kudos Program" },
  { className: "occasion-4", marker: "✦", label: "Bulk Distribution" },
  { className: "occasion-5", marker: "✦", label: "Festive Hampers" },
  { className: "occasion-0", marker: "✦", label: "New Hire Welcome" },
  { className: "occasion-1", marker: "✦", label: "Client Gifting" },
  { className: "occasion-2", marker: "✦", label: "Prospect Outreach" },
  { className: "occasion-3", marker: "✦", label: "Event Merch Bars" },
  { className: "occasion-4", marker: "✦", label: "Survey Incentives" },
  { className: "occasion-5", marker: "✦", label: "Culture Events" },
] as const;

export function Occasions() {
  return (
    <section className="occasion-section">
      <span className="kicker">EVERY OCCASION, COVERED</span>
      <h2>
        However you want to say it,
        <br />
        <em>put something good behind it.</em>
      </h2>
      <div className="occasion-cloud">
        {OCCASIONS.map((occasion, index) => (
          <span key={`${occasion.label}-${index}`} className={occasion.className}>
            <b>{occasion.marker}</b>
            {occasion.label}
          </span>
        ))}
      </div>
    </section>
  );
}
