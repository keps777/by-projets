/*
 * Émulation LOCALE et LIMITÉE du moteur « .dc.html » du canevas Claude Design.
 *
 * Pourquoi : les planches chargent `./support.js`, qui n'existe pas dans le dépôt. Sans lui, aucune planche ne
 * s'affiche hors canevas. Ce fichier est servi à la place de `support.js` par `outils/verifier-web.mjs` et
 * `outils/rendre.mjs` (jamais copié dans `maquettes/`). Il ne remplace PAS le moteur officiel : toute fidélité
 * finale se juge dans le canevas.
 *
 * Ce qu'il comprend (règles du format, voir STYLE_NUIT.md « Règles du format .dc.html ») :
 *   - `<x-dc>` : le gabarit ; `<helmet>` : feuilles de style et polices déplacées dans <head> ;
 *   - `{{chemin.pointé}}` dans le texte et les attributs ; `<sc-if value="{{x}}">` ; `<sc-for list="{{l}}" as="i">` ;
 *   - événements `onClick`, `onChange`, `onMouseEnter`, `onMouseLeave` = fonctions renvoyées par `renderVals()` ;
 *   - `class Component extends DCLogic` : `state`, `setState` (fusion), `props` (valeurs par défaut de `data-props`),
 *     `componentDidMount`, `componentWillUnmount`, `renderVals()`.
 */
