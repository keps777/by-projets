<script lang="ts">
  import { SEUIL_RETARD_MIN } from '../../core/analyses.ts';
  import { TOLERANCE } from '../../core/caisse.ts';
  import { SUPPLEMENT_ASSURANCE, SUPPLEMENT_MOTO, TAILLES } from '../../core/colis.ts';
  import { quand } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { DELAI_ANNULATION_MIN, REDUCTION_ETUDIANT, TAUX_FRAIS_ANNULATION } from '../../core/tarif.ts';
  import { gesteRetard } from '../../core/retard.ts';
  import { LIMITE_VITESSE } from '../../core/telemetrie.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { NOM_ROLE, ROLES_EQUIPE, ROLES_PARTENAIRES, ROLES_SIEGE } from '../../domain/acces.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import type { Ligne } from '../../domain/types.ts';
  import { param } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { basculerParametre, derniereAction, type GroupeParam } from './actions.ts';
  import Defile from './Defile.svelte';
  import { gareParId, nomGare } from './format.ts';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  type Onglet = 'lignes' | 'tarifs' | 'equipe' | 'regles';
  const ONGLETS: [Onglet, string][] = [['lignes', 'Lignes'], ['tarifs', 'Tarifs'], ['equipe', 'Équipe'], ['regles', 'Règles']];
  const moi = personneCourante();
  const demande = param('onglet') as Onglet | null;
  let onglet = $state<Onglet>(ONGLETS.some(([o]) => o === demande) ? (demande as Onglet) : 'lignes');
  let compagnie = $state(moi?.compagnieId ?? 'BX'), groupe = $state<'equipe' | 'siege' | 'partenaires' | 'tous'>('tous'), inactifs = $state(true);

  interface Liaison { cle: string; lignes: Ligne[] }
  const liaisons = $derived.by(() => {
    const m = new Map<string, Liaison>();
    for (const l of app.monde.lignes) { if (compagnie !== 'toutes' && l.compagnieId !== compagnie) continue; const k = `${l.compagnieId}|${l.de}|${l.vers}|${l.gareDe}|${l.gareVers}`; const g = m.get(k) ?? { cle: k, lignes: [] }; g.lignes.push(l); m.set(k, g); }
    return [...m.values()];
  });
  const prixDe = (g: Liaison, classe: string) => g.lignes.find((l) => l.classe === classe)?.prix;
  const statut = (g: Liaison) => { const n = g.lignes.filter((l) => l.actif).length; return n === g.lignes.length ? { t: 'active', c: 'ok' } : n === 0 ? { t: 'suspendue', c: 'er' } : { t: 'partielle', c: 'wa' }; };

  const ROLES_PAR_GROUPE = { equipe: ROLES_EQUIPE, siege: ROLES_SIEGE, partenaires: ROLES_PARTENAIRES };
  const personnes = $derived(app.monde.personnes.filter((p) => p.role !== 'voyageur' && (inactifs || p.actif) && (groupe === 'tous' || (ROLES_PAR_GROUPE[groupe] as string[]).includes(p.role))));
  const acces = (p: (typeof personnes)[number]) => (!p.actif ? { t: 'suspendu', c: 'er' } : p.role === 'comptable' ? { t: 'lecture seule', c: 'inf' } : { t: 'actif', c: 'ok' });

  const PRIX: Record<string, [string, string]> = { dynamique: ['Prix dynamique selon remplissage', '−500 F sous 50 % à J-1, +500 F au-dessus de 90 %'], calendrierBas: ['Prix bas affiché dans le calendrier', 'le client voit le moins cher du jour'], etudiant: ['Tarif étudiant −20 %', 'sur carte scannée'], memePrix: ['Prix identique guichet et app', 'aucune différence selon le canal'] };
  const REGLES: Record<string, [string, string]> = { cloture: ['Clôture obligatoire avant 20:00', 'sinon alerte au patron'], bordereau: ['Photo du bordereau de dépôt', 'exigée à chaque dépôt bancaire'], scanQuai: ['Scan obligatoire au quai', 'pas de montée sans scan ou comptage'], cadence: ['Vente en cadence sans siège', 'placement libre aux heures de pointe'], visage: ['Visage obligatoire pour débloquer un guichet', 'le superviseur reconnaît l’agent'] };
  function bascule(g: GroupeParam, cle: string, nom: string) { const on = basculerParametre(g, cle, moi?.id); montrer(`${nom} : ${on ? 'activé' : 'désactivé'} · visible par les gares en 1 min`); }
  const commission = (role: string) => { const v = [...new Set(app.monde.personnes.filter((p) => p.role === role && p.commission !== undefined).map((p) => p.commission))]; return v.length ? v.map((x) => `${x} %`).join(' · ') : '—'; };
  const frais: [string, string][] = [
    [`Annulation par le voyageur (> ${DELAI_ANNULATION_MIN / 60} h avant)`, `${TAUX_FRAIS_ANNULATION * 100} %`], ['Annulation par la compagnie', 'remboursement intégral'], ['Première rangée Classique (confort)', '+ 1 500 F'], ['Réduction étudiant', `− ${REDUCTION_ETUDIANT * 100} %`],
    [`Geste commercial (retard ≥ 30 min)`, `${fcfa(gesteRetard(30))} F`], ['Colis S · M · L', `${fcfa(TAILLES.S.prix)} · ${fcfa(TAILLES.M.prix)} · ${fcfa(TAILLES.L.prix)} F`], ['Colis : moto · assurance', `+ ${fcfa(SUPPLEMENT_MOTO)} · + ${fcfa(SUPPLEMENT_ASSURANCE)} F`],
    ['Commission convoyeur', commission('convoyeur')], ['Commission vendeur ambulant', commission('vendeur')]
  ];
  const now = $derived(maintenant());
