// Types minimaux des imports Vite utilisés par les tests (pas de dépendance à vite/client).
declare module "*?raw" {
  const contenu: string;
  export default contenu;
}

interface ImportMeta {
  glob(
    motif: string,
    options: { query: "?raw"; import: "default"; eager: true },
  ): Record<string, string>;
  glob(
    motif: string,
    options: { query: "?url"; import: "default"; eager: true },
  ): Record<string, string>;
}
