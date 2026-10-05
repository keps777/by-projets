<script lang="ts">
  // Export du rapport en page entière (planche RapportExport) : ouvert par la notification « Ton rapport est prêt ».
  import EcranPage from '../../ui/EcranPage.svelte';
  import EnTete from '../../ui/EnTete.svelte';
  import Segment from '../../ui/Segment.svelte';
  import { routeur } from '../../routeur.svelte.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';
  import { profil } from '../../data/requetes.ts';
  import { calculerPoints, preparer } from './calcul.ts';
  import { donneesRapport } from './donnees.ts';
  import { estVue, periodeDe, type Vue } from './periodes.ts';
  import PanneauExport from './PanneauExport.svelte';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const vue = $derived<Vue>(estVue(routeur.params.get('onglet')) ? (routeur.params.get('onglet') as Vue) : 'jour');
  const jourParam = $derived(routeur.params.get('jour'));
  const periode = $derived(periodeDe(vue, jourParam && /^\d{4}-\d{2}-\d{2}$/.test(jourParam) ? jourParam : aujourdhui()));

  const p = $derived(profil());
  const d = $derived(donneesRapport());
  const points = $derived(calculerPoints(preparer(d), d, periode.debut, periode.fin));
</script>

<EcranPage gap={14}>
  <EnTete titre="Exporter le rapport" repli="/rapports" />
  <Segment options={[{ valeur: 'jour', label: 'Jour' }, { valeur: 'semaine', label: 'Semaine' }, { valeur: 'mois', label: 'Mois' }]} valeur={vue} onchoisir={(v) => routeur.definir('onglet', v)} />
  <PanneauExport {periode} {points} nom={p?.nom_rapport?.trim() || p?.prenom || ''} langue={p?.langue_rapport ?? 'fr'} entete={false} />
</EcranPage>
