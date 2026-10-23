<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { noteFr } from '../../core/bulletin.ts';
  import { mentionNote } from '../../core/ecole.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Icone from '../../ui/Icone.svelte';
  import NonTrouve from '../_socle/NonTrouve.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Puces from './Puces.svelte';
  import { bulletinDe, bulletinEnvoye, enfantParId, envoyerMessage, nomEcole, reserverSoutien, soutienDe } from './actions.ts';
  import { CRENEAUX_SOUTIEN, PRIX_SOUTIEN, TRIMESTRE } from './etat.ts';

  let { params }: { params: Record<string, string> } = $props();
  const enfant = $derived(enfantParId(params.enfant));
  const b = $derived(enfant ? bulletinDe(enfant) : null);
  const s = $derived(b?.synthese);
  const faibles = $derived((s?.matieres ?? []).filter((m) => m.moyenne < m.moyenneClasse).sort((x, y) => x.moyenne - x.moyenneClasse - (y.moyenne - y.moyenneClasse)));
  const soutien = $derived(enfant ? soutienDe(enfant.id) : undefined);
  const cibleSoutien = $derived(faibles[0]?.matiere);
  let ouvert = $state(''); let creneau = $state(CRENEAUX_SOUTIEN[0]); let erreur = $state('');
  let feuille = $state<'' | 'soutien' | 'message'>('');
  const sheetOuverte = {
    get v() { return feuille !== ''; }, set v(x: boolean) { if (!x) feuille = ''; }
  };
  let message = $state('');
  function reserver() {
    if (!enfant) return;
    const r = reserverSoutien(enfant.id, creneau);
    if (!r.ok) { erreur = r.erreur; return; }
    erreur = ''; feuille = ''; montrer(`Séance réservée · ${creneau.split(' · ').slice(0, 2).join(' ')}`);
  }
  function ecrire() {
    if (!enfant) return;
    const r = envoyerMessage(enfant.id, message);
    if (!r.ok) { erreur = r.erreur; return; }
    erreur = ''; message = ''; feuille = ''; montrer(`Message envoyé à ${nomEcole(enfant.ecoleId)}`);
  }
</script>

