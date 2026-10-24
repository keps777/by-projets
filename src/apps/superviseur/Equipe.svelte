<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { param } from '../../router.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import { formaterTel, telValide } from '../../core/supervision.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ROLES_AJOUTABLES, ajouterAgent, basculerCompte, reinitialiserPin } from './actions.ts';
  import { dockSuperviseur } from './dock.ts';
  import { equipeGare, LIBELLE_ROLE } from './equipe.ts';
  import { gareSuivie, horloge } from './etat.svelte.ts';
  import Feuille from './Feuille.svelte';
  import { va } from './nav.ts';
  import type { Role } from '../../domain/types.ts';

  const moi = $derived(personneCourante());
  const gareId = $derived(gareSuivie(moi, param('gare')));
  const gare = $derived(app.monde.gares.find((g) => g.id === gareId));
  const lignes = $derived(equipeGare(app.monde, gareId, horloge.t));
  let filtre = $state<'tous' | 'guichets' | 'terrain'>('tous');
  const vues = $derived(lignes.filter((l) => filtre === 'tous' || l.groupe === filtre));
  let pinPour = $state<string | null>(null), pinOuvert = $state(false), envoyes = $state<Record<string, { pin: string; tel: string; montre: boolean }>>({}), erreur = $state('');
  const cible = $derived(app.monde.personnes.find((p) => p.id === pinPour));

  function nouveauPin() {
    if (!moi || !cible) return;
    const r = reinitialiserPin(moi.id, cible.id); pinOuvert = false;
    if (r.ok) { envoyes[cible.id] = { pin: r.pin, tel: r.tel, montre: false }; erreur = ''; montrer(`PIN envoyé à ${cible.prenom} par SMS`); } else erreur = r.erreur;
  }
  function basculer(id: string, actif: boolean) {
    if (!moi) return; const r = basculerCompte(moi.id, id, actif);
    if (r.ok) { erreur = ''; montrer(actif ? 'Compte réactivé' : 'Compte désactivé', actif ? 'ok' : 'wa'); } else { erreur = r.erreur; montrer(r.erreur, 'er'); }
  }

  let ajout = $state(false), prenom = $state(''), nom = $state(''), tel = $state(''), role = $state<Role>('guichet'), erreurAjout = $state('');
  const formOk = $derived(prenom.trim().length >= 2 && nom.trim().length >= 2 && telValide(tel));
  function ouvrirAjout() { prenom = ''; nom = ''; tel = ''; role = 'guichet'; erreurAjout = ''; ajout = true; }
  function ajouter() {
    if (!moi) return; const r = ajouterAgent(moi.id, { prenom, nom, tel, role }, gareId);
    if (r.ok) { ajout = false; envoyes[r.personne.id] = { pin: r.pin, tel: formaterTel(r.personne.tel), montre: false }; montrer(`${r.personne.prenom} ajouté(e) à l’équipe`); } else erreurAjout = r.erreur;
  }
</script>

