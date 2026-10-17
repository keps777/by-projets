#!/bin/sh
# AM-172 · archive_command de PostgreSQL : met un segment de journal (WAL) de côté dans un dossier
# d'attente (« spool »), monté depuis l'hôte. Tourne DANS le conteneur postgres (Alpine : sh, cp, cmp,
# sync seulement, aucun outil de chiffrement ni accès réseau). C'est expedier-journal.sh, sur l'hôte,
# qui chiffre et envoie ensuite aux deux fournisseurs.
#
#   postgresql.conf :  archive_mode = on
#                      archive_command = '/sauvegardes/archiver-wal.sh "%p" "%f"'
#
# Code de sortie 0 uniquement si le segment est durablement dans le spool : PostgreSQL garde alors le
# segment tant que ce n'est pas le cas et réessaie (disque plein = on le voit, on ne perd rien).
set -eu

chemin="${1:?chemin du segment (%p)}"
nom="${2:?nom du segment (%f)}"
spool="${SPOOL_WAL:-/wal-spool}"

if [ ! -d "$spool" ]; then
  echo "archiver-wal : dossier d'attente absent ($spool)" >&2
  exit 1
fi

if [ -f "$spool/$nom" ]; then
  # Déjà archivé (réessai après un arrêt brutal) : acceptable seulement si le contenu est identique.
  if cmp -s "$chemin" "$spool/$nom"; then exit 0; fi
  echo "archiver-wal : $nom existe déjà dans le spool avec un autre contenu, refus d'écraser" >&2
  exit 1
fi

cp "$chemin" "$spool/$nom.partiel"
sync "$spool/$nom.partiel" 2>/dev/null || sync
mv "$spool/$nom.partiel" "$spool/$nom"
