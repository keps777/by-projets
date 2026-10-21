/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origine de l'API (injectée au build par le Dockerfile). */
  readonly VITE_API_URL?: string;
  /** Environnement : `dev` (par défaut), `staging`, `production`. `production` coupe le mode démo. */
  readonly VITE_APP_ENV?: string;
  /** `1` / `0` : force le mode démo, quel que soit l'environnement. */
  readonly VITE_MODE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
