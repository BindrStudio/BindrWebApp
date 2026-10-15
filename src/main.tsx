import { createRoot } from "react-dom/client";
import { App } from "./App";
import { meld } from "./state";
import { laadLabelLogo } from "./lib/label";

createRoot(document.getElementById("app")!).render(<App />);
void laadLabelLogo(); // het logo voor op de labels alvast klaarzetten

// Offline werken en snel opstarten: de service worker bewaart de app, de catalogus en kaartfoto's.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const nieuw = reg.installing;
      nieuw?.addEventListener("statechange", () => {
        if (nieuw.state === "installed" && navigator.serviceWorker.controller) {
          meld("Er is een nieuwe versie van de app", "info", { label: "Herladen", doe: () => location.reload() }, 15000);
        }
      });
    });
  }).catch(() => undefined);
}
