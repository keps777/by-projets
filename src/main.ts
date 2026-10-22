import '@fontsource-variable/geist';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { demarrer } from './data/store.svelte.ts';

demarrer();
mount(App, { target: document.getElementById('app')! });
