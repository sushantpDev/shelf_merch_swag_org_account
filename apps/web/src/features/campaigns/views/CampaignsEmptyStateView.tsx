import campaignsEmptyArt from "../../../../assets/campaigns-empty.png";
import "../campaigns-page.css";

/** Empty campaigns: intentional new-user actions, or embedded empty inside type tab. */
export function CampaignsEmptyStateView({
  canSend,
  canCreateKit = false,
  onSendGift,
  onSendPoints,
  onSendKit,
  onCreateKit,
  embedded = false,
}: {
  canSend: boolean;
  canCreateKit?: boolean;
  onSendGift: () => void;
  onSendPoints?: () => void;
  onSendKit?: () => void;
  onCreateKit?: () => void;
  /** When true, render only the empty body (used inside the list panel). */
  embedded?: boolean;
}) {
  const showActionCards = canSend && onSendPoints && onSendKit && onCreateKit && !embedded;

  const emptyBody = (
    <div className={`camp-empty${embedded ? " camp-empty--panel" : ""}`}>
      {!embedded ? (
        <img src={campaignsEmptyArt} alt="" className="camp-empty__art" aria-hidden="true" />
      ) : null}
      <h3 className="camp-empty__title">
        {embedded ? "No campaigns yet" : "Create your first campaign"}
      </h3>
      <p className="camp-empty__desc">
        {embedded
          ? "Launch a points campaign from a shop, or send a kit to start tracking activity here."
          : "Choose how you'd like to send rewards to your team."}
      </p>
      {showActionCards ? (
        <div className="camp-empty__options">
          <article className="camp-empty__option">
            <span className="camp-empty__option-category">Flexible rewards</span>
            <h4>Send Points</h4>
            <p>Give your team points they can use to shop from your store.</p>
            <button type="button" className="camp-empty__cta" onClick={onSendPoints}>
              Send Points
            </button>
          </article>
          <article className="camp-empty__option">
            <span className="camp-empty__option-category">Ready-made kits</span>
            <h4>Send a Kit</h4>
            <p>Send an existing kit to your recipients.</p>
            <button type="button" className="camp-empty__cta" onClick={onSendKit}>
              Send Kit
            </button>
          </article>
          <article className="camp-empty__option">
            <span className="camp-empty__option-category">Personalized gifting</span>
            <h4>Create a Kit</h4>
            <p>Create a curated kit from your available products.</p>
            <button
              type="button"
              className="camp-empty__cta"
              onClick={onCreateKit}
              disabled={!canCreateKit}
            >
              Create Kit
            </button>
          </article>
        </div>
      ) : canSend ? (
        <button type="button" className="camp-empty__cta" onClick={onSendGift}>
          Create your first campaign
        </button>
      ) : (
        <p className="camp-empty__note">
          Your company admin sets up shops and kits; you can launch campaigns from here once
          assigned as a department manager.
        </p>
      )}
    </div>
  );

  if (embedded) {
    return emptyBody;
  }

  return (
    <div className="campaigns-page">
      <header className="camp-hero">
        <div className="camp-hero__copy">
          <h1>Campaigns</h1>
          <p className="camp-hero__sub">Launch points campaigns and track kit sends.</p>
        </div>
      </header>

      <section className="camp-panel">{emptyBody}</section>
    </div>
  );
}
