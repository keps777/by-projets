import { mount } from 'svelte';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist';
import '@fontsource/geist-mono/500.css';
import '@fontsource/instrument-serif/400-italic.css';
import './ui/tokens.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