</script>

<Siege actif="config">
  <div class="top">
    <div class="col"><h1 class="ttl">Configuration</h1><span class="t13 mut">chaque changement est journalisé et visible par les gares en 1 min</span></div>
    <div class="seg2" role="group" aria-label="Onglet">{#each ONGLETS as [o, n] (o)}<button type="button" class:on={onglet === o} aria-pressed={onglet === o} onclick={() => (onglet = o)}>{n}</button>{/each}</div>
  </div>

  {#if onglet === 'lignes'}
    <div class="gl">
      <div class="row sp wrapf"><span class="t15 b7">Lignes · {liaisons.length}</span>
        <div class="row g8 wrapf"><label class="sr" for="cfg-compagnie">Compagnie</label><select id="cfg-compagnie" class="in" style="width: auto" bind:value={compagnie}><option value="toutes">Toutes les compagnies</option>{#each app.monde.compagnies as c (c.id)}<option value={c.id}>{c.nom}</option>{/each}</select>
          <Lien href="/siege/config/ligne?nouvelle=1" class="b p sm">+ Nouvelle ligne</Lien></div></div>
      <Defile label="Tableau des lignes" ><table class="tbl" style="margin-top: 8px"><thead><tr><th scope="col">Ligne</th><th scope="col" class="r">Départs / jour</th><th scope="col" class="r">Classique</th><th scope="col" class="r">VIP</th><th scope="col">Gares</th><th scope="col">Statut</th><th scope="col"><span class="sr">Action</span></th></tr></thead><tbody>
        {#each liaisons as g (g.cle)}{@const l = g.lignes[0]}<tr class="rowlink"><td><Lien href="/siege/config/ligne?ligne={l.id}" class="lien"><span class="cell">{l.de} → {l.vers}{compagnie === 'toutes' ? ` · ${l.compagnieId}` : ''}</span></Lien></td>
          <td class="r mono">{g.lignes.reduce((s, x) => s + x.horaires.length, 0)}</td><td class="r mono">{prixDe(g, 'Classique') ? fcfa(prixDe(g, 'Classique')!) : '—'}</td><td class="r mono">{prixDe(g, 'VIP') ? fcfa(prixDe(g, 'VIP')!) : '—'}</td>
          <td class="t13 mut">{nomGare(gareParId(l.gareDe))} → {nomGare(gareParId(l.gareVers))}</td><td><span class="pl {statut(g).c}">{statut(g).t}</span></td><td class="r"><Lien href="/siege/config/ligne?ligne={l.id}" class="aq"><span class="cell t13">modifier</span></Lien></td></tr>
        {:else}<tr><td colspan="7" class="vide-etat">Aucune ligne pour cette compagnie. Crée la première avec « + Nouvelle ligne ».</td></tr>{/each}
      </tbody></table></Defile>
    </div>
  {:else if onglet === 'tarifs'}
    <div class="c2">
      <div class="gl"><span class="t15 b7">Règles de prix</span><div class="col" style="gap: 0; margin-top: 6px">
        {#each Object.entries(PRIX) as [cle, [nom, detail]] (cle)}{@const on = !!app.monde.params.tarifs[cle]}<div class="li"><span class="col grow"><span class="t14 b6">{nom}</span><span class="t12 mut">{detail}</span></span><button type="button" class="sw {on ? 'on' : ''}" role="switch" aria-checked={on} aria-label={nom} onclick={() => bascule('tarifs', cle, nom)}></button></div>{/each}</div></div>
      <div class="gl"><span class="t15 b7">Frais et commissions</span><div class="col" style="gap: 0; margin-top: 6px">{#each frais as [n, v] (n)}<div class="li"><span class="grow t14">{n}</span><span class="mono b7">{v}</span></div>{/each}</div><p class="t12 mut3" style="margin-top: 8px">Valeurs issues des règles de calcul de l’application (non modifiables ici).</p></div>
    </div>
  {:else if onglet === 'equipe'}
    <div class="gl">
      <div class="row sp wrapf"><span class="t15 b7">Équipe · {personnes.length} personne{personnes.length > 1 ? 's' : ''}</span>
        <div class="row g8 wrapf"><label class="sr" for="cfg-groupe">Groupe</label><select id="cfg-groupe" class="in" style="width: auto" bind:value={groupe}><option value="tous">Tout le monde</option><option value="equipe">Équipe de gare</option><option value="siege">Patron et siège</option><option value="partenaires">Partenaires</option></select>
          <button type="button" class="ch {inactifs ? 'on' : ''}" aria-pressed={inactifs} onclick={() => (inactifs = !inactifs)}>Suspendus inclus</button><Lien href="/siege/config/personne?nouvelle=1" class="b p sm">+ Ajouter une personne</Lien></div></div>
      <Defile label="Tableau de l’équipe" ><table class="tbl" style="margin-top: 8px"><thead><tr><th scope="col">Nom</th><th scope="col">Rôle</th><th scope="col">Gare</th><th scope="col">Accès</th><th scope="col">Dernière action</th><th scope="col"><span class="sr">Action</span></th></tr></thead><tbody>
        {#each personnes as p (p.id)}{@const e = derniereAction(p.id)}<tr class="rowlink"><td><Lien href="/siege/config/personne?personne={p.id}" class="lien"><span class="cell">{p.prenom} {p.nom[0]}.</span></Lien></td><td>{NOM_ROLE[p.role]}</td><td>{p.gareId ? nomGare(gareParId(p.gareId)) : 'siège'}</td><td><span class="pl {acces(p).c}">{acces(p).t}</span></td>
          <td class="t13 mut libre">{e ? `${e.texte.slice(0, 48)}${e.texte.length > 48 ? '…' : ''} · ${quand(e.ts, now)}` : '—'}</td><td class="r"><Lien href="/siege/config/personne?personne={p.id}" class="aq"><span class="cell t13">modifier</span></Lien></td></tr>
        {:else}<tr><td colspan="6" class="vide-etat">Personne dans ce groupe.</td></tr>{/each}
      </tbody></table></Defile>
    </div>
  {:else}
    <div class="c2">
      <div class="gl"><span class="t15 b7">Règles de gare</span><div class="col" style="gap: 0; margin-top: 6px">
        {#each Object.entries(REGLES) as [cle, [nom, detail]] (cle)}{@const on = !!app.monde.params.regles[cle]}<div class="li"><span class="col grow"><span class="t14 b6">{nom}</span><span class="t12 mut">{detail}</span></span><button type="button" class="sw {on ? 'on' : ''}" role="switch" aria-checked={on} aria-label={nom} onclick={() => bascule('regles', cle, nom)}></button></div>{/each}</div></div>
      <div class="gl"><span class="t15 b7">Seuils d’alerte</span><div class="col" style="gap: 0; margin-top: 6px">
        <div class="li"><span class="grow t14">Écart de caisse toléré sans validation</span><span class="mono b7">≤ {fcfa(TOLERANCE)} F</span></div><div class="li"><span class="grow t14">Vitesse bus</span><span class="mono b7">{LIMITE_VITESSE} km/h</span></div>
        <div class="li"><span class="grow t14">Retard notifié aux clients</span><span class="mono b7">≥ {SEUIL_RETARD_MIN} min</span></div><div class="li"><span class="grow t14">Blocage guichet</span><span class="mono b7">3 PIN faux</span></div></div>
        <Lien href="/modules" class="b s sm" style="margin-top: 10px">Modules activés</Lien></div>
    </div>
  {/if}
</Siege>
