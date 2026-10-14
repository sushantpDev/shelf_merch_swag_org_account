import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { Link, useRouteError, useRevalidator } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { ShopSubdomainGate } from "./ShopSubdomainGate";
import errorPageArt from "@/assets/error-page-signpost.png";
import { queryClient } from "@/services/queryClient";
import { usePublicSeo } from "@/seo/usePublicSeo";

function ErrorStatusPage({
  title,
  description,
  requestId,
  actions,
}: {
  title: string;
  description: string;
  requestId?: string;
  actions: ReactNode;
}) {
  return (
    <div className="error-page fade-in">
      <Link to="/" className="error-page__brand" aria-label="Shelf Merch home">
        <ShelfMerchLogo height={28} />
      </Link>
      <div className="error-page__layout">
        <div className="error-page__copy">
          <h1 className="error-page__title">
            <span>{title}</span>
            <span>{description}</span>
          </h1>
          <div className="error-page__actions">{actions}</div>
          {requestId ? (
            <p className="error-page__ref">
              Reference <span className="error-page__mono">{requestId}</span>
            </p>
          ) : null}
        </div>

        <div className="error-page__visual">
          <img src={errorPageArt} alt="" className="error-page__art" />
        </div>
      </div>
    </div>
  );
}

/** App shell: provides react-query + renders the matched route tree. */
export function RootLayout() {
  usePublicSeo();
  return (
    <QueryClientProvider client={queryClient}>
      <ShopSubdomainGate />
      <Toaster />
    </QueryClientProvider>
  );
}

export function NotFound() {
  return (
    <ErrorStatusPage
      title="Our gift took a wrong turn!"
      description="Sorry, the page you have requested was not found."
      actions={
        <Link to="/" className="error-page__home">
          Go to Shelf Merch Home
        </Link>
      }
    />
  );
}

export function RouteError() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  console.error(error);

  const requestId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `err-${Date.now().toString(36)}`;
  }, []);

  return (
    <ErrorStatusPage
      title="Something slipped off the shelf."
      description="Sorry, we couldn't load this page right now."
      requestId={requestId}
      actions={
        <>
          <button type="button" className="error-page__home" onClick={() => revalidator.revalidate()}>
            Try again
          </button>
          <Link to="/" className="error-page__home">
            Go to Shelf Merch Home
          </Link>
        </>
      }
    />
  );
}
