import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './ui/nexg.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { demarrer } from './data/store.svelte.ts';
import { avancerMonde } from './domain/marche.ts';

demarrer();
avancerMonde(); // à J-1 : annonces retirées et voyageurs nommés par défaut ; après le départ : droits voyagés
mount(App, { target: document.getElementById('app')! });
