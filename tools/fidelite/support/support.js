// Support minimal pour afficher une planche .dc.html seule, hors canevas.
//
// Les planches font <script src="./support.js"> mais ce fichier n'est pas livré avec
// docs/maquettes-v3 : c'est le canevas de conception qui l'injecte. Les 77 planches sont
// statiques (leur <script type="text/x-dc"> n'a que `renderVals() { return {}; }`), il suffit donc de :
//   1. déclarer DCLogic pour que la classe Component ne plante pas si elle est évaluée ;
//   2. rendre <x-dc> transparent pour la mise en page (élément inconnu = inline par défaut) ;
//   3. remonter dans <head> le contenu de <helmet> (polices, @keyframes pulse, reset body).
// Le banc (src/serveur.ts) sert ce fichier à la place de ./support.js quand il manque.
(function () {
  window.DCLogic = class DCLogic {
    renderVals() {
      return {};
    }
  };

  var base = document.createElement("style");
  base.textContent = "x-dc{display:block}helmet{display:none}";
  document.head.appendChild(base);

  function remonter() {
    document.querySelectorAll("helmet").forEach(function (h) {
      Array.prototype.slice.call(h.children).forEach(function (el) {
        document.head.appendChild(el);
      });
      h.remove();
    });
    document.documentElement.setAttribute("data-planche-prete", "");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", remonter);
  else remonter();
})();
