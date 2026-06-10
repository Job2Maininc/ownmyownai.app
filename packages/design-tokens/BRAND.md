# OwnMyOwnAI — Charte de marque « Chez vous »

## Positionnement

OwnMyOwnAI est une IA locale, privée et simple. La marque doit rassurer et rester accessible — pas un outil hacker, pas une banque froide.

**Tagline** : Votre IA vit chez vous.  
**Piliers** : Simple · Privé · Local

## Personnalité

| Trait | Expression |
|-------|------------|
| Rassurant | Formes arrondies, contrastes doux |
| Accessible | Typo lisible, hiérarchie claire |
| Local | Métaphore maison + nœud sur votre machine |
| Humain | Pas de terminal aesthetic |

## Couleurs — thème clair grand public

Source unique : `tokens.css` / `tokens.json`.

- Fond : `#F7FAF8` (blanc cassé chaud)
- Surface : `#FFFFFF` (cartes)
- Texte : `#1A2E26`
- Accent : `#0A9B6E` (vert accessible)
- Accent doux : `#E3F5ED` (fonds hero)
- Texte bouton primary : `#FFFFFF` sur fond accent

## Typographie

- **Sans** : Plus Jakarta Sans (400–700)
- **Mono** : IBM Plex Mono (code, pairing, logs)

## Logo

- **Pictogramme** : cercle (espace) + point central (PC) + arc (connexion locale)
- **Wordmark** : OwnMyOwn + AI en accent
- Fichiers : `apps/web/public/brand/`

## Contraste (WCAG AA)

Paires vérifiées (ratio ≥ 4.5:1 pour le corps, ≥ 3:1 pour les grands textes) :

| Avant-plan | Fond | Usage |
|------------|------|-------|
| `#1A2E26` | `#F7FAF8` | Texte corps |
| `#5F7068` | `#F7FAF8` | Texte secondaire |
| `#FFFFFF` | `#0A9B6E` | Bouton primary |
| `#0A9B6E` | `#FFFFFF` | Liens, accents sur cartes |

## Do / Don't

**Do** : tokens CSS, rayons 12px sur cartes web, ombres légères, copy en « vous ».  
**Don't** : vert néon `#10B981`, uppercase tracking-widest pour labels, couleurs hardcodées dans le JSX.

## Évolutions hors scope V1

- Mode clair
- Localisation EN
- Argumentaire écologique visuel
