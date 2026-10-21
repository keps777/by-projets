package com.afrimove.app;

import android.os.Bundle;
import android.view.View;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Activité unique : le WebView de Capacitor qui charge le build web (dist/) embarqué.
 *
 * Seul ajout : les marges des barres système. Depuis Android 15 (ciblage API 35 et plus) l'application passe sous la
 * barre d'état et la barre de gestes. L'interface web n'utilise pas encore env(safe-area-inset-*), donc la fenêtre
 * elle-même reçoit ces marges (comme le ferait le mode « native » de Capacitor sur les vieux WebView) et le WebView ne
 * voit plus aucune zone sûre : même rendu sur tous les Android, quelle que soit la version du WebView.
 * Le clavier à l'écran réduit la hauteur utile (le `interactive-widget=resizes-content` d'index.html en dépend).
 */
public class MainActivity extends BridgeActivity {

    private static final int BARRES_ET_ENCOCHE =
        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        View fenetre = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(fenetre, (vue, insets) -> {
            Insets barres = insets.getInsets(BARRES_ET_ENCOCHE);
            Insets clavier = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean clavierVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            vue.setPadding(barres.left, barres.top, barres.right, clavierVisible ? clavier.bottom : barres.bottom);

            // Zones sûres remises à zéro pour le WebView (même méthode que Capacitor : CONSUMED casse leur recalcul).
            return new WindowInsetsCompat.Builder(insets).setInsets(BARRES_ET_ENCOCHE, Insets.NONE).build();
        });
        ViewCompat.requestApplyInsets(fenetre);
    }
}
