import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InboxApp } from "./InboxApp";
import "./inbox.css";
import "../shared/site-header.css";

createRoot(document.getElementById("inbox-root")!).render(
  <StrictMode>
    <InboxApp />
  </StrictMode>,
);
