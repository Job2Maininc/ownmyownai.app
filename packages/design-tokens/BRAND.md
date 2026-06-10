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

## Couleurs — blanc pur

Source unique : `tokens.css` / `tokens.json`.

- Fond : `#FFFFFF`
- Texte : `#171717`
- Bordures : `#E5E5E5`
- Boutons : `#171717` (noir) sur blanc
- Liens : `#2563EB` (bleu)
- Sections alternées : `#FAFAFA`

## Typographie

- **Sans** : Plus Jakarta Sans (400–700)
- **Mono** : IBM Plex Mono (code, pairing, logs)

## Logo

- **Pictogramme** : maison arrondie + nœud IA vert (icône app)
- **Wordmark** : OwnMyOwn + AI en accent (typographie Plus Jakarta Sans)
- Fichiers : `apps/web/public/brand/icon.png`, `hero.png`
- Composant : `BrandMark` (icône PNG + texte)

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
