<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Voiture from './Voiture.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { autoDisponible, plafondAuto } from '../../core/auto.ts';
  import { SEUILS_NIVEAU, PLAFONDS } from '../../core/credit.ts';
  import { fcfa } from '../../core/money.ts';
  import { auto, monDossier, vehiculeDe } from './etat.ts';
  import { niveauMembre, simulerBrouillon } from './actions.ts';

  const t = auto();
  const niveau = $derived(niveauMembre());
  const ouvert = $derived(autoDisponible(niveau));
  const manque = $derived(Math.max(0, SEUILS_NIVEAU.PRO - app.score.valeur));
  const dossier = $derived(monDossier());
  const brouillon = $derived(t.brouillon);
  const vehicule = $derived(vehiculeDe(dossier?.vehiculeId ?? brouillon?.vehiculeId));
  const simBrouillon = $derived(simulerBrouillon());

  const cible = $derived.by(() => {
    const d = dossier;
    if (!d || d.etape === 'annulee') return { vers: '/auto/simulation', badge: 'DÉCISION EN 2 MIN', ton: 'primaire' as const, texte: 'Simuler ma mensualité' };
    if (d.etape === 'refusee') return { vers: '/auto/decision', badge: 'REFUSÉ', ton: 'danger' as const, texte: d.motifRefus ?? 'Dossier non retenu' };
    if (d.etape === 'livree') return { vers: '/auto/livraison', badge: 'LIVRÉ', ton: 'bon' as const, texte: 'Clés remises' };
    if (d.signeLe) return { vers: '/auto/livraison', badge: 'LIVRAISON EN COURS', ton: 'bon' as const, texte: 'Suivre ma livraison' };
    return { vers: '/auto/decision', badge: 'APPROUVÉ · À SIGNER', ton: 'bon' as const, texte: "Voir l'offre et signer" };
  });
  const mensualite = $derived(dossier && dossier.etape !== 'annulee' ? dossier.mensualite : simBrouillon?.mensualite ?? 0);
  const duree = $derived(dossier && dossier.etape !== 'annulee' ? dossier.duree : brouillon?.duree ?? 36);
  const prix = $derived(dossier && dossier.etape !== 'annulee' ? dossier.prix : vehicule?.prix ?? 0);

  type Info = { titre: string; texte: string; lignes: [string, string][]; cta: string; toast: string };
  const infos: Record<string, Info> = {
    louer: { titre: 'Louer pour travailler', texte: "Taxi, VTC ou moto-taxi : vous louez à la semaine, chaque versement vous rapproche de la propriété du véhicule.", lignes: [['Versement', '25 000 / semaine'], ['Durée', '36 mois'], ['Devient à vous', 'après 156 versements']], cta: 'Demander une location', toast: 'Demande envoyée, réponse en 2 min' },
    assurer: { titre: 'Assurer mon véhicule', texte: "Assurance tous risques d'un assureur agréé, incluse dans la mensualité d'un véhicule financé.", lignes: [['Formule', 'Tous risques'], ['Prix', '18 000 / mois'], ['Franchise', '50 000']], cta: 'Recevoir un devis', toast: 'Devis envoyé par SMS' },
    entretien: { titre: 'Entretenir', texte: "Vidange, freins, pneus chez un garage partenaire. Vous payez par mois, sur salaire, sans intérêt jusqu'à 3 mois.", lignes: [['Vidange complète', '35 000'], ['Plaquettes de frein', '48 000'], ['Pneus (×4)', '120 000']], cta: 'Prendre rendez-vous', toast: 'Rendez-vous demandé : samedi 10 h' },
    gps: { titre: 'Traceur GPS', texte: "Posé à la livraison. Il protège le véhicule et abaisse l'assurance de 12 %. Votre position n'est visible que si le véhicule est déclaré volé.", lignes: [['État', 'Actif dès la livraison'], ['Rabais assurance', '−12 %']], cta: 'Compris', toast: '' }
  };
  let feuille = $state(false);
  let cle = $state('louer');
  const info = $derived(infos[cle]);
  const ouvrir = (k: string) => { cle = k; feuille = true; };
  const confirmer = () => { feuille = false; if (info.toast) montrer(info.toast); };
</script>

