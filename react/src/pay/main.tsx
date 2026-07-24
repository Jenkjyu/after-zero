import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("react-pay-root");
if (container) {
  createRoot(container).render(<App />);
}
