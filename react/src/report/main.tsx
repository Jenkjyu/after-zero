import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("react-report-root");
if (container) {
  createRoot(container).render(<App />);
}
