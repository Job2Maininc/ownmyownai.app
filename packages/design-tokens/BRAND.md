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

## Couleurs

Source unique : `tokens.css` / `tokens.json`.

- Fond : `#131712` (charbon vert chaud)
- Accent : `#4EC9A0` (teal doux)
- Chaleur : `#E8B88A` (highlights secondaires)
- Texte bouton primary : `#0D1510` sur fond accent

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
| `#F2F5F0` | `#131712` | Texte corps |
| `#9BA89E` | `#131712` | Texte secondaire |
| `#0D1510` | `#4EC9A0` | Bouton primary |
| `#4EC9A0` | `#131712` | Liens, accents |

## Do / Don't

**Do** : tokens CSS, rayons 12px sur cartes web, ombres légères, copy en « vous ».  
**Don't** : vert néon `#10B981`, uppercase tracking-widest pour labels, couleurs hardcodées dans le JSX.

## Évolutions hors scope V1

- Mode clair
- Localisation EN
- Argumentaire écologique visuel
