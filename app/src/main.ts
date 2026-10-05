import { mount } from 'svelte';
import App from './App.svelte';
import './ui/tokens.css';

mount(App, { target: document.getElementById('app')! });
