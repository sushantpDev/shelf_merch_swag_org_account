import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { appRouter } from "./app/router";
import { ConsentBanner } from "./features/privacy/ConsentBanner";
import { prepareOpenAiPixel } from "./lib/openaiPixel";
import "./styles.css";
// Unlayered auth styles — must load after Tailwind/shelf-merch so route-chunk CSS cannot override them.
import "./styles/auth.css";

// React 19 StrictMode double-mounts effects in dev; the app uses imperative portals
// and document-level listeners in a few places, so we mount without StrictMode.
prepareOpenAiPixel();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <>
    <RouterProvider router={appRouter} />
    <ConsentBanner />
  </>,
);
