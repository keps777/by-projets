<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Ligne from '../../ui/Ligne.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ajouterMois, jourCourt, jourDe, jourLong, moisAnnee } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { pointsPourNiveau } from '../../core/score.ts';
  import { fenetreMois, limitesAvance, loyersALHeure, statutMois, type StatutMois } from '../../core/avance-loyer.ts';
  import { avanceEnCours, blocage, manques } from './actions.ts';
  import { logement, niveauActuel } from './etat.ts';
  import Verrou from './Verrou.svelte';
  import FeuilleEquipement from './FeuilleEquipement.svelte';

  const l = logement();
  const bloque = $derived(blocage());
  const lim = $derived(limitesAvance(niveauActuel()));
  const b = $derived(l.bail);
  const credit = $derived(b?.avanceId ? app.credits.find((c) => c.id === b.avanceId) : undefined);
  const aujourdhui = $derived(jourDe(new Date(maintenant())));
  const cles = $derived(b ? fenetreMois(b.debut, aujourdhui) : []);
  const statuts = $derived(cles.map((c) => statutMois(c, aujourdhui, b?.loyers ?? [])));
  let choisi = $state<string | null>(null);
  const courant = $derived(choisi && cles.includes(choisi) ? choisi : (cles[statuts.findIndex((s) => s === 'prevu')] ?? cles[cles.length - 1]));
  const statutCourant = $derived(statuts[cles.indexOf(courant)] as StatutMois | undefined);
  const aLHeure = $derived(b ? loyersALHeure(b.loyers) : 0);
  const court = (cle: string) => jourCourt(`${cle}-01`).split(' ')[1];
  const texteStatut: Record<StatutMois, string> = { paye: 'payé · +6 pts', garanti: 'garanti par AssureMe · à régulariser', prevu: 'prévu le 1er', avenir: 'à venir', passe: 'avant votre suivi' };
  const couleurStatut: Record<StatutMois, string> = { paye: 'var(--bon)', garanti: 'var(--alerte)', prevu: 'var(--primaire-clair)', avenir: 'var(--muted)', passe: 'var(--muted)' };

  const enCours = $derived(avanceEnCours());
  const dossierManques = $derived(manques(l.dossier));
  const reste = $derived(credit ? (credit.duree - credit.payees) * credit.mensualite : 0);
  /** Dates des mensualités, en supposant la cadence mensuelle depuis le premier prélèvement. */
  const echeances = $derived.by(() => {
    if (!credit || !app.compte) return [];
    const premiere = ajouterMois(credit.prochaine, -credit.payees, app.compte.jourPaie);
    return Array.from({ length: credit.duree }, (_, i) => ({ n: i + 1, date: ajouterMois(premiere, i, app.compte!.jourPaie), faite: i < credit.payees }));
  });
  const preuve = $derived(credit ? l.preuves.find((p) => p.creditId === credit.id) : undefined);

  let feuilleBail = $state(false), feuilleTerrain = $state(false), feuilleBuild = $state(false), feuilleRemb = $state(false), feuilleEquip = $state(false);
  const manquePoints = $derived(pointsPourNiveau(app.score.valeur, 'ELITE'));
  const pctProjet = $derived(l.projet ? Math.round((l.projet.epargne / l.projet.objectif) * 100) : 0);
</script>

