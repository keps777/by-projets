#!/usr/bin/env bash
# AM-018 · Pilotage de l'environnement dev sur l'hôte Docker. Appelé par le workflow
# « Déploiement dev » (par SSH) et, pour un retour arrière rapide, à la main.
#
#   ./ctl.sh preflight                    vérifie Docker, compose, secrets.env, espace disque
#   ./ctl.sh login <utilisateur>          docker login ghcr.io, jeton lu sur l'entrée standard
#   ./ctl.sh backup                       sauvegarde pg_dump (7 dernières conservées)
#   ./ctl.sh migrate <tag>                lit la commande de migration sur stdin, l'exécute avec l'image api:<tag>
#   ./ctl.sh deploy <web|api> <tag>       tire l'image, bascule le service, attend qu'il soit sain,
#                                         sinon revient seul à la version précédente
#   ./ctl.sh rollback [tag]               sans argument : web et api reviennent à la version précédente ;
#                                         avec un tag : web et api passent à ce tag
#   ./ctl.sh status                       versions en place et état des conteneurs
#
# Variables attendues pour « deploy » (écrites dans .env, donc retenues ensuite) :
#   WEB_IMAGE, API_IMAGE  ex. ghcr.io/org/depot/web  et  ghcr.io/org/depot/api
set -euo pipefail

cd "$(dirname "$0")"
STATE_DIR="state"
BACKUP_DIR="backups"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
mkdir -p "$STATE_DIR" "$BACKUP_DIR"
touch .env

log() { printf '[ctl] %s\n' "$*"; }
die() { printf '[ctl] ERREUR : %s\n' "$*" >&2; exit 1; }

dc() { docker compose --env-file .env -f compose.yaml "$@"; }

# set_env CLE VALEUR : écrit ou remplace une ligne de .env
set_env() {
  local k="$1" v="$2" tmp
  tmp="$(mktemp)"
  grep -v "^${k}=" .env > "$tmp" || true
  printf '%s=%s\n' "$k" "$v" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

get_state() { [ -f "$STATE_DIR/$1" ] && cat "$STATE_DIR/$1" || true; }

tag_var() { case "$1" in web) echo WEB_TAG ;; api) echo API_TAG ;; *) die "service inconnu : $1" ;; esac; }

wait_healthy() {
  local svc="$1" cid status waited=0
  cid="$(dc ps -q "$svc")"
  [ -n "$cid" ] || return 1
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo absent)"
    case "$status" in
      healthy) return 0 ;;
      exited|dead|absent) return 1 ;;
    esac
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

# switch_service SVC TAG : bascule sans toucher à l'historique
switch_service() {
  local svc="$1" tag="$2" var
  var="$(tag_var "$svc")"
  set_env "$var" "$tag"
  # Chaque commande doit réussir : on est souvent appelé dans un « if » où set -e est inactif.
  # Les tags sont immuables (sha-xxxxxxx) : compose ne tire que l'image absente de l'hôte,
  # donc un retour arrière sur une version déjà passée n'a pas besoin du registre.
  dc up -d --no-deps --pull missing "$svc" || return 1
  wait_healthy "$svc"
}

cmd_preflight() {
  command -v docker >/dev/null || die "docker introuvable sur l'hôte"
  docker compose version >/dev/null || die "docker compose introuvable"
  [ -f compose.yaml ] || die "compose.yaml absent"
  [ -f secrets.env ] || die "secrets.env absent : voir infra/README.md (étape 3 de la mise en place)"
  for k in POSTGRES_PASSWORD DATABASE_URL; do
    grep -q "^${k}=" secrets.env || die "${k} manque dans secrets.env"
  done
  local free_kb
  free_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
  [ "$free_kb" -gt 2097152 ] || die "moins de 2 Go libres sur l'hôte"
  log "hôte prêt ($(docker --version))"
}

