# AfriMove

Application web installable (PWA React + Vite) pour tous les rôles, API NestJS + PostgreSQL, puis emballage Capacitor pour les stores.

- Architecture : « AfriMove · Architecture technique » (claude.ai/code/artifact/0541a6e9-0150-43be-8f54-c02403d3ab9b)
- Maquettes V3 (source de vérité visuelle) : `docs/maquettes-v3/`
- Tickets : `docs/tickets.md` (version humaine), `docs/tickets.json` (version machine)

## Lancer

```
pnpm i
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

| Dossier | Rôle |
|---|---|
| `apps/web` | application web (tous les rôles, route `/controle` pour la salle de contrôle) |
| `apps/api` | API NestJS |
| `packages/design` | tokens de design v3 et polices |
| `packages/ui` | kit de composants |
| `packages/domain` | entités, états, numérotation, tarifs |
| `packages/fixtures` | données de démonstration, un scénario par planche |
| `packages/contrats` | schémas d'API (zod) |
| `packages/api-client` | client d'API, adaptateurs mock et HTTP |
| `tools/fidelite` | banc de fidélité maquette ↔ app |

## Règle d'or

Un ticket = un périmètre de fichiers (champ `perimetre` du ticket). On ne modifie rien hors de son périmètre ; s'il manque quelque chose ailleurs, on le note dans la PR et on ouvre un ticket.
Branche `am-XXX-titre-court`, une PR par ticket, CI verte avant fusion.
