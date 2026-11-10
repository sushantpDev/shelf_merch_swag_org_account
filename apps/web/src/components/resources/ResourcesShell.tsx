import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Header } from "../landing/Header";
import { Footer } from "../landing/Footer";
import "../landing-page.css";
import "./resources.css";

type ResourcesShellProps = {
  title: string;
  tone?: "blue" | "coral" | "mint";
  variant?: "hub" | "hr" | "sales" | "events" | "case-study" | "about" | "platform";
  children: ReactNode;
};

export function ResourcesShell({ title, tone, variant, children }: ResourcesShellProps) {
  const location = useLocation();

  useEffect(() => {
    document.title = title;
    window.scrollTo(0, 0);
  }, [title, location.pathname]);

  return (
    <div
      className={`shelf-resources${tone ? ` tone-${tone}` : ""}${variant ? ` resources-${variant}` : ""}`}
    >
      <div className="shelf-landing resources-site-header">
        <Header />
      </div>
      {children}
      <div className="shelf-landing">
        <Footer />
      </div>
    </div>
  );
}