<Mobile titre="Équipe de {gare?.nom ?? gareId}" retourVers="/superviseur" dock={dockSuperviseur('equipe')}>
  {#snippet droite()}<button type="button" class="ib" aria-label="Ajouter un agent" onclick={ouvrirAjout}><Icone nom="plus" /></button>{/snippet}

  <div class="seg2" role="group" aria-label="Filtre">
    <button type="button" class:on={filtre === 'tous'} aria-pressed={filtre === 'tous'} onclick={() => (filtre = 'tous')}>Tous</button>
    <button type="button" class:on={filtre === 'guichets'} aria-pressed={filtre === 'guichets'} onclick={() => (filtre = 'guichets')}>Guichets</button>
    <button type="button" class:on={filtre === 'terrain'} aria-pressed={filtre === 'terrain'} onclick={() => (filtre = 'terrain')}>Terrain</button>
  </div>
  {#if erreur}<div class="gl erc t13" role="alert">{erreur}</div>{/if}
  <div class="gl col" style="gap: 0">
    {#each vues as l (l.p.id)}
      {@const soi = l.p.id === moi?.id}
      <div class="pe">
        <div class="haut">
          <span class="av {l.p.role === 'controleur' || l.p.role === 'guichet' ? 'hot' : ''}" aria-hidden="true">{l.p.prenom[0]}</span>
          <span class="col grow"><span class="t14 b7 nom">{l.p.prenom} {l.p.nom}</span><span class="t12 mut">{l.role}{soi ? ' (toi)' : ''} · {l.sub}</span></span>
          <span class="pl {l.ton}">{l.pl}</span>
        </div>
        {#if envoyes[l.p.id]}{@const e = envoyes[l.p.id]}<span class="t12 okc sms">SMS envoyé au {e.tel} · PIN <span class="mono">{e.montre ? e.pin : '••••'}</span>
          <button type="button" class="lien" aria-label={e.montre ? 'Masquer le PIN' : 'Voir le PIN (démo)'} onclick={() => (e.montre = !e.montre)}>{e.montre ? 'masquer' : 'voir (démo)'}</button></span>{/if}
        <div class="actions">
          <button type="button" class="b s sm nouveau" onclick={() => { pinPour = l.p.id; pinOuvert = true; }} aria-label="Nouveau PIN pour {l.p.prenom}">Nouveau PIN</button>
          {#if !soi}<span class="row g8 tgl"><span class="t12 mut" aria-hidden="true">{l.p.actif ? 'Compte actif' : 'Compte désactivé'}</span><button type="button" class="sw" class:on={l.p.actif} role="switch" aria-checked={l.p.actif} aria-label="Compte de {l.p.prenom} {l.p.actif ? 'actif' : 'désactivé'}" onclick={() => basculer(l.p.id, !l.p.actif)}></button></span>{/if}
        </div>
      </div>
    {:else}
      <div class="t13 mut c" style="padding: 14px 0">{lignes.length === 0 ? 'Personne n’est rattaché à cette gare pour le moment. Ajoute un agent avec le bouton +.' : 'Personne dans cette catégorie.'}</div>
    {/each}
  </div>
  <div class="toast"><span class="bub aq"><Icone nom="info" taille={18} /></span><span class="t13 grow">Un nouveau PIN part par SMS et remplace l’ancien tout de suite. Chaque action est signée de ton nom dans le journal.</span></div>
  <a class="b s" href="/superviseur/debloquer" onclick={va('/superviseur/debloquer')} style="margin-top: auto">Guichet bloqué ? Débloquer</a>

  <Feuille bind:ouvert={pinOuvert} titre="Nouveau PIN pour {cible?.prenom ?? ''} ?" texte="Un PIN à 4 chiffres est tiré au hasard et envoyé par SMS au {cible ? formaterTel(cible.tel) : ''}. L’ancien PIN cesse de marcher." confirmer="Envoyer le nouveau PIN" onconfirmer={nouveauPin} />
  <Feuille bind:ouvert={ajout} titre="Ajouter un agent" texte="Son PIN est généré et envoyé par SMS." confirmer="Ajouter à l’équipe" actif={formOk} onconfirmer={ajouter}>
    <div class="fld"><label class="lab" for="ag-prenom">Prénom</label><input id="ag-prenom" class="inp" bind:value={prenom} autocomplete="off" /></div>
    <div class="fld"><label class="lab" for="ag-nom">Nom</label><input id="ag-nom" class="inp" bind:value={nom} autocomplete="off" /></div>
    <div class="fld"><label class="lab" for="ag-tel">Téléphone</label><input id="ag-tel" class="inp" bind:value={tel} inputmode="tel" placeholder="6 70 00 01 01" autocomplete="off" aria-invalid={tel.length > 0 && !telValide(tel)} /></div>
    <div class="fld"><span class="lab" id="ag-role">Rôle</span><div class="chips" role="group" aria-labelledby="ag-role">{#each ROLES_AJOUTABLES as r (r)}<button type="button" class="ch" class:on={role === r} aria-pressed={role === r} onclick={() => (role = r)}>{LIBELLE_ROLE[r]}</button>{/each}</div></div>
    {#if erreurAjout}<span class="t13 erc c" role="alert">{erreurAjout}</span>{:else if tel.length > 0 && !telValide(tel)}<span class="t12 wac c">Téléphone : 9 chiffres, commençant par 6.</span>{/if}
  </Feuille>
</Mobile>

<style>
  .pe { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .pe:last-child { border: 0; }
  .haut { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .nom { overflow-wrap: anywhere; }
  .actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-left: 54px; }
  .tgl { flex: none; }
  .nouveau { white-space: nowrap; flex: none; }
  .sms { padding-left: 54px; }
  .sw::before { content: ''; position: absolute; inset: -8px -4px; }
  .lien { background: none; border: 0; color: #7febff; text-decoration: underline; cursor: pointer; font: inherit; padding: 0 4px; min-height: 28px; }
  .inp { outline: none; } .inp:focus { border-color: #3de0ff; }
</style>
