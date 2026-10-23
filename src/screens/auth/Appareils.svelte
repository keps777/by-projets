<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { codeTropSimple, LONGUEUR_CODE } from '../../core/auth.ts';
  import { cetAppareil, ilYa, SEUIL_CODE_PAIEMENT } from '../../core/inscription.ts';
  import { fcfa } from '../../core/money.ts';
  import { CODE_DEMO } from '../../data/constantes.ts';
  import Alerte from './Alerte.svelte';
  import Clavier from './Clavier.svelte';
  import Interrupteur from './Interrupteur.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import { changerCode, desactiverBiometrie, retirerAppareil, verifierCode } from './actions.ts';
  import { idAppareil } from './appareil.ts';
  import { etatAuth } from './etat.ts';

  const e = etatAuth();
  const moi = idAppareil();
  let message = $state('');
  const appareils = $derived(app.auth.appareils);

  function retirer(id: string) {
    const a = retirerAppareil(id);
    if (a) message = `${a.nom} retiré. Il devra être revalidé pour se reconnecter.`;
  }
  function biometrie(actif: boolean) {
    if (!actif) { desactiverBiometrie(); message = 'Biométrie désactivée. Votre code reste le moyen d\'entrer.'; return; }
    if (app.mode === 'demo' || app.auth.idBiometrie) { app.auth.biometrie = true; message = 'Biométrie activée.'; return; }
    aller('/biometrie?depuis=profil');
  }

  // --- changement de code : ancien code puis nouveau code
  let ouverte = $state(false);
  let actif = $state<'ancien' | 'nouveau'>('ancien');
  let ancien = $state(''); let nouveau = $state('');
  let ancienEtat = $state<'attente' | 'ok' | 'faux'>('attente');
  let occupe = $state(false);
  function ouvrir() { ancien = ''; nouveau = ''; ancienEtat = 'attente'; actif = 'ancien'; ouverte = true; }
  async function chiffre(d: string) {
    if (occupe) return;
    if (actif === 'ancien') {
      if (ancienEtat === 'faux') { ancien = ''; ancienEtat = 'attente'; }
      if (ancien.length >= LONGUEUR_CODE) return;
      ancien += d;
      if (ancien.length === LONGUEUR_CODE) {
        occupe = true;
        const r = await verifierCode(ancien);
        occupe = false;
        if (r === 'ok') { ancienEtat = 'ok'; actif = 'nouveau'; }
        else if (r === 'verrouille') { ouverte = false; app.auth.connecte = false; aller('/verrou'); }
        else ancienEtat = 'faux';
      }
    } else if (nouveau.length < LONGUEUR_CODE) nouveau += d;
  }
  function efface() {
    if (occupe) return;
    if (actif === 'ancien') { ancien = ancienEtat === 'faux' ? '' : ancien.slice(0, -1); ancienEtat = 'attente'; }
    else nouveau = nouveau.slice(0, -1);
  }
  const nouveauSimple = $derived(nouveau.length === LONGUEUR_CODE && codeTropSimple(nouveau));
  const nouveauIdentique = $derived(nouveau.length === LONGUEUR_CODE && nouveau === ancien);
  const pret = $derived(ancienEtat === 'ok' && nouveau.length === LONGUEUR_CODE && !nouveauSimple && !nouveauIdentique);
  const indice = $derived(
    ancienEtat === 'faux' ? { ton: 'erreur' as const, t: `Ancien code incorrect${app.mode === 'demo' ? ` (démo : ${CODE_DEMO})` : ''}.` }
    : nouveauSimple ? { ton: 'avert' as const, t: 'Nouveau code trop simple.' }
    : nouveauIdentique ? { ton: 'avert' as const, t: 'Le nouveau code doit être différent.' }
    : pret ? { ton: 'succes' as const, t: 'Parfait. Vous pouvez enregistrer.' }
    : ancienEtat === 'ok' ? { ton: 'info' as const, t: 'Choisissez maintenant votre nouveau code.' }
    : { ton: 'info' as const, t: "Entrez d'abord votre ancien code." }
  );
  async function enregistrer() {
    if (!pret || occupe) return;
    occupe = true;
    const r = await changerCode(ancien, nouveau);
    occupe = false;
    if (r === 'ok') { ouverte = false; message = 'Code modifié. Les autres appareils devront le saisir.'; }
  }
  const modifie = $derived(e.codeModifieLe ? `Dernière modification ${ilYa(e.codeModifieLe, maintenant())}` : 'Jamais modifié depuis la création du compte');
</script>

