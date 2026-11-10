import { AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import { useLocation } from "react-router";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const location = useLocation();
  const isAuthRoute = /^\/(login|signup|forgot-password|reset-password)(\/|$)/.test(
    location.pathname,
  );

  return (
    <Sonner
      theme="light"
      position="top-right"
      closeButton
      expand={false}
      visibleToasts={4}
      duration={5000}
      gap={12}
      offset={{ top: isAuthRoute ? 16 : 70, right: 24 }}
      mobileOffset={{ top: isAuthRoute ? 16 : 70, right: 16, left: 16 }}
      className="sm-sonner"
      style={{ "--width": "260px" } as React.CSSProperties}
      icons={{
        success: null,
        error: <AlertCircle size={20} strokeWidth={2} aria-hidden />,
        info: <Info size={20} strokeWidth={2} aria-hidden />,
        warning: <AlertTriangle size={20} strokeWidth={2} aria-hidden />,
        loading: <Loader2 size={20} strokeWidth={2} className="sm-sonner-spin" aria-hidden />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "sm-toast",
          title: "sm-toast-title",
          description: "sm-toast-desc",
          success: "sm-toast--success",
          error: "sm-toast--error",
          info: "sm-toast--info",
          warning: "sm-toast--warning",
          closeButton: "sm-toast-close",
          icon: "sm-toast-icon",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
