<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { aller } from '../../router.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { jourDe, jourLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { piecesCompletes } from '../../core/logement.ts';
  import { libelleCompte, titulaireCoherent } from '../../core/avance-loyer.ts';
  import { blocage, dossier, entreeValide, majInfos, manques, piecesDe } from './actions.ts';
  import { logement } from './etat.ts';
  import Verrou from './Verrou.svelte';
  import FeuillePiece from './FeuillePiece.svelte';
  import FeuilleCompte from './FeuilleCompte.svelte';

  const l = logement();
  const bloque = $derived(blocage());
  const enAttente = $derived(l.dossier?.statut === 'accord_attendu');
  if (!blocage() && l.dossier?.statut !== 'accord_attendu') dossier();
  const d = $derived(l.dossier);
  let nomLogement = $state(l.dossier?.logement ?? '');
  let nomBailleur = $state(l.dossier?.bailleur ?? '');
  let entree = $state(l.dossier?.entree ?? '');
  $effect(() => { if (!bloque && d && !enAttente) majInfos({ logement: nomLogement.trim(), bailleur: nomBailleur.trim(), entree }); });

  const pieces = $derived(piecesDe(d));
  const nb = $derived(piecesCompletes(pieces));
  const manque = $derived(manques(d));
  const aujourdhui = $derived(jourDe(new Date(maintenant())));
  const erreurEntree = $derived(entree && !entreeValide(entree) ? "Choisissez une date entre aujourd'hui et dans 6 mois." : '');
  const coherent = $derived(!!d?.compte && titulaireCoherent(nomBailleur, d.compte.titulaire));

  let fBail = $state(false), fCni = $state(false), fPhotos = $state(false), fCompte = $state(false);
  const ouvrir = (k: 'bail' | 'cni' | 'photos' | 'compte') => { fBail = k === 'bail'; fCni = k === 'cni'; fPhotos = k === 'photos'; fCompte = k === 'compte'; };

  const tuiles = $derived([
    { k: 'bail' as const, nom: 'Bail signé', fait: pieces.bail, sous: d?.bail ? `${d.bail.nom}` : 'Touchez pour ajouter', icone: 'document' },
    { k: 'cni' as const, nom: 'CNI du bailleur', fait: pieces.cniBailleur, sous: d?.cni ? d.cni.nom : 'Touchez pour ajouter', icone: 'profil' },
    { k: 'photos' as const, nom: 'Photos du logement', fait: pieces.photos, sous: d?.photos.length ? `${d.photos.length} photo${d.photos.length > 1 ? 's' : ''}` : 'Touchez pour ajouter', icone: 'photo' },
    { k: 'compte' as const, nom: 'Compte du bailleur', fait: pieces.compteBailleur, sous: d?.compte ? `${libelleCompte(d.compte.type, d.compte.numero)}${d.compte.verifie ? '' : ' · à vérifier par SMS'}` : 'Orange Money, MTN ou banque · à ajouter', icone: 'carte' }
  ]);
</script>

