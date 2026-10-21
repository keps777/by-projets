#!/usr/bin/env bash
# AM-172 · Fonctions communes des scripts de sauvegarde. À « sourcer », pas à exécuter.
# Configuration : sauvegardes.env (modèle : sauvegardes.env.exemple), cherché dans $SAUVEGARDES_ENV
# puis à côté des scripts. Les variables déjà présentes dans l'environnement priment sur le fichier.

DOSSIER_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[sauvegarde] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  log "ERREUR : $*"
  alerter "$*" || true
  exit 1
}

# Lit le fichier de configuration sans écraser ce que l'appelant a déjà exporté.
charger_config() {
  local fichier="${SAUVEGARDES_ENV:-$DOSSIER_SCRIPTS/sauvegardes.env}" ligne cle valeur
  if [ -f "$fichier" ]; then
    while IFS= read -r ligne || [ -n "$ligne" ]; do
      case "$ligne" in '' | '#'*) continue ;; esac
      cle="${ligne%%=*}"
      valeur="${ligne#*=}"
      valeur="${valeur%\"}"
      valeur="${valeur#\"}"
      [[ "$cle" =~ ^[A-Z][A-Z0-9_]*$ ]] || continue
      [ -n "${!cle+x}" ] || export "$cle=$valeur"
    done <"$fichier"
  fi
  : "${DOSSIER_TRAVAIL:=/var/lib/afrimove/sauvegardes}"
  : "${SPOOL_WAL:=$DOSSIER_TRAVAIL/wal}"
  : "${PG_COMMANDE:=}"
  : "${PG_UTILISATEUR:=afrimove}"
  : "${PG_BASE:=afrimove}"
  : "${RETENTION_COMPLET_JOURS:=30}"
  : "${RETENTION_PHYSIQUE_JOURS:=7}"
  : "${RETENTION_JOURNAL_JOURS:=7}"
  : "${GARDER_AU_MOINS:=3}"
  : "${FRAICHEUR_COMPLET_HEURES:=26}"
  : "${FRAICHEUR_JOURNAL_MINUTES:=30}"
  : "${OBJECTIF_RESTAURATION_SECONDES:=7200}"
  : "${ALERTE_URL:=}"
  : "${AGE_DESTINATAIRES:=}"
  : "${FOURNISSEUR_A:=}"
  : "${FOURNISSEUR_B:=}"
}

# Les deux fournisseurs sont obligatoires et doivent être distincts (deux comptes, deux régions : la
# distinction réelle des régions ne se contrôle pas d'ici, voir le README).
exiger_fournisseurs() {
  [ -n "$FOURNISSEUR_A" ] || die "FOURNISSEUR_A manque dans la configuration"
  [ -n "$FOURNISSEUR_B" ] || die "FOURNISSEUR_B manque dans la configuration"
  [ "$FOURNISSEUR_A" != "$FOURNISSEUR_B" ] || die "FOURNISSEUR_A et FOURNISSEUR_B sont identiques : il faut deux fournisseurs"
  FOURNISSEURS=("$FOURNISSEUR_A" "$FOURNISSEUR_B")
}

exiger_chiffrement() {
  [ -n "$AGE_DESTINATAIRES" ] || die "AGE_DESTINATAIRES manque : aucune sauvegarde ne part en clair"
  ARGS_AGE=()
  local cle
  for cle in $AGE_DESTINATAIRES; do
    [[ "$cle" == age1* ]] || die "destinataire age invalide (doit commencer par age1) : $cle"
    ARGS_AGE+=(-r "$cle")
  done
}

exiger_outils() {
  local outil
  for outil in "$@"; do
    command -v "$outil" >/dev/null 2>&1 || die "outil manquant sur cet hôte : $outil"
  done
}

# Commande qui précède pg_dump, pg_restore… : « docker compose … exec -T db » en production, vide pour
# parler directement à un serveur (variables PG* de l'environnement).
preparer_pg() {
  PG=()
  if [ -n "$PG_COMMANDE" ]; then read -r -a PG <<<"$PG_COMMANDE"; fi
}
pg() { ${PG[@]+"${PG[@]}"} "$@"; }

# Heure de référence en secondes. MAINTENANT (date lisible par `date -d`) ne sert qu'aux tests.
maintenant_epoch() {
  if [ -n "${MAINTENANT:-}" ]; then date -u -d "$MAINTENANT" +%s; else date -u +%s; fi
}
horodatage_de_epoch() { date -u -d "@$1" +%Y%m%dT%H%M%SZ; }
horodatage_maintenant() { horodatage_de_epoch "$(maintenant_epoch)"; }
# Secondes depuis 1970 d'un horodatage AAAAMMJJTHHMMSSZ.
epoch_de_horodatage() {
  local h="$1"
  date -u -d "${h:0:4}-${h:4:2}-${h:6:2} ${h:9:2}:${h:11:2}:${h:13:2}" +%s
}
extraire_horodatage() {
  if [[ "$1" =~ ([0-9]{8}T[0-9]{6}Z) ]]; then printf '%s' "${BASH_REMATCH[1]}"; fi
}

# Prévient l'équipe (webhook). Ne fait jamais échouer l'appelant.
alerter() {
  [ -n "${ALERTE_URL:-}" ] || return 0
  curl -fsS --max-time 15 -X POST -H 'Content-Type: application/json' \
    --data "$(printf '{"text":"AfriMove · sauvegardes : %s"}' "${1//\"/\\\"}")" \
    "$ALERTE_URL" >/dev/null 2>&1 || log "alerte non envoyée"
  return 0
}

# Dépose un fichier local chez UN fournisseur et vérifie qu'il y est arrivé entier (taille).
# deposer_chez FOURNISSEUR FICHIER_LOCAL DOSSIER_DISTANT
deposer_chez() {
  local four="$1" fichier="$2" dossier="$3" nom taille_distante
  nom="$(basename "$fichier")"
  rclone copyto "$fichier" "$four/$dossier/$nom" || return 1
  taille_distante="$(rclone lsf --format s --files-only --include "$nom" "$four/$dossier" | head -n1)"
  [ "$taille_distante" = "$(wc -c <"$fichier" | tr -d ' ')" ] || {
    log "$four : taille distante différente pour $nom"
    return 1
  }
}

# Dépose chez les deux fournisseurs. Résultat : $DEPOTS_REUSSIS (nombre de fournisseurs complets) et
# $DEPOTS_ECHOUES (leurs noms).
# deposer_partout DOSSIER_DISTANT FICHIER...
deposer_partout() {
  local dossier="$1" four fichier ok
  shift
  DEPOTS_REUSSIS=0
  DEPOTS_ECHOUES=()
  for four in "${FOURNISSEURS[@]}"; do
    ok=1
    for fichier in "$@"; do
      deposer_chez "$four" "$fichier" "$dossier" || ok=0
    done
    if [ "$ok" = 1 ]; then
      DEPOTS_REUSSIS=$((DEPOTS_REUSSIS + 1))
      log "$four : $dossier déposé"
    else
      DEPOTS_ECHOUES+=("$four")
      log "$four : dépôt dans $dossier ÉCHOUÉ"
    fi
  done
}

# Dossier de travail privé (0700), supprimé à la sortie du script.
dossier_temporaire() {
  umask 077
  mkdir -p "$DOSSIER_TRAVAIL"
  TMP="$(mktemp -d "$DOSSIER_TRAVAIL/tmp.XXXXXX")"
  trap 'rm -rf "$TMP"' EXIT
}
