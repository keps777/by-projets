import '@fontsource-variable/unbounded';
import '@fontsource-variable/sora';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/700.css';
import './ui/afri.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { demarrer } from './data/store.svelte.ts';

demarrer();
mount(App, { target: document.getElementById('app')! });
