import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("react-sheets-root");
if (container) {
  createRoot(container).render(<App />);
}
