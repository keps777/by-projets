import "@afrimove/design/fonts.css";
import "@afrimove/design/tokens.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { enregistrerServiceWorker } from "./coquille/pwa";

const racine = document.getElementById("racine");
if (!racine) throw new Error("Élément #racine introuvable dans index.html");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

enregistrerServiceWorker();