<Ecran titre="Logement" retourVers="/">
  {#if bloque && !b}
    <Verrou />
  {:else}
    {#if b}
      <Carte>
        <div class="tete">
          <div class="id">
            <span class="mono sur">{b.prelevement ? 'LOYER PRÉLEVÉ ET GARANTI' : 'LOYER GARANTI'}</span>
            <h2>{b.libelle}</h2>
            <p class="muted">Bailleur : {b.bailleur} · bail jusqu'en {b.finBail.slice(0, 4)}</p>
          </div>
          <button class="etat" class:alerte={b.arrieres > 0} onclick={() => (feuilleBail = true)} aria-label="Détail du bail : {b.arrieres ? 'en régularisation' : 'à jour'}">{b.arrieres ? 'À RÉGULARISER' : 'À JOUR'}</button>
        </div>
        <p class="montant"><span class="mono">{fcfa(b.loyer)}</span> <span class="muted">FCFA chaque 1er du mois, versés par AssureMe</span></p>
        <div class="mois" role="group" aria-label="Loyers sur 12 mois">
          {#each cles as c, i (c)}
            <button class="m {statuts[i]}" class:sel={c === courant} aria-pressed={c === courant} aria-label="{moisAnnee(`${c}-01`)} : {texteStatut[statuts[i]]}" onclick={() => (choisi = c)}>
              <span>{court(c)}</span><i aria-hidden="true">{statuts[i] === 'paye' ? '✓' : statuts[i] === 'garanti' ? '!' : ''}</i>
            </button>
          {/each}
        </div>
        {#if statutCourant}
          <div class="detail" aria-live="polite"><span>{moisAnnee(`${courant}-01`)}</span><span class="mono" style:color={couleurStatut[statutCourant]}>{statutCourant === 'avenir' || statutCourant === 'passe' ? '' : `${fcfa(b.loyer)} `}{texteStatut[statutCourant]}</span></div>
        {/if}
        <p class="mono bas"><span>{aLHeure} LOYER{aLHeure > 1 ? 'S' : ''} PAYÉ{aLHeure > 1 ? 'S' : ''} À L'HEURE</span><span>+6 PTS DE SCORE CHACUN</span></p>
      </Carte>
    {/if}

    {#if credit}
      <Carte accent={credit.statut === 'actif' ? 'var(--primaire)' : ''}>
        <div class="tete">
          <div class="id"><span class="mono sur">AVANCE DE LOYER</span><h3>{credit.statut === 'actif' ? 'Remboursement en cours' : 'Avance remboursée'}</h3></div>
          <Pastille ton={credit.statut === 'actif' ? 'primaire' : 'bon'}>{credit.payees} / {credit.duree}</Pastille>
        </div>
        <Jauge pct={(credit.payees / credit.duree) * 100} couleur={credit.statut === 'actif' ? 'var(--primaire-clair)' : 'var(--bon)'} />
        <dl>
          <div><dt>Avance versée</dt><dd class="mono">{fcfa(credit.capital)}</dd></div>
          {#if credit.statut === 'actif'}
            <div><dt>Remboursement</dt><dd class="mono">{fcfa(credit.mensualite)} / mois</dd></div>
            <div><dt>Prélèvement logement</dt><dd class="mono">{fcfa(credit.mensualite + b!.loyer)} / mois</dd></div>
            <div><dt>Reste à rembourser</dt><dd class="mono">{fcfa(reste)}</dd></div>
            <div><dt>Prochain prélèvement</dt><dd class="mono">{jourLong(credit.prochaine)}</dd></div>
          {/if}
        </dl>
        <div class="actions">
          <Bouton variante="secondaire" plein={false} onclick={() => (feuilleRemb = true)}>Voir les remboursements</Bouton>
          {#if preuve}<Bouton variante="discret" plein={false} href="/logement/bailleur?recu={preuve.id}">Preuve de paiement</Bouton>{/if}
        </div>
      </Carte>
    {/if}

    {#if b?.avanceId && !b.equipement}
      <Carte onclick={() => (feuilleEquip = true)}>
        <div class="rang"><div><b>Équiper le logement</b><small class="muted">Frigo, matelas, kit solaire : payés par mois au magasin partenaire</small></div><Icone nom="suivant" /></div>
      </Carte>
    {:else if b?.equipement}
      <Carte><div class="rang"><div><b>Équipement commandé · {b.equipement.ids.length} article{b.equipement.ids.length > 1 ? 's' : ''}</b><small class="muted">Livraison le {jourLong(b.equipement.livraison)} au logement</small></div><Icone nom="ok" /></div></Carte>
    {/if}

    {#if l.dossier}
      <Carte accent="var(--primaire)">
        <b>Dossier d'avance en cours</b>
        <p class="muted" style="margin: 6px 0 12px">{l.dossier.statut === 'accord_attendu' ? "En attente de l'accord du bailleur." : dossierManques.length ? `Il manque ${dossierManques[0]}${dossierManques.length > 1 ? ` et ${dossierManques.length - 1} autre${dossierManques.length > 2 ? 's' : ''} élément${dossierManques.length > 2 ? 's' : ''}` : ''}.` : 'Dossier complet, prêt pour la décision.'}</p>
        <Bouton href={l.dossier.statut === 'accord_attendu' || !dossierManques.length ? '/logement/bailleur' : '/logement/justificatifs'}>Reprendre mon dossier</Bouton>
      </Carte>
    {:else if !bloque}
      <a class="demenage" href="/logement/avance" onclick={(e) => { e.preventDefault(); aller('/logement/avance'); }}>
        <div><b>Vous déménagez ?</b><p>AssureMe avance jusqu'à {lim.moisMax} mois de loyer au bailleur. Vous remboursez sur 10 mois.</p></div>
        <span class="go"><Icone nom="fleche" taille={18} trait={2.2} /></span>
      </a>
    {:else if bloque && b}
      <Carte><div class="rang"><div><b>{bloque}</b><small class="muted">{app.compte && !credit ? 'Gagnez des points sur la page score pour débloquer l’avance.' : 'Elle se libère une fois remboursée.'}</small></div></div></Carte>
    {/if}

    <section aria-labelledby="pm">
      <h3 id="pm" class="titre">Projet maison</h3>
      <div class="liste">
        <a href="/coffres" class="item" onclick={(e) => { e.preventDefault(); aller('/coffres'); }}>
          <span class="n">1</span>
          <div class="t"><b>Coffre terrain</b><small class="muted">{l.projet ? `${fcfa(l.projet.epargne)} / ${fcfa(l.projet.objectif)} · ${fcfa(l.projet.mensuel)} par mois` : 'Épargnez pour votre terrain, un peu chaque mois'}</small></div>
          {#if l.projet}<span class="mono pct">{pctProjet} %</span>{:else}<Icone nom="suivant" />{/if}
        </a>
        <button class="item" onclick={() => (feuilleTerrain = true)}><span class="n">2</span><div class="t"><b>Terrain vérifié, titre contrôlé</b><small class="muted">Géomètre et notaire partenaires</small></div><Icone nom="suivant" /></button>
        <button class="item" onclick={() => (feuilleBuild = true)}><span class="n">3</span><div class="t"><b>Construction par étapes</b><small class="muted">Matériaux payés à la quincaillerie · niveau Elite</small></div><Icone nom="suivant" /></button>
      </div>
    </section>
  {/if}
  <div class="espace" aria-hidden="true"></div>
</Ecran>

{#if b}
  <Feuille bind:ouverte={feuilleBail} titre="Bail {b.libelle}">
    <p class="muted">Votre loyer est garanti au bailleur chaque 1er du mois, même si votre salaire a un jour de retard.</p>
    <div>
      <Ligne titre="Bailleur" valeur={b.bailleur} />
      <Ligne titre="Loyer" valeur="{fcfa(b.loyer)} / mois" />
      <Ligne titre="Entrée dans les lieux" valeur={jourLong(b.entree)} />
      <Ligne titre="Fin du bail" valeur={moisAnnee(b.finBail)} />
      <Ligne titre="Assurance habitation" valeur="{fcfa(b.assurance)} / mois" />
      <Ligne titre="Compte du bailleur" valeur={b.compteLibelle} />
    </div>
    <Bouton variante="secondaire" onclick={() => { feuilleBail = false; montrer('Bail PDF enregistré'); }}>Télécharger le bail</Bouton>
    <Bouton variante="discret" onclick={() => (feuilleBail = false)}>Fermer</Bouton>
  </Feuille>
{/if}

<Feuille bind:ouverte={feuilleTerrain} titre="Terrain vérifié">
  <p class="muted">Un géomètre et un notaire partenaires contrôlent le titre foncier avant tout paiement au vendeur. Vous ne payez jamais un terrain litigieux.</p>
  <div><Ligne titre="Vérification du titre" valeur="7 jours" /><Ligne titre="Honoraires notaire" valeur="inclus" /><Ligne titre="Disponible" valeur="à 30 % du coffre" /></div>
  <Bouton onclick={() => { feuilleTerrain = false; montrer('Vous serez prévenu à 30 % du coffre'); }}>Être prévenu</Bouton>
  <Bouton variante="discret" onclick={() => (feuilleTerrain = false)}>Fermer</Bouton>
</Feuille>

<Feuille bind:ouverte={feuilleBuild} titre="Construction par étapes">
  <p class="muted">Les matériaux sont payés directement à la quincaillerie, étape par étape. Disponible au niveau Elite, dès 800 points.</p>
  <div><Ligne titre="Votre score" valeur="{app.score.valeur} / 800" /><Ligne titre="Points manquants" valeur={String(manquePoints)} /></div>
  {#if manquePoints > 0}<Bouton onclick={() => { feuilleBuild = false; aller('/score'); }}>Gagner {manquePoints} points</Bouton>{/if}
  <Bouton variante="discret" onclick={() => (feuilleBuild = false)}>Fermer</Bouton>
</Feuille>

{#if credit}
  <Feuille bind:ouverte={feuilleRemb} titre="Remboursements" sous="{credit.payees} / {credit.duree}">
    <div class="remb">
      {#each echeances as e (e.n)}
        <Ligne titre="Mensualité {e.n} / {credit.duree}" sous={jourLong(e.date)} valeur={e.faite ? `${fcfa(credit.mensualite)} ✓` : fcfa(credit.mensualite)} ton={e.faite ? 'bon' : ''} />
      {/each}
    </div>
    <p class="muted petit">Un mois difficile ? Le prélèvement peut être reporté sans frais ni pénalité, le loyer reste garanti au bailleur.</p>
    <Bouton variante="discret" onclick={() => (feuilleRemb = false)}>Fermer</Bouton>
  </Feuille>
{/if}
<FeuilleEquipement bind:ouverte={feuilleEquip} />

<style>
  .tete { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; } .id { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .sur { font-size: 11px; letter-spacing: 0.12em; color: var(--primaire-clair); } h2 { font-size: 20px; font-weight: 650; letter-spacing: -0.02em; } h3 { font-size: 16px; font-weight: 650; letter-spacing: -0.02em; } .id p { font-size: 13px; }
  .etat { min-height: 44px; min-width: 44px; padding: 0 10px; border: 1px solid rgba(61, 213, 152, 0.4); border-radius: 10px; color: var(--bon); font: 500 10px var(--mono); letter-spacing: 0.08em; flex: none; }
  .etat.alerte { border-color: rgba(255, 122, 47, 0.5); color: var(--alerte); }
  .montant { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 12px 0; font-size: 13px; } .montant .mono { font-size: 32px; font-weight: 500; letter-spacing: -0.03em; color: var(--texte); }
  .mois { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  .m { min-height: 44px; border-radius: 10px; background: var(--carte2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font: 500 11px var(--mono); color: var(--muted); border: 1px solid transparent; }
  .m i { font-style: normal; font-size: 11px; height: 11px; line-height: 11px; }
  .m.paye { background: var(--primaire); color: #fff; } .m.garanti { background: rgba(255, 122, 47, 0.2); color: var(--alerte); border-color: rgba(255, 122, 47, 0.5); }
  .m.prevu { border: 1px dashed var(--primaire); color: var(--pale); } .m.sel { box-shadow: 0 0 0 2px var(--fond), 0 0 0 4px var(--texte); }
  .detail { margin-top: 10px; background: var(--carte2); border-radius: 12px; padding: 10px 12px; display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--doux); }
  .bas { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 10px; margin-top: 12px; font-size: 10px; letter-spacing: 0.04em; color: var(--muted); }
  dl { margin: 12px 0 4px; } dl div { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } dl div:last-child { border: 0; } dt { color: var(--muted); } dd { text-align: right; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 10px; } .rang > div { display: flex; flex-direction: column; gap: 3px; } small { font-size: 12.5px; }
  .demenage { display: flex; align-items: center; gap: 14px; border-radius: 22px; padding: 18px; background: linear-gradient(135deg, rgba(48, 80, 255, 0.5), rgba(48, 80, 255, 0) 60%), #0f1733; border: 1px solid rgba(124, 147, 255, 0.35); min-height: 44px; }
  .demenage > div { flex: 1; } .demenage b { font-size: 16px; } .demenage p { font-size: 13px; color: #c9d2ff; margin-top: 4px; }
  .go { width: 44px; height: 44px; border-radius: 14px; background: #fff; color: #0b0f1a; display: grid; place-items: center; flex: none; }
  .titre { margin-bottom: 10px; } .liste { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; }
  .item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; width: 100%; min-height: 56px; text-align: left; border-bottom: 1px solid var(--ligne); } .item:last-child { border: 0; }
  .n { width: 26px; height: 26px; border-radius: 13px; background: var(--primaire-fond); color: var(--pale); display: grid; place-items: center; font: 500 12px var(--mono); flex: none; }
  .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .t b { font-size: 14.5px; } .pct { font-size: 13px; color: var(--bon); }
  .espace { height: 64px; flex: none; }
  .remb { max-height: 46dvh; overflow-y: auto; } .petit { font-size: 12.5px; }
</style>