<Ecran titre="Mobilité" retourVers="/">
  <section class="hero">
    {#if ouvert}<Pastille ton="bon">Débloqué · niveau {niveau === 'PRO' ? 'Pro' : niveau === 'ELITE' ? 'Elite' : niveau}</Pastille>
    {:else}<Pastille ton="alerte">Niveau Pro requis</Pastille>{/if}
    {#if ouvert}
      <p>Jusqu'à <b class="mono">{fcfa(plafondAuto(niveau))} FCFA</b> pour un véhicule, remboursé sur salaire.</p>
      <p class="muted">Assurance et entretien inclus dans la mensualité.</p>
    {:else}
      <p>Le crédit auto s'ouvre au niveau Pro : jusqu'à <b class="mono">{fcfa(PLAFONDS.PRO.auto)} FCFA</b>, remboursé sur salaire.</p>
      <div class="manque">
        <span>AssureScore <b class="mono">{app.score.valeur}</b> · seuil Pro <b class="mono">{SEUILS_NIVEAU.PRO}</b></span>
        <Jauge pct={(app.score.valeur / SEUILS_NIVEAU.PRO) * 100} couleur="var(--alerte)" />
        <small class="muted">Il vous manque {manque} point{manque > 1 ? 's' : ''}. Payer à l'heure vous y amène.</small>
      </div>
      <Bouton variante="secondaire" href="/score" plein={false}>Voir mon score</Bouton>
    {/if}
  </section>

  {#if ouvert}
    <Carte accent="#3050ff" href={cible.vers}>
      <div class="entete"><small class="mono etiquette">{vehicule && dossier?.etape !== 'annulee' ? 'Véhicule en cours' : 'Mon projet'}</small><Pastille ton={cible.ton}>{cible.badge}</Pastille></div>
      {#if vehicule || dossier}
        <div class="vue">{#if vehicule}<Voiture type={vehicule.type} couleur={vehicule.couleur} titre={vehicule.titre} />{/if}</div>
        <b class="nom">{dossier?.vehiculeTitre ?? vehicule?.titre}</b>
        <small class="muted">{vehicule?.meta ?? ''}</small>
        <div class="chiffres">
          <div><span class="mono">{fcfa(prix)}</span><small>FCFA</small></div>
          {#if mensualite}<div class="droite"><small>Mensualité estimée · {duree} mois</small><span class="mono">{fcfa(mensualite)}</span></div>{/if}
        </div>
        <small class="etat">{cible.texte}</small>
      {:else}
        <b class="nom">Aucun véhicule pour l'instant</b>
        <small class="muted">Choisissez une voiture ou une moto dans le catalogue, puis simulez votre mensualité en 2 minutes.</small>
      {/if}
    </Carte>
  {/if}

  <div class="grille">
    <button class="tuile" onclick={() => aller('/auto/catalogue')} disabled={!ouvert}><Icone nom="auto" taille={22} /><b>Acheter</b><small>Voiture ou moto, neuve ou certifiée</small></button>
    <button class="tuile" onclick={() => ouvrir('louer')}><Icone nom="calendrier" taille={22} /><b>Louer</b><small>Taxi, VTC : à la semaine, puis à vous</small></button>
    <button class="tuile" onclick={() => ouvrir('assurer')}><Icone nom="protection" taille={22} /><b>Assurer</b><small>Tous risques, dans la mensualité</small></button>
    <button class="tuile" onclick={() => ouvrir('entretien')}><Icone nom="parametres" taille={22} /><b>Entretenir</b><small>Garages partenaires, payés par mois</small></button>
  </div>
  <button class="gps" onclick={() => ouvrir('gps')}><Icone nom="info" /><span>Traceur GPS actif sur les véhicules financés</span><Pastille>Sécurité</Pastille></button>
</Ecran>

<Feuille bind:ouverte={feuille} titre={info.titre}>
  <p class="muted">{info.texte}</p>
  <dl>{#each info.lignes as [l, v]}<div><dt>{l}</dt><dd class="mono">{v}</dd></div>{/each}</dl>
  <div class="actions"><Bouton variante="secondaire" onclick={() => (feuille = false)}>Fermer</Bouton><Bouton onclick={confirmer}>{info.cta}</Bouton></div>
</Feuille>

<style>
  .hero { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; padding: 4px 2px 6px; } .hero p { font-size: 16px; line-height: 1.4; }
  .manque { width: 100%; display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); }
  .entete { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .etiquette { letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-size: 10.5px; }
  .vue { width: 70%; margin: 0 auto 6px; } .nom { display: block; font-size: 18px; } small { color: var(--muted); font-size: 12.5px; }
  .chiffres { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; } .chiffres span { font-size: 22px; font-weight: 600; } .chiffres small { margin-left: 4px; } .droite { text-align: right; display: flex; flex-direction: column; } .droite span { font-size: 20px; }
  .etat { display: block; margin-top: 10px; color: var(--pale); font-weight: 550; }
  .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tuile { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; min-height: 112px; padding: 14px; border-radius: 20px; background: var(--carte); border: 1px solid var(--ligne); }
  .tuile b { margin-top: 6px; font-size: 16px; } .tuile:disabled { opacity: 0.45; } .tuile :global(svg) { color: var(--primaire-clair); }
  .gps { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 10px 14px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); text-align: left; font-size: 13.5px; } .gps span { flex: 1; }
  dl { display: flex; flex-direction: column; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--ligne); } dt { color: var(--muted); } dd { font-weight: 550; text-align: right; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
</style>
