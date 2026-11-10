import { Link } from "react-router";
import type { CSSProperties, ReactNode } from "react";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import authMerchImage from "@/assets/auth-merch-login.jpg";
import "../../../styles/auth-brand.css";
import "../../../styles/auth-login-reference.css";

type AuthLayoutProps = {
  className?: string;
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** `welcome` = merch backdrop + card with wordmark above (login / signup). `compact` = smaller card for reset flows. */
  variant?: "branded" | "welcome" | "compact";
  /** Tighter card so a longer form fits the viewport without scrolling. */
  dense?: boolean;
  /** Login/signup can separate account-switch links; password setup needs no OR divider. */
  showDivider?: boolean;
  footerLink?: { hint: string; label: string; to: "/login" | "/signup" | "/forgot-password" };
};

export function AuthLayout({
  className,
  children,
  title,
  subtitle,
  variant = "branded",
  dense = false,
  showDivider = true,
  footerLink,
}: AuthLayoutProps) {
  const isWelcome = variant === "welcome";
  const isCompact = variant === "compact";
  const isReferenceLayout = isWelcome;
  const authBackgroundStyle = {
    "--auth-bg": `url(${authMerchImage})`,
  } as CSSProperties;

  return (
    <div
      className={`auth-simple${isWelcome ? " auth-simple--welcome auth-welcome-redesign" : ""}${isReferenceLayout ? " auth-login-reference" : ""}${isCompact ? " auth-simple--compact" : ""}${dense ? " auth-simple--dense" : ""}${className ? ` ${className}` : ""}`}
      style={authBackgroundStyle}
    >
      {isWelcome ? (
        <Link to="/" className="auth-corner-logo" aria-label="Shelf Merch home">
          <ShelfMerchLogo theme="dark" height={30} className="auth-corner-logo-image" alt="" />
        </Link>
      ) : null}
      <div className="auth-simple-body">
        <div className="auth-simple-shell">
          <section className="auth-simple-art" aria-label="Shelf Merch branded merchandise">
            {isReferenceLayout ? (
              <>
                <div className="auth-reference-visual">
                  <div className="auth-reference-pills" aria-label="Merch, gifting and recognition">
                    <span>Merch</span>
                    <span>Gifting</span>
                    <span>Recognition</span>
                  </div>
                  <svg
                    className="auth-reference-plane"
                    viewBox="0 0 48 48"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 21 43 5 28 44 22 28Z"
                      fill="#FFD84A"
                      stroke="#3155FF"
                      strokeWidth="1.25"
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M43 5 22 28M22 28 5 21"
                      stroke="#3155FF"
                      strokeWidth="1.25"
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg
                    className="auth-reference-shape"
                    viewBox="0 0 800 400"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <ellipse cx="400" cy="200" rx="400" ry="200" fill="#C9B8FF" />
                  </svg>
                  <img
                    className="auth-reference-kit"
                    src="/images/landing/auth-people-gifting-v4.webp"
                    alt="Two coworkers sharing a Shelf Merch welcome gift beside a desk"
                    width="1536"
                    height="1024"
                    fetchPriority="high"
                  />
                  <span className="auth-reference-star" aria-hidden="true">
                    {"\u2733"}
                  </span>
                  <svg
                    className="auth-reference-rays"
                    viewBox="0 0 64 64"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 36 8 16M29 30 34 5M43 40 60 23"
                      stroke="#FFDC49"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="auth-reference-copy">
                  <p className="auth-reference-eyebrow">MERCH. GIFTING. RECOGNITION.</p>
                  <h2 className="auth-reference-headline">
                    Every gift, <em>one shelf.</em>
                  </h2>
                </div>
              </>
            ) : (
              <img src={authMerchImage} alt="" className="auth-simple-art-img" />
            )}
          </section>

          {isWelcome ? (
            <div className="auth-simple-form-col">
              <section className="auth-simple-card">
                <h1 className="auth-simple-title">{title}</h1>
                {subtitle ? <p className="auth-simple-subtitle">{subtitle}</p> : null}
                {children}
                {isReferenceLayout && showDivider && footerLink ? (
                  <div className="auth-reference-divider" aria-hidden="true">
                    <span>OR</span>
                  </div>
                ) : null}
                {footerLink ? (
                  <p className="auth-simple-switch">
                    {footerLink.hint ? <>{footerLink.hint} </> : null}
                    <Link to={footerLink.to} className="auth-simple-switch-link">
                      {footerLink.label}
                    </Link>
                  </p>
                ) : null}
              </section>
            </div>
          ) : (
            <section className="auth-simple-card">
              <Link to="/" className="auth-simple-logo" aria-label="Shelf Merch home">
                <ShelfMerchLogo height={isCompact ? 32 : 42} className="auth-simple-logo-img" />
              </Link>
              <h1 className="auth-simple-title">{title}</h1>
              {subtitle ? <p className="auth-simple-subtitle">{subtitle}</p> : null}
              {children}
              {footerLink ? (
                <p className="auth-simple-switch">
                  {footerLink.hint ? <>{footerLink.hint} </> : null}
                  <Link to={footerLink.to} className="auth-simple-switch-link">
                    {footerLink.label}
                  </Link>
                </p>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthLabel({
  htmlFor,
  children,
  action,
}: {
  htmlFor?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="auth-simple-label-row">
      <label htmlFor={htmlFor} className="auth-simple-label">
        {children}
      </label>
      {action}
    </div>
  );
}

export const authInputClassName = "auth-simple-input";
