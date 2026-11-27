import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";

const root = document.getElementById("root") as (HTMLElement & { __moduKonvaMounted?: boolean }) | null;

if (!root) {
  throw new Error("root element not found");
}

if (!root.__moduKonvaMounted) {
  root.__moduKonvaMounted = true;
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
