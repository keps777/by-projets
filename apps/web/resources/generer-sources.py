"""Régénère les images sources des icônes et de l'écran de lancement, à partir du logo de l'application web.

Le dessin est celui de apps/web/public/icone.svg (viewBox 72 x 72), recopié ici parce que ni ImageMagick ni Pillow ne
lisent le SVG. Aucune marque n'est inventée : mêmes couleurs, mêmes formes. Si le logo change, mettre à jour ce fichier,
relancer le script, puis `pnpm --filter @afrimove/web run cap:assets`.

    python3 -I apps/web/resources/generer-sources.py apps/web/resources

Produit dans le dossier donné : icon-only.png, icon-foreground.png, icon-background.png (couleur unie de la tuile,
#141B28) et splash.png (l'application est sombre : un seul écran de lancement, pour les deux thèmes).
"""

import sys

from PIL import Image, ImageDraw

SORTIE = sys.argv[1] if len(sys.argv) > 1 else "."
SURECHANTILLONNAGE = 4

NUIT = (0x0B, 0x10, 0x19, 255)
TUILE = (0x14, 0x1B, 0x28, 255)
VOLET_BAS = (0x1B, 0x24, 0x35, 255)
VOLET_HAUT = (0x27, 0x32, 0x47, 255)
AMBRE = (0xFF, 0xB5, 0x47, 255)


def dessiner(taille, echelle, fond=None, coins=None):
    """Dessine le logo au centre d'une image carrée.

    `echelle` : pixels par unité du viewBox 72. `fond` : couleur du fond plein. `coins` : rayon de la tuile arrondie
    (None : pas de tuile, le fond la remplace).
    """
    t = taille * SURECHANTILLONNAGE
    k = echelle * SURECHANTILLONNAGE
    img = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if fond is not None:
        d.rectangle([0, 0, t, t], fill=fond)
    ox = t / 2 - 36 * k
    oy = t / 2 - 36 * k

    def p(x, y):
        return (ox + x * k, oy + y * k)

    def rect_arrondi(x, y, w, h, r, couleur):
        d.rounded_rectangle([*p(x, y), *p(x + w, y + h)], radius=r * k, fill=couleur)

    if coins is not None:
        rect_arrondi(0, 0, 72, 72, coins, TUILE)
    rect_arrondi(12, 37, 48, 23, 6, VOLET_BAS)
    d.polygon([p(30, 56), p(36, 38), p(42, 56), p(50, 56), p(36, 18), p(22, 56)], fill=AMBRE)
    rect_arrondi(12, 12, 48, 23, 6, VOLET_HAUT)
    d.polygon([p(36, 18), p(42.5, 35), p(29.5, 35)], fill=AMBRE)
    d.rectangle([*p(10, 34), *p(62, 37)], fill=NUIT)
    return img.resize((taille, taille), Image.LANCZOS)


# iOS (et Android avant 8) : carré plein, sans transparence (l'App Store la refuse), couleur de la tuile ; le système
# arrondit les coins.
dessiner(1024, 1024 / 72, fond=TUILE).convert("RGB").save(f"{SORTIE}/icon-only.png", optimize=True)

# Icône adaptative Android : @capacitor/assets pose ce calque dans un cadre de 108 dp avec 16,7 % de marge (zone
# visible de 72 dp). Le logo tient dans un disque de 92 % du canevas, soit 66 dp sur 72 dp (zone sûre d'Android).
dessiner(1024, 12.5).save(f"{SORTIE}/icon-foreground.png", optimize=True)
Image.new("RGB", (1024, 1024), TUILE[:3]).save(f"{SORTIE}/icon-background.png", optimize=True)

# Écran de lancement : fond Nuit, logo de la planche Splash (168 px sur 390 px de large) centré. 1260 px = largeur
# du carré de 2732 px réellement visible sur un téléphone en portrait (recadrage « cover »).
ECHELLE_LOGO = (1260 * 168 / 390) / 72
splash = dessiner(2732, ECHELLE_LOGO, fond=NUIT, coins=20).convert("RGB")
splash.save(f"{SORTIE}/splash.png", optimize=True)
