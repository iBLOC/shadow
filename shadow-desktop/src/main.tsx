import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/error/ErrorBoundary";
import { installErrorLogBridge } from "./stores/errorLogStore";
import { installGlobalErrorHandlers } from "./lib/errorTriggers";
import { installHttpErrorInterceptor } from "./lib/httpInterceptor";
import "./index.css";
import "./i18n";

installGlobalErrorHandlers();
installHttpErrorInterceptor();
installErrorLogBridge();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