{#if !enfant}
  <NonTrouve />
{:else}
  <Ecran titre={`${enfant.prenom} · ${b?.classe ?? enfant.classeActuelle ?? enfant.niveau}`} sur={`${TRIMESTRE.toUpperCase()} · EN DIRECT DE L’ÉCOLE`} retourVers="/ecole">
    {#if !s || !s.matieres.length}
      <Carte>
        <div class="vide"><Icone nom="document" taille={30} /><h2>Pas encore de notes</h2>
          <p class="muted">{nomEcole(enfant.ecoleId)} n’a pas encore publié de notes pour {enfant.prenom}. Elles apparaîtront ici dès leur publication.</p></div>
      </Carte>
    {:else}
      <div class="stats">
        <div><b class="mono">{s.moyenne === null ? '–' : noteFr(s.moyenne)}</b><span>Moyenne</span><small>{mentionNote(s.moyenne ?? 0)}</small></div>
        <div><b class="mono">{s.rang ?? '–'}<em>/{s.effectif}</em></b><span>Rang</span><small>dans la classe</small></div>
        <div><b class="mono">{enfant.absences}</b><span>{enfant.absences > 1 ? 'Absences' : 'Absence'}</span><small>{enfant.retards ? `${enfant.retards} retard` : enfant.aJustifier ? `${enfant.aJustifier} à justifier` : 'à jour'}</small></div>
      </div>

      <section aria-label="Par matière">
        <div class="titre"><h3>Par matière</h3><small class="mono">SUR 20 · CLASSE EN GRIS</small></div>
        <ul>
          {#each s.matieres as m (m.matiere)}
            {@const bas = m.moyenne < m.moyenneClasse}
            <li>
              <button aria-expanded={ouvert === m.matiere} onclick={() => (ouvert = ouvert === m.matiere ? '' : m.matiere)}>
                <span class="nom">{m.matiere}</span><b class="mono" class:bas>{noteFr(m.moyenne)}</b>
                <span class="barre"><Jauge pct={(m.moyenne / 20) * 100} couleur={bas ? 'var(--alerte)' : 'var(--primaire)'} trait={(m.moyenneClasse / 20) * 100} /></span>
              </button>
              {#if ouvert === m.matiere}
                <p class="detail">{m.details.map((d) => `${d.intitule.split(' · ')[0]} : ${noteFr(d.note)}`).join(' · ')}. Moyenne de classe {noteFr(m.moyenneClasse)}.{bas ? ' Sous la moyenne de classe : le soutien est conseillé.' : ''}</p>
              {/if}
            </li>
          {/each}
        </ul>
      </section>

      <Carte>
        <p class="muted">Appréciation de l’école</p>
        <p><b>{mentionNote(s.moyenne ?? 0)}.</b> {faibles.length ? `Un coup de main en ${faibles[0].matiere.toLowerCase()} suffirait pour progresser.` : 'Toutes les matières sont au niveau de la classe ou au-dessus.'}</p>
        {#if bulletinEnvoye(enfant.ecoleId, enfant.eleve)}<p class="muted pt">Bulletin envoyé par l’école.</p>{/if}
      </Carte>

      {#if cibleSoutien}
        <button class="soutien" onclick={() => { feuille = 'soutien'; erreur = ''; }}>
          <span><b>{soutien ? `Soutien réservé · ${soutien.creneau.split(' · ').slice(0, 2).join(' ')}` : `Soutien ${cibleSoutien.toLowerCase()}, 4 séances`}</b><small>{soutien ? 'Touchez pour changer le créneau' : `Prof partenaire · ${fcfa(PRIX_SOUTIEN)} FCFA depuis le solde`}</small></span>
          <Icone nom="suivant" taille={18} />
        </button>
      {/if}
    {/if}
    <div class="actions">
      <Bouton variante="secondaire" onclick={() => { feuille = 'message'; erreur = ''; }}>Écrire à l’école</Bouton>
      <Bouton variante="secondaire" onclick={() => window.print()} desactive={!s?.matieres.length}>Bulletin PDF</Bouton>
    </div>
  </Ecran>

  <Feuille bind:ouverte={sheetOuverte.v} titre={feuille === 'soutien' ? `Soutien ${cibleSoutien?.toLowerCase() ?? ''}` : `Écrire à ${nomEcole(enfant.ecoleId)}`} sous={feuille === 'soutien' ? '4 séances' : 'Réponse sous 24 h'}>
    {#if feuille === 'soutien'}
      <p class="muted">4 séances avec un prof partenaire · {fcfa(PRIX_SOUTIEN)} FCFA, payés depuis votre solde.{soutien ? ' Déjà réservé : changer de créneau est gratuit.' : ''}</p>
      <Puces etiquette="Créneau" bind:valeur={creneau} options={CRENEAUX_SOUTIEN.map((c) => ({ valeur: c, label: c.split(' · ').slice(0, 2).join(' · '), sous: c.split(' · ')[2] }))} />
      {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
      <Bouton onclick={reserver}>{soutien ? 'Changer le créneau' : 'Réserver les 4 séances'}</Bouton>
    {:else}
      <Puces etiquette="Messages rapides" bind:valeur={message} options={['Absence demain', 'Demander un rendez-vous', 'Question sur les devoirs'].map((q) => ({ valeur: q, label: q }))} />
      <textarea aria-label="Votre message" placeholder="Votre message" rows="3" maxlength="500" bind:value={message}></textarea>
      {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
      <Bouton onclick={ecrire}>Envoyer</Bouton>
    {/if}
  </Feuille>
{/if}

<style>
  .vide { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; } .vide h2 { font-size: 18px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; } .stats div { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .stats b { font-size: 24px; font-weight: 600; } .stats em { font-size: 13px; color: var(--muted); font-style: normal; } .stats span { font-size: 12.5px; color: var(--doux); } .stats small { color: var(--muted); font-size: 11.5px; text-align: center; }
  .titre { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; } h3 { font-size: 15px; } small.mono, .titre small { font: 500 10px var(--mono); color: var(--muted); letter-spacing: 0.08em; }
  ul { list-style: none; background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 4px 14px; } li { border-bottom: 1px solid var(--ligne); } li:last-child { border: 0; }
  li button { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: center; min-height: 56px; padding: 10px 0; text-align: left; } .nom { font-weight: 550; } li b { font-size: 16px; } li b.bas { color: var(--alerte); } .barre { grid-column: 1 / -1; padding-bottom: 4px; }
  .detail { font-size: 13px; color: var(--muted); padding-bottom: 10px; } .pt { margin-top: 8px; font-size: 13px; }
  .soutien { display: flex; justify-content: space-between; align-items: center; gap: 12px; text-align: left; min-height: 64px; padding: 12px 16px; border-radius: 18px; background: var(--primaire-fond); border: 1px solid var(--primaire); } .soutien span { display: flex; flex-direction: column; } .soutien small { color: var(--muted); font-size: 12.5px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } textarea { min-height: 88px; padding: 12px 14px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-size: 16px; outline: none; resize: vertical; } textarea:focus { border-color: var(--primaire); }
  .err { color: var(--danger); font-size: 13px; }
  @media print { .actions { display: none; } }
</style>
