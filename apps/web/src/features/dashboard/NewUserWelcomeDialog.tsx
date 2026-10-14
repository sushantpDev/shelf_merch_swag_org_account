import { useNavigate } from "react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { tenantPath } from "@/lib/workspaceSlug";

const STEPS: {
  title: string;
  body: string;
}[] = [
  {
    title: "Create your wallet",
    body: "Takes ~3 min",
  },
  {
    title: "Set up your store",
    body: "Takes ~2 min",
  },
  {
    title: "Choose and design swag",
    body: "Takes ~3 min",
  },
  {
    title: "Add your contacts",
    body: "Takes ~2 min",
  },
  {
    title: "Create your first campaign",
    body: "Takes ~2 min",
  },
];

export function NewUserWelcomeDialog({
  open,
  firstName,
  onClose,
}: {
  open: boolean;
  firstName?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const name = (firstName || "").trim();

  function startWalletSetup() {
    onClose();
    navigate(tenantPath("/wallets"), { state: { startCreateWallet: true } });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="sm-new-user-welcome"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {name ? `Welcome aboard, ${name}` : "Welcome aboard"}
        </DialogTitle>
        <div className="sm-new-user-welcome__layout">
          <aside className="sm-new-user-welcome__visual" aria-hidden="true">
            <img
              src="/images/dashboard-welcome-modal.png"
              alt=""
              className="sm-new-user-welcome__brand-art"
            />
          </aside>

          <div className="sm-new-user-welcome__panel">
            <div className="sm-new-user-welcome__intro">
              <h2>
                Welcome aboard,
                {name ? (
                  <>
                    <br />
                    {name} <span aria-hidden="true">👋</span>
                  </>
                ) : (
                  <span aria-hidden="true"> 👋</span>
                )}
              </h2>
              <p>
                <strong>Your workspace is ready!</strong> Let&apos;s activate the essentials so your
                team can start sending branded swag.
              </p>
            </div>

            <p className="sm-new-user-welcome__next">Here&apos;s what&apos;s next:</p>

            <ol className="sm-new-user-welcome__steps">
              {STEPS.map((step, index) => {
                const active = index === 0;
                return (
                  <li
                    key={step.title}
                    className={`sm-new-user-welcome__step${active ? " is-active" : ""}`}
                  >
                    <span className="sm-new-user-welcome__num" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="sm-new-user-welcome__card">
                      <span className="sm-new-user-welcome__text">
                        <strong>{step.title}</strong>
                        {step.body ? <small>{step.body}</small> : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="sm-new-user-welcome__footer">
              <button type="button" className="sm-new-user-welcome__cta" onClick={startWalletSetup}>
                Let&apos;s go!
              </button>
              <p className="sm-new-user-welcome__eta">Approx. 12 minutes</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
