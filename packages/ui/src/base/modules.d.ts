// Types des imports Vite utilisés par le kit (pas de dépendance à vite/client).
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.css?raw" {
  const contenu: string;
  export default contenu;
}
