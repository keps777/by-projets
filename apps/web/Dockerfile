# syntax=docker/dockerfile:1.7
# AM-018 · Image de l'application web (React + Vite PWA) servie par Nginx.
# Contexte de build : la racine du dépôt.
#   docker build -f apps/web/Dockerfile -t afrimove-web .
# Arguments de build (Vite les fige dans le bundle, aucun secret ici) :
#   --build-arg VITE_API_URL=https://api.dev.exemple.org
#   --build-arg VITE_APP_ENV=dev

ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

# ---------- 1. Outils et dépendances (couche mise en cache tant que le lockfile ne change pas)
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable
WORKDIR /repo

FROM base AS fetch
# pnpm fetch ne lit que le lockfile : cette couche survit aux changements de code.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# ---------- 2. Build Vite
FROM fetch AS build
COPY tsconfig.base.json turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
# Un contexte construit depuis un poste de dev peut contenir des node_modules locaux.
RUN find . -name node_modules -type d -prune -exec rm -rf {} +
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@afrimove/web..."

ARG VITE_API_URL=""
ARG VITE_APP_ENV="dev"
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_APP_ENV=${VITE_APP_ENV}

# Construit d'abord les paquets dont dépend apps/web, puis apps/web.
RUN pnpm --filter "@afrimove/web..." run build
# Garde-fou : tant que le build Vite n'existe pas, mieux vaut échouer ici qu'embarquer un site vide.
RUN test -f apps/web/dist/index.html \
    || { echo "ERREUR : apps/web/dist/index.html est absent. Le script « build » de apps/web doit produire un build Vite dans apps/web/dist."; exit 1; }

# ---------- 3. Image finale : Nginx sans privilèges, fichiers statiques uniquement
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime
COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
# CMD hérité de l'image Nginx (nginx -g 'daemon off;'), utilisateur « nginx » (non root).
