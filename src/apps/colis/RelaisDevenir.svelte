<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import { fcfa } from '../../core/money.ts';
  import { COMMISSION_RELAIS, gainMensuelRelais } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { candidatureDe } from './actions.ts';

  let n = $state(8);
  const moi = $derived(personneCourante());
  const cand = $derived(candidatureDe(moi?.id, 'relais'));
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre="Point relais" retourVers="/moi" dock={dockVoyageur('moi')}>
  {#snippet droite()}<span class="pl ac">+{COMMISSION_RELAIS} F / colis</span>{/snippet}

  <div class="gl ac">
    <div class="shelf" aria-hidden="true"><div class="bx b1"></div><div class="bx b2"></div><div class="bx b3"></div></div>
    <span class="ttl t20 c" style="display: block">Ta boutique reçoit les colis</span>
    <p class="t14 mut c" style="margin: 6px 0 0">Les voyageurs déposent et retirent chez toi. Tu scannes, tu gagnes.</p>
  </div>

  <div class="gl row sp">
    <div class="col"><span class="lab" id="lab-n">Colis par jour</span>
      <div class="row g8" role="group" aria-labelledby="lab-n">
        <button class="ib pm" type="button" aria-label="Moins" onclick={() => (n = Math.max(1, n - 1))} disabled={n <= 1}>−</button>
        <span class="ttl t24" aria-live="polite">{n}</span>
        <button class="ib pm" type="button" aria-label="Plus" onclick={() => (n = Math.min(40, n + 1))} disabled={n >= 40}>+</button>
      </div>
    </div>
    <span class="col" style="align-items: flex-end"><span class="lab">Par mois</span><span class="ttl t24 okc" aria-live="polite">{fcfa(gainMensuelRelais(n))} F</span><span class="t12 mut">versé chaque lundi sur MoMo</span></span>
  </div>

  <span class="lab">Il te faut</span>
  <div class="gl col" style="gap: 0">
    <div class="li"><span class="bub aq">1</span><span class="grow t14">Une boutique ouverte au moins 6 jours sur 7, 10 h par jour</span></div>
    <div class="li"><span class="bub aq">2</span><span class="grow t14">Un téléphone Android avec l’app Relais (elle marche hors ligne)</span></div>
    <div class="li"><span class="bub aq">3</span><span class="grow t14">Ta CNI et un numéro MoMo ou OM à ton nom</span></div>
  </div>

  {#if cand}
    <div class="gl row g12" role="status"><span class="bub aq">i</span><span class="col grow"><span class="t14 b7">{cand.statut === 'attente' ? 'Ta fiche est en cours d’examen' : 'Ta candidature est acceptée'}</span><span class="t12 mut">{cand.statut === 'attente' ? 'Réponse sous 48 h.' : 'Ton compte relais est actif.'}</span></span></div>
  {/if}
  <div class="col g8" style="margin-top: auto">
    <a class="b p" href="/relais/inscription" onclick={(e) => lien(e, '/relais/inscription')}>{cand ? 'Voir ma fiche' : 'Commencer · 3 min'}</a>
    <a class="b g" href="/entree" onclick={(e) => lien(e, '/entree')}>Voir l’app du relais (démo)</a>
  </div>
</Mobile>

<style>
  .shelf { position: relative; height: 150px; perspective: 700px; display: grid; place-items: center; }
  .shelf .bx { position: absolute; width: 70px; height: 56px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.3); background: linear-gradient(135deg, rgba(139, 124, 255, 0.35), rgba(61, 224, 255, 0.2)); transform: rotateX(-20deg) rotateY(30deg); animation: flotte 5s ease-in-out infinite; }
  .b1 { margin-left: -90px; margin-top: 20px; } .b2 { margin-top: -30px; animation-delay: -1.5s !important; } .b3 { margin-left: 90px; margin-top: 30px; animation-delay: -3s !important; }
  @keyframes flotte { 50% { transform: rotateX(-20deg) rotateY(42deg) translateY(-6px); } }
  .pm { width: 44px; height: 44px; font-size: 22px; } .pm:disabled { opacity: 0.4; }
  button:focus-visible, a:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
