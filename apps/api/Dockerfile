# syntax=docker/dockerfile:1.7
# AM-018 · Image de l'API NestJS.
# Contexte de build : la racine du dépôt.
#   docker build -f apps/api/Dockerfile -t afrimove-api .
# Exécution : variables d'environnement uniquement (PORT, DATABASE_URL, …), jamais de secret dans l'image.

ARG NODE_VERSION=22

# ---------- 1. Outils et dépendances
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable
WORKDIR /repo

FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# ---------- 2. Build (paquets partagés puis API) et extraction des seules dépendances de production
FROM fetch AS build
COPY tsconfig.base.json turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
RUN find . -name node_modules -type d -prune -exec rm -rf {} +
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@afrimove/api..."

RUN pnpm --filter "@afrimove/api..." run build
# Garde-fou : l'API Nest doit produire apps/api/dist/main.js (nest build).
RUN test -f apps/api/dist/main.js \
    || { echo "ERREUR : apps/api/dist/main.js est absent. Le script « build » de apps/api doit compiler l'API (nest build) vers apps/api/dist."; exit 1; }

# Dossier autonome : package.json + node_modules de production (paquets du monorepo copiés, pas liés).
RUN pnpm --filter "@afrimove/api" deploy --legacy --prod /out
# pnpm deploy ne copie pas toujours les dossiers ignorés par git (dist) : on les remet explicitement.
RUN cp -R apps/api/dist /out/dist \
    && for d in packages/*/; do \
         name="$(basename "$d")"; \
         if [ -d "$d/dist" ] && [ -d "/out/node_modules/@afrimove/$name" ]; then \
           rm -rf "/out/node_modules/@afrimove/$name/dist" \
           && cp -R "$d/dist" "/out/node_modules/@afrimove/$name/dist"; \
         fi; \
       done

# ---------- 3. Image finale
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node

EXPOSE 3000
# Sonde TCP : ne dépend d'aucune route (le contrôle HTTP « /health » viendra avec l'API).
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "require('net').connect(+process.env.PORT||3000,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main.js"]
