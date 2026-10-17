import "@afrimove/design/fonts.css";
import "@afrimove/design/tokens.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { enregistrerServiceWorker } from "./coquille/pwa";
import { brancherNatif, estNatif } from "./natif";

const racine = document.getElementById("racine");
if (!racine) throw new Error("Élément #racine introuvable dans index.html");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Application emballée (AM-184) : le build est déjà dans l'application, pas de service worker (iOS n'en offre pas
// sous capacitor://) ; liens entrants, bouton retour Android et écran de lancement passent par src/natif.
// Dans un navigateur, `estNatif()` est faux et `brancherNatif()` ne fait rien.
enregistrerServiceWorker({ actif: import.meta.env.PROD && !estNatif() });
void brancherNatif();