(function () {
  'use strict';

  const BOOL_ATTRS = new Set(['checked', 'disabled', 'hidden', 'selected', 'readonly', 'required', 'open']);
  const EVENT_MAP = {
    onclick: 'click',
    onchange: 'change',
    onmouseenter: 'mouseenter',
    onmouseleave: 'mouseleave',
    oninput: 'input',
    onfocus: 'focus',
    onblur: 'blur',
  };
  const INPUT_EVENT_TYPES = new Set(['text', 'search', 'range', 'date', 'tel', 'email', 'number', 'password', 'url', '']);

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = undefined;
      this.__render = null;
    }
    setState(patch) {
      const cur = this.state || {};
      const next = typeof patch === 'function' ? patch(cur) : patch;
      this.state = Object.assign({}, cur, next);
      if (this.__render) this.__render();
    }
    componentDidMount() {}
    componentWillUnmount() {}
    renderVals() {
      return {};
    }
  }
  window.DCLogic = DCLogic;

  const pathGet = (scope, path) => {
    const parts = String(path).trim().split('.');
    let cur = scope;
    for (const p of parts) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[p];
    }
    return cur;
  };
  const SINGLE = /^\s*\{\{\s*([A-Za-z0-9_$.]+)\s*\}\}\s*$/;
  const ANY = /\{\{\s*([A-Za-z0-9_$.]+)\s*\}\}/g;
  const interpolate = (str, scope) =>
    str.replace(ANY, (_, p) => {
      const v = pathGet(scope, p);
      return v === undefined || v === null ? '' : String(v);
    });

  function processNode(node, scope, out) {
    if (node.nodeType === 3) {
      out.push(document.createTextNode(interpolate(node.data, scope)));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'helmet') return;
    if (tag === 'sc-if') {
      const m = SINGLE.exec(node.getAttribute('value') || '');
      const v = m ? pathGet(scope, m[1]) : false;
      if (v) for (const c of node.childNodes) processNode(c, scope, out);
      return;
    }
    if (tag === 'sc-for') {
      const m = SINGLE.exec(node.getAttribute('list') || '');
      const list = (m && pathGet(scope, m[1])) || [];
      const alias = node.getAttribute('as') || 'item';
      list.forEach((item, index) => {
        const sub = Object.create(scope);
        sub[alias] = item;
        sub.index = index;
        for (const c of node.childNodes) processNode(c, sub, out);
      });
      return;
    }
    const el = document.createElementNS(node.namespaceURI, node.localName);
    el.__h = {};
    el.__p = {};
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name;
      const lname = name.toLowerCase();
      const single = SINGLE.exec(attr.value);
      if (EVENT_MAP[lname]) {
        if (single) {
          let type = EVENT_MAP[lname];
          if (type === 'change' && tag === 'input' && INPUT_EVENT_TYPES.has((node.getAttribute('type') || '').toLowerCase())) type = 'input';
          const fn = pathGet(scope, single[1]);
          if (typeof fn === 'function') el.__h[type] = fn;
        }
        continue;
      }
      if (BOOL_ATTRS.has(lname) && single) {
        const v = pathGet(scope, single[1]);
        el.__p[lname] = !(v === false || v === null || v === undefined || v === 'false' || v === '');
        continue;
      }
      if (lname === 'value' && (tag === 'input' || tag === 'select' || tag === 'textarea') && single) {
        const v = pathGet(scope, single[1]);
        el.__p.value = v === undefined || v === null ? '' : String(v);
        continue;
      }
      el.setAttribute(name, interpolate(attr.value, scope));
    }
    const kids = [];
    for (const c of node.childNodes) processNode(c, scope, kids);
    for (const k of kids) el.appendChild(k);
    out.push(el);
  }

  function applyProps(el) {
    const p = el.__p || {};
    if ('checked' in p && el.checked !== p.checked && el.__lastChecked !== p.checked) el.checked = p.checked;
    if ('checked' in p) el.__lastChecked = p.checked;
    for (const k of ['disabled', 'hidden', 'selected', 'readonly', 'required', 'open']) {
      if (k in p) {
        if (p[k]) el.setAttribute(k, '');
        else el.removeAttribute(k);
      }
    }
    if ('value' in p && el.__lastValue !== p.value) {
      el.value = p.value;
      el.__lastValue = p.value;
    }
  }

  function bind(el) {
    const types = Object.keys(el.__h || {});
    el.__bound = el.__bound || {};
    for (const t of types) {
      if (!el.__bound[t]) {
        el.addEventListener(t, (e) => {
          const fn = el.__h[t];
          if (fn) fn(e);
        });
        el.__bound[t] = true;
      }
    }
  }

  function syncAttrs(o, n) {
    for (const a of Array.from(o.attributes)) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
    for (const a of Array.from(n.attributes)) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  }

  function morphNode(o, n) {
    if (o.nodeType !== n.nodeType || (o.nodeType === 1 && o.localName !== n.localName)) {
      o.replaceWith(n);
      initTree(n);
      return;
    }
    if (o.nodeType !== 1) {
      if (o.data !== n.data) o.data = n.data;
      return;
    }
    syncAttrs(o, n);
    o.__h = n.__h;
    o.__p = n.__p;
    bind(o);
    morphChildren(o, n);
    applyProps(o);
  }

  function morphChildren(o, n) {
    const ok = Array.from(o.childNodes);
    const nk = Array.from(n.childNodes);
    const common = Math.min(ok.length, nk.length);
    for (let i = 0; i < common; i += 1) morphNode(ok[i], nk[i]);
    for (let i = ok.length - 1; i >= common; i -= 1) o.removeChild(ok[i]);
    for (let i = common; i < nk.length; i += 1) {
      o.appendChild(nk[i]);
      initTree(nk[i]);
    }
  }

  function initTree(el) {
    if (el.nodeType !== 1) return;
    bind(el);
    for (const c of Array.from(el.childNodes)) initTree(c);
    applyProps(el);
  }

  function boot() {
    const xdc = document.querySelector('x-dc');
    const scriptEl = document.querySelector('script[data-dc-script]');
    if (!xdc || !scriptEl) return;
    const template = xdc.cloneNode(true);
    // <helmet> : feuilles de style et polices vers <head>
    for (const h of Array.from(xdc.querySelectorAll('helmet'))) {
      for (const c of Array.from(h.children)) document.head.appendChild(c);
      h.remove();
    }
    const container = document.createElement('div');
    container.id = 'dc-root';
    xdc.replaceWith(container);

    let propsDef = {};
    try {
      propsDef = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
    } catch (e) {
      console.error('data-props invalide', e);
    }
    const props = {};
    for (const [k, v] of Object.entries(propsDef)) if (!k.startsWith('$') && v && 'default' in v) props[k] = v.default;

    const Component = new Function('DCLogic', scriptEl.textContent + '\n;return Component;')(DCLogic);
    const comp = new Component(props);
    let scheduled = false;
    const renderNow = () => {
      scheduled = false;
      const vals = comp.renderVals() || {};
      const out = [];
      for (const c of Array.from(template.childNodes)) processNode(c, vals, out);
      const frag = document.createElement('div');
      for (const k of out) frag.appendChild(k);
      if (!container.__mounted) {
        while (frag.firstChild) container.appendChild(frag.firstChild);
        initTree(container);
        container.__mounted = true;
      } else {
        morphChildren(container, frag);
      }
    };
    comp.__render = () => {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(renderNow);
    };
    renderNow();
    window.__dc = { comp, rerender: renderNow };
    if (typeof comp.componentDidMount === 'function') comp.componentDidMount();
    window.addEventListener('pagehide', () => {
      if (typeof comp.componentWillUnmount === 'function') comp.componentWillUnmount();
    });
    document.documentElement.setAttribute('data-dc-ready', '1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
