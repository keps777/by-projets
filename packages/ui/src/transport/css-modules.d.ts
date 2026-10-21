// Types minimaux des modules CSS (pas de dépendance à vite/client).
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