cmd_login() {
  local user="${1:?utilisateur du registre}"
  docker login ghcr.io -u "$user" --password-stdin >/dev/null
  log "connecté à ghcr.io"
}

cmd_backup() {
  if [ -z "$(dc ps -q db 2>/dev/null)" ] || [ "$(docker inspect --format '{{.State.Running}}' "$(dc ps -q db)")" != "true" ]; then
    log "base absente ou arrêtée (premier déploiement ?) : pas de sauvegarde"
    return 0
  fi
  local out="$BACKUP_DIR/dev-$(date -u +%Y%m%dT%H%M%SZ).dump"
  dc exec -T db pg_dump -U afrimove -d afrimove -Fc > "$out"
  [ -s "$out" ] || { rm -f "$out"; die "sauvegarde vide"; }
  log "sauvegarde : $out ($(du -h "$out" | cut -f1))"
  # Conserve les 7 plus récentes.
  ls -1t "$BACKUP_DIR"/dev-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
}

cmd_migrate() {
  local tag="${1:?tag de limage api}" command
  command="$(cat)"
  [ -n "$command" ] || { log "aucune commande de migration : étape ignorée"; return 0; }
  [ -n "${API_IMAGE:-}" ] && set_env API_IMAGE "$API_IMAGE"
  dc up -d db
  wait_healthy db || die "la base ne devient pas saine"
  log "migration avec l'image api:$tag"
  API_TAG="$tag" dc run --rm --no-deps api sh -c "$command"
}

cmd_deploy() {
  local svc="${1:?web|api}" tag="${2:?tag}" current
  [ -n "${WEB_IMAGE:-}" ] && set_env WEB_IMAGE "$WEB_IMAGE"
  [ -n "${API_IMAGE:-}" ] && set_env API_IMAGE "$API_IMAGE"
  current="$(get_state "$svc.current")"

  log "$svc : ${current:-aucune version} -> $tag"
  if switch_service "$svc" "$tag"; then
    if [ "$current" != "$tag" ]; then
      [ -z "$current" ] || printf '%s' "$current" > "$STATE_DIR/$svc.previous"
      printf '%s' "$tag" > "$STATE_DIR/$svc.current"
    fi
    log "$svc en ligne et sain ($tag)"
  else
    log "$svc ne devient pas sain : retour à ${current:-rien}"
    dc logs --tail 40 "$svc" || true
    if [ -n "$current" ]; then
      switch_service "$svc" "$current" || log "le retour arrière de $svc a aussi échoué : voir infra/README.md"
    fi
    exit 1
  fi
}

cmd_rollback() {
  local target="${1:-}" svc cur prev
  for svc in api web; do
    cur="$(get_state "$svc.current")"
    if [ -n "$target" ]; then
      prev="$target"
    else
      prev="$(get_state "$svc.previous")"
      [ -n "$prev" ] || { log "$svc : pas de version précédente connue, ignoré"; continue; }
    fi
    [ "$prev" != "$cur" ] || { log "$svc déjà sur $cur"; continue; }
    log "retour arrière $svc : $cur -> $prev"
    switch_service "$svc" "$prev" || die "$svc ne devient pas sain en $prev"
    printf '%s' "$cur" > "$STATE_DIR/$svc.previous"
    printf '%s' "$prev" > "$STATE_DIR/$svc.current"
  done
  cmd_status
}

cmd_status() {
  log "web : $(get_state web.current) (précédent : $(get_state web.previous))"
  log "api : $(get_state api.current) (précédent : $(get_state api.previous))"
  dc ps
}

case "${1:-}" in
  preflight) cmd_preflight ;;
  login)     shift; cmd_login "$@" ;;
  backup)    cmd_backup ;;
  migrate)   shift; cmd_migrate "$@" ;;
  deploy)    shift; cmd_deploy "$@" ;;
  rollback)  shift; cmd_rollback "$@" ;;
  status)    cmd_status ;;
  *) sed -n '2,17p' "$0"; exit 2 ;;
esac