<Ecran titre="Bail et bailleur" sur="ÉTAPE 2 / 3 · {nb} PIÈCE{nb > 1 ? 'S' : ''} SUR 4" retourVers="/logement/avance">
  {#if bloque}
    <Verrou />
  {:else if enAttente}
    <Carte accent="var(--primaire)">
      <b>Votre dossier est chez le bailleur</b>
      <p class="muted" style="margin: 6px 0 12px">Les pièces sont figées tant qu'il n'a pas répondu.</p>
      <Bouton href="/logement/bailleur">Voir le dossier</Bouton>
    </Carte>
  {:else}
    <Carte>
      <h2>Le logement</h2>
      <div class="champs">
        <Champ etiquette="NOM DU LOGEMENT" bind:valeur={nomLogement} placeholder="Appartement Makepe" />
        <Champ etiquette="NOM DU BAILLEUR" bind:valeur={nomBailleur} placeholder="Jean-Pierre Essomba" />
        <Champ etiquette="ENTRÉE DANS LES LIEUX" type="date" bind:valeur={entree} erreur={erreurEntree} />
      </div>
    </Carte>

    <ul class="tuiles">
      {#each tuiles as t (t.k)}
        <li>
          <button type="button" class:fait={t.fait} onclick={() => ouvrir(t.k)} aria-label="{t.nom} : {t.fait ? 'ajouté' : 'à ajouter'}. {t.sous}">
            <span class="ico"><Icone nom={t.icone} taille={22} /></span>
            <span class="txt"><b>{t.nom}</b><small>{t.sous}</small></span>
            <span class="coche" aria-hidden="true">{t.fait ? '✓' : ''}</span>
          </button>
        </li>
      {/each}
    </ul>

    {#if d?.bail}
      <Carte>
        <div class="tete"><b>Lu dans le bail</b><Pastille ton={coherent ? 'bon' : 'alerte'}>{coherent ? 'COHÉRENT' : d.compte ? 'À VÉRIFIER' : 'EN ATTENTE'}</Pastille></div>
        <dl>
          <div><dt>Loyer</dt><dd class="mono">{fcfa(l.sim.loyer)} / mois</dd></div>
          <div><dt>Avance</dt><dd class="mono">{l.sim.mois} mois · {fcfa(l.sim.loyer * l.sim.mois)}</dd></div>
          <div><dt>Entrée dans les lieux</dt><dd class="mono">{entree && entreeValide(entree) ? jourLong(entree) : '—'}</dd></div>
          <div><dt>Bailleur</dt><dd>{nomBailleur || '—'}</dd></div>
          {#if d.compte}<div><dt>Titulaire du compte</dt><dd>{d.compte.titulaire}</dd></div>{/if}
        </dl>
        {#if d.compte && !coherent}<p class="err" role="alert">Le titulaire du compte ne correspond pas au nom du bailleur : corrigez l'un des deux.</p>{/if}
      </Carte>
    {/if}

    <div class="info"><Icone nom="verrou" taille={18} /><span>L'argent ne passe jamais par votre compte : AssureMe verse directement au bailleur, après son accord dans l'app ou par SMS.</span></div>
  {/if}
  {#snippet pied()}
    {#if !bloque && !enAttente}
      {#if manque.length}<p class="manque" role="status">Il manque : {manque.join(', ')}.</p>{/if}
      <Bouton desactive={manque.length > 0 || !!erreurEntree} onclick={() => aller('/logement/bailleur')}>Envoyer au bailleur pour accord <Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {/if}
  {/snippet}
</Ecran>

{#if !bloque && !enAttente}
  <FeuillePiece bind:ouverte={fBail} cle="bail" />
  <FeuillePiece bind:ouverte={fCni} cle="cni" />
  <FeuillePiece bind:ouverte={fPhotos} cle="photos" />
  <FeuilleCompte bind:ouverte={fCompte} />
{/if}

<style>
  h2 { font-size: 16px; font-weight: 650; margin-bottom: 12px; } .champs { display: flex; flex-direction: column; gap: 12px; }
  .tuiles { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tuiles button { width: 100%; height: 100%; min-height: 116px; padding: 14px; border-radius: 18px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; text-align: left; position: relative; background: var(--primaire-fond); border: 1px dashed var(--primaire); }
  .tuiles button.fait { background: var(--carte); border: 1px solid rgba(61, 213, 152, 0.35); }
  .ico { color: var(--pale); } .fait .ico { color: var(--muted); }
  .txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; width: 100%; } .txt b { font-size: 14.5px; } .txt small { font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; }
  .coche { position: absolute; top: 12px; right: 12px; width: 22px; height: 22px; border-radius: 11px; border: 2px solid var(--primaire); display: grid; place-items: center; font-size: 12px; color: #fff; } .fait .coche { background: var(--bon); border-color: var(--bon); color: #07090f; }
  .tete { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } dl div:last-child { border: 0; } dt { color: var(--muted); } dd { text-align: right; }
  .err { color: var(--danger); font-size: 13px; margin-top: 8px; }
  .info { display: flex; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); color: var(--doux); font-size: 13.5px; line-height: 1.4; } .info :global(svg) { flex: none; margin-top: 1px; }
  .manque { font-size: 13px; color: var(--alerte); margin-bottom: 8px; text-align: center; }
</style>
