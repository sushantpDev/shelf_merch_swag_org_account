import budgetEmptyArt from "../../../../../assets/budget-empty-rounded.png";

type Props = {
  onSetup: () => void;
  disabled?: boolean;
};

/** First-time budget empty state. */
export function EmptyBudgetState({ onSetup, disabled }: Props) {
  return (
    <div className="card budget-empty">
      <img src={budgetEmptyArt} alt="" className="budget-empty__art" />
      <h3 className="budget-empty__title">Organization budget</h3>
      <p className="budget-empty__desc">
        Set up a budget for your team to start sending swag, kits and gifts.
      </p>
      <button
        type="button"
        className="budget-empty__cta"
        onClick={onSetup}
        disabled={disabled}
      >
        Set up your first budget
      </button>
    </div>
  );
}
