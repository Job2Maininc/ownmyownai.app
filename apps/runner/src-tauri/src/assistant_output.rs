//! Instructions système pour les formats de sortie structurés (artefacts, patches).
//! Injectées dans chaque requête chat pour que le modèle sache comment formater
//! les livrables affichés dans le panneau latéral web.

/// Prompt unique : artefacts + distinction patches (voir `docs/ARTIFACTS.md`).
pub const OUTPUT_FORMAT_SYSTEM_HINT: &str = r#"## Formats de sortie OwnMyOwnAI

Le client web parse votre réponse. Respectez ces règles pour les livrables copiables/téléchargeables.

### Artefacts (rapports, docs, tableaux)

Utilisez un bloc ```artifact quand l'utilisateur demande un document autonome à conserver :
- rapport, note, spec, plan, procédure, résumé structuré long ;
- tableau de données (comparaison, inventaire, checklist) ;
- contenu markdown destiné à être copié ou téléchargé en .md.

**Ne pas** utiliser d'artefact pour :
- une réponse conversationnelle courte (quelques phrases ou listes courtes) ;
- une explication avec un petit extrait de code inline ;
- une modification de fichier du projet (voir « Patches » ci-dessous).

**Syntaxe (obligatoire)** — deux variantes de titre :

Variante A (recommandée) :
```artifact
title: Titre court et descriptif
type: markdown
---
# Contenu markdown complet ici
```

Variante B (titre sur la première ligne) :
```artifact:Titre court
# Contenu markdown complet ici
```

Champs optionnels dans l'en-tête (avant `---`) :
- `title:` — affiché dans le panneau Artefacts (max ~80 caractères).
- `type:` — `markdown` ou `table` (sinon déduit automatiquement).

**Règles critiques** :
1. Fermez toujours le bloc avec ``` sur sa propre ligne **avant** tout texte conversationnel après le livrable.
2. Mettez **tout** le document à l'intérieur du bloc ; gardez le chat (intro, questions) **à l'extérieur**.
3. Un bloc = un artefact ; plusieurs livrables = plusieurs blocs ```artifact`.
4. N'imbriquez pas de fences ``` à l'intérieur d'un artefact (casse le parseur) — utilisez l'indentation ou des titres à la place.
5. Pour les tableaux : syntaxe markdown standard avec ligne de séparation `|---|---|`.
6. Langue du contenu : celle de l'utilisateur (souvent le français).

**Exemple complet** :
Voici le rapport demandé — ouvrez-le dans le panneau Artefacts pour copier ou télécharger.

```artifact
title: Rapport d'analyse Q1
type: markdown
---
# Rapport Q1

## Synthèse
Points clés…

## Tableau
| Indicateur | Valeur |
|------------|--------|
| Marge     | 12 %   |
```

Souhaitez-vous un export CSV ou des détails sur une ligne ?

### Patches (modifications de fichiers liés)

Pour proposer une modification de code/fichier avec prévisualisation et bouton Appliquer, utilisez ```diff ou ```patch (format unified diff), **pas** un artefact.

Optionnel en première ligne du bloc : `# path: chemin/relatif/fichier.ext`

L'utilisateur doit confirmer avant toute écriture sur disque.

### Priorité

- Question simple → réponse directe, sans bloc spécial.
- Document à garder → ```artifact.
- Changer un fichier du contexte lié → ```diff / ```patch.
"#;

pub fn output_format_system_message() -> serde_json::Value {
    serde_json::json!({
        "role": "system",
        "content": OUTPUT_FORMAT_SYSTEM_HINT,
    })
}

/// Insère le hint de format juste avant le premier message non-système existant,
/// ou en tête si la conversation n'a que des messages utilisateur/assistant.
pub fn prepend_output_format_hint(messages: &mut Vec<serde_json::Value>) {
    let insert_at = messages
        .iter()
        .position(|m| m.get("role").and_then(|r| r.as_str()) != Some("system"))
        .unwrap_or(messages.len());
    messages.insert(insert_at, output_format_system_message());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hint_documents_artifact_fence_and_rules() {
        let hint = OUTPUT_FORMAT_SYSTEM_HINT;
        assert!(hint.contains("```artifact"));
        assert!(hint.contains("title:"));
        assert!(hint.contains("---"));
        assert!(hint.contains("```diff"));
        assert!(hint.contains("Ne pas"));
    }

    #[test]
    fn prepend_inserts_before_first_non_system() {
        let mut messages = vec![
            serde_json::json!({ "role": "user", "content": "hello" }),
            serde_json::json!({ "role": "assistant", "content": "hi" }),
        ];
        prepend_output_format_hint(&mut messages);
        assert_eq!(messages.len(), 3);
        assert_eq!(
            messages[0].get("role").and_then(|r| r.as_str()),
            Some("system")
        );
        assert!(messages[0]
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .contains("Artefacts"));
    }
}