<Ecran titre="Sécurité" sur="APPAREILS ET CODE" retourVers="/profil">
  {#if message}<Alerte ton="succes">{message}</Alerte>{/if}

  <section aria-labelledby="h-app">
    <h2 id="h-app">Appareils de confiance · {appareils.length}</h2>
    {#if appareils.length === 0}
      <Carte><p class="muted">Aucun appareil enregistré. Cet appareil sera ajouté à votre prochaine connexion.</p></Carte>
    {:else}
      <ul class="liste">
        {#each appareils as a (a.id)}
          {@const courant = a.id === moi}
          <li class:courant>
            <span class="ic"><Icone nom="telephone" taille={22} /></span>
            <span class="t"><b>{courant ? cetAppareil(a.nom) : a.nom}</b><small>{a.lieu} · {courant ? 'connecté maintenant' : ilYa(a.quand, maintenant())}</small></span>
            {#if courant}<Pastille ton="bon">Cet appareil</Pastille>
            {:else}<button type="button" class="retirer" aria-label="Retirer {a.nom}" onclick={() => retirer(a.id)}>Retirer</button>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <Carte>
    <Interrupteur controle actif={app.auth.biometrie} titre="Ouvrir avec Face ID ou l'empreinte" aide="Code en secours si la reconnaissance échoue" onchange={biometrie} />
    <Interrupteur bind:actif={e.codePaiement} titre="Code pour chaque paiement" aide="Demandé au-dessus de {fcfa(SEUIL_CODE_PAIEMENT)} FCFA" />
    <button type="button" class="rang" onclick={ouvrir}>
      <span class="ic"><Icone nom="verrou" taille={20} /></span><span class="t"><b>Changer mon code</b><small>{modifie}</small></span><Icone nom="suivant" taille={16} />
    </button>
  </Carte>

  <Bouton variante="secondaire" href="/deconnexion">Se déconnecter partout</Bouton>
  <div class="espace" aria-hidden="true"></div>
</Ecran>

<Feuille bind:ouverte titre="Changer mon code" sous="Sécurité">
  <div class="champs">
    <button type="button" class="chp" class:on={actif === 'ancien'} aria-pressed={actif === 'ancien'} onclick={() => (actif = 'ancien')}><span>Ancien code</span><SaisieCode valeur={ancien} variante="points" ton={ancienEtat === 'faux' ? 'mauvais' : ancienEtat === 'ok' ? 'ok' : 'neutre'} etiquette="Ancien code" /></button>
    <button type="button" class="chp" class:on={actif === 'nouveau'} aria-pressed={actif === 'nouveau'} disabled={ancienEtat !== 'ok'} onclick={() => (actif = 'nouveau')}><span>Nouveau code</span><SaisieCode valeur={nouveau} variante="points" ton={nouveauSimple || nouveauIdentique ? 'alerte' : 'neutre'} etiquette="Nouveau code" /></button>
  </div>
  <Alerte ton={indice.ton}>{indice.t}</Alerte>
  <Clavier compact onchiffre={chiffre} oneffacer={efface} desactive={occupe} />
  <div class="deux"><Bouton variante="secondaire" onclick={() => (ouverte = false)}>Annuler</Bouton><Bouton desactive={!pret || occupe} onclick={enregistrer}>Enregistrer</Bouton></div>
</Feuille>

<style>
  h2 { font: 500 11px var(--mono); letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; }
  .liste { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-height: 68px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); } li.courant { border-color: rgba(61, 213, 152, 0.35); } li.courant .ic { color: var(--bon); }
  .ic { width: 40px; height: 40px; border-radius: 12px; background: var(--carte2); display: grid; place-items: center; flex: none; color: var(--muted); } .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left; } .t b { font-size: 14.5px; } small { color: var(--muted); font-size: 12.5px; }
  .retirer { min-height: 44px; min-width: 64px; padding: 0 12px; border-radius: 12px; border: 1px solid rgba(255, 114, 114, 0.35); color: var(--danger); font-weight: 600; font-size: 13px; }
  .rang { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 60px; color: var(--muted); text-align: left; } .rang .ic { background: var(--primaire-fond); color: var(--primaire-clair); } .rang .t b { color: var(--texte); }
  .champs { display: flex; flex-direction: column; gap: 8px; } .chp { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 56px; padding: 6px 16px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); font-size: 14px; color: var(--doux); } .chp.on { border-color: var(--primaire); } .chp:disabled { opacity: 0.5; }
  .chp :global(.rangee) { padding: 0; gap: 8px; } .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .espace { height: 76px; }
</style>
