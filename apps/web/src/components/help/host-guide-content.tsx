import Link from "next/link";

const TABS = [
  { id: "etat", label: "État" },
  { id: "chat", label: "Chat local" },
  { id: "modeles", label: "Modèles" },
  { id: "cursor", label: "Cursor" },
  { id: "contexte", label: "Contexte" },
  { id: "revue", label: "Revue code" },
  { id: "projets", label: "Projets" },
  { id: "mcp", label: "MCP" },
  { id: "memoire", label: "Mémoire" },
  { id: "journal", label: "Journal" },
] as const;

export function HostGuideContent() {
  return (
    <>
      <section>
        <h2>Qu&apos;est-ce que le Host ?</h2>
        <p>
          Le <strong>Host</strong> est l&apos;application Windows OwnMyOwnAI (Tauri) installée sur
          votre PC. Il exécute Ollama, stocke vos conversations et votre contexte localement, et
          relie votre navigateur au modèle via un relay sécurisé. Rien ne transite par nos serveurs
          sauf l&apos;authentification et le pairing.
        </p>
        <p>
          Après installation depuis la page{" "}
          <Link href="/download">Télécharger</Link>, liez le Host à votre compte web via un code de
          pairing, puis ouvrez l&apos;application pour accéder au tableau de bord local.
        </p>
      </section>

      <section>
        <h2>Navigation</h2>
        <p>
          Le tableau de bord Host est organisé en dix onglets. Cliquez sur un lien ci-dessous pour
          accéder directement à la section correspondante :
        </p>
        <ul>
          {TABS.map((tab) => (
            <li key={tab.id}>
              <a href={`#${tab.id}`}>{tab.label}</a>
            </li>
          ))}
        </ul>
      </section>

      <section id="etat">
        <h2>État</h2>
        <p>
          L&apos;onglet <strong>État</strong> est votre centre de contrôle. Il affiche en temps
          réel la santé des services et les métriques de la dernière génération.
        </p>
        <h3>Indicateurs de service</h3>
        <ul>
          <li>
            <strong>Ollama</strong> — moteur d&apos;inférence local. Doit être « actif » avec au
            moins un modèle chargé.
          </li>
          <li>
            <strong>Relay</strong> — connexion WebSocket vers le relay cloud, qui permet au chat web
            de communiquer avec votre PC.
          </li>
          <li>
            <strong>Cloud</strong> — synchronisation du heartbeat avec le plan de contrôle (compte,
            métadonnées Host).
          </li>
        </ul>
        <h3>Métriques et modèles</h3>
        <p>
          Après une génération, vous voyez les <strong>tokens/s</strong>, la{" "}
          <strong>latence</strong> et la <strong>RAM utilisée</strong>. La liste des modèles chargés
          indique lequel est défini par défaut.
        </p>
        <h3>Clients connectés</h3>
        <p>
          Affiche le nombre d&apos;onglets web ouverts et les sessions de génération en cours sur
          votre machine.
        </p>
        <h3>Mises à jour</h3>
        <p>
          Vérifiez et installez les mises à jour du Host. La vérification est automatique au
          démarrage puis toutes les heures.
        </p>
        <h3>Mode air-gapped</h3>
        <p>
          Activez le mode air-gapped pour désactiver le relay et le cloud : seul le chat local
          reste disponible. Utile sur un réseau isolé ou pour une utilisation 100 % hors ligne après
          configuration initiale.
        </p>
        <h3>Identifiant host</h3>
        <p>
          Copiez l&apos;identifiant unique de votre machine pour le support ou le diagnostic. Le
          bouton <strong>Délier ce PC</strong> supprime le pairing : vous devrez refaire la liaison
          depuis le web.
        </p>
      </section>

      <section id="chat">
        <h2>Chat local</h2>
        <p>
          L&apos;onglet <strong>Chat local</strong> permet de converser directement avec le modèle
          par défaut, sans passer par le navigateur. Idéal pour tester un modèle ou discuter hors
          ligne.
        </p>
        <ul>
          <li>
            Saisissez votre message et envoyez avec <kbd>Ctrl+Entrée</kbd> (ou{" "}
            <kbd>⌘+Entrée</kbd> sur Mac si vous utilisez un clavier adapté).
          </li>
          <li>La réponse s&apos;affiche en streaming, token par token.</li>
          <li>
            Le chat local utilise le même pipeline que le web (modèle par défaut, contexte actif) mais
            ne nécessite pas de connexion relay.
          </li>
          <li>
            Si Ollama est arrêté, un message d&apos;erreur s&apos;affiche — retournez à l&apos;onglet
            État pour vérifier le service.
          </li>
        </ul>
      </section>

      <section id="modeles">
        <h2>Modèles</h2>
        <p>
          L&apos;onglet <strong>Modèles</strong> gère tout ce qui concerne Ollama : téléchargement,
          sélection du modèle par défaut, routage par tâche et fournisseurs cloud optionnels.
        </p>
        <h3>Fournisseurs cloud (optionnel)</h3>
        <p>
          En haut de l&apos;onglet, le panneau <strong>Fournisseurs cloud</strong> permet
          d&apos;activer OpenAI ou Anthropic. Les clés API sont stockées dans le keyring Windows du
          Host — elles ne sont jamais exposées au navigateur ni au relay. Les modèles cloud
          (préfixe <code>openai:</code> ou <code>anthropic:</code>) sont routés depuis le Host
          uniquement.
        </p>
        <h3>Catalogue et installation</h3>
        <ul>
          <li>
            Parcourez les modèles recommandés par catégorie : Chat, Code, Vision, Embedding.
          </li>
          <li>
            La bannière de <strong>conseil de quantification</strong> suggère un format adapté à
            votre RAM et GPU.
          </li>
          <li>
            Cliquez sur <strong>Télécharger</strong> pour lancer un <code>ollama pull</code> ; la
            progression s&apos;affiche en direct.
          </li>
          <li>
            Saisissez un nom de modèle personnalisé (ex. <code>llama3.2:3b</code>) pour tirer un
            modèle du registre Ollama.
          </li>
        </ul>
        <h3>Modèle par défaut et fallback</h3>
        <p>
          Définissez le modèle utilisé par défaut pour le chat. Le sélecteur de{" "}
          <strong>fallback</strong> choisit un modèle de secours si le principal est indisponible.
        </p>
        <h3>Routage par tâche</h3>
        <p>
          Assignez un modèle différent selon le type de requête (chat général, code, vision,
          embedding). Le Host sélectionne automatiquement le bon modèle selon le contexte de la
          conversation.
        </p>
      </section>

      <section id="cursor">
        <h2>Cursor</h2>
        <p>
          L&apos;onglet <strong>Cursor</strong> configure la passerelle OpenAI-compatible exposée
          par le Host pour l&apos;IDE Cursor. Consultez aussi la page dédiée{" "}
          <Link href="/cursor">Cursor + OwnMyOwnAI</Link> pour les trois chemins
          d&apos;intégration.
        </p>
        <h3>Passerelle Host (recommandé)</h3>
        <ol>
          <li>Activez <strong>Gateway Cursor</strong> dans cet onglet.</li>
          <li>
            Copiez l&apos;URL de base (<code>http://127.0.0.1:8765/v1</code> par défaut) et le
            token Bearer généré.
          </li>
          <li>
            Dans Cursor → Settings → Models, activez « Override OpenAI Base URL » et collez ces
            valeurs.
          </li>
          <li>
            Choisissez un modèle local installé — le pipeline OwnMyOwnAI (RAG, règles projet, mémoire)
            s&apos;applique automatiquement.
          </li>
        </ol>
        <p>
          Avantage : 0 crédit Cursor cloud, contexte local injecté, file d&apos;attente partagée avec
          le chat web.
        </p>
      </section>

      <section id="contexte">
        <h2>Contexte</h2>
        <p>
          L&apos;onglet <strong>Contexte</strong> alimente le RAG (Retrieval-Augmented Generation) :
          vos fichiers, dossiers et dépôts sont indexés localement pour enrichir les réponses du
          modèle.
        </p>
        <h3>Bases de connaissances</h3>
        <p>
          Créez une ou plusieurs bases. Chaque base regroupe des documents indexés et peut avoir une
          instruction système dédiée.
        </p>
        <h3>Types de sources</h3>
        <ul>
          <li>
            <strong>Fichiers</strong> — un ou plusieurs fichiers (.txt, .md, .pdf, .docx, images
            .png/.jpg).
          </li>
          <li>
            <strong>Dossier</strong> — un répertoire et ses sous-dossiers, avec extensions
            filtrables.
          </li>
          <li>
            <strong>Dépôt Git</strong> — code source avec index des symboles pour une recherche
            précise.
          </li>
          <li>
            <strong>Disque entier</strong> — lecteur C:, D:, clé USB, etc.
          </li>
        </ul>
        <h3>Synchronisation</h3>
        <ul>
          <li>
            <strong>Sync manuelle</strong> — relance l&apos;indexation immédiatement.
          </li>
          <li>
            <strong>Watcher</strong> — détecte les modifications de fichiers en temps réel (debounce
            automatique).
          </li>
          <li>
            <strong>Sync planifiée</strong> — cron configurable avec rapport dans les journaux.
          </li>
        </ul>
        <h3>Seuil RAG</h3>
        <p>
          Ajustez le score minimum de pertinence : un seuil plus élevé injecte moins de contexte mais
          plus ciblé ; un seuil basse inclut davantage de passages.
        </p>
        <h3>Upload direct</h3>
        <p>
          Glissez-déposez ou sélectionnez des fichiers pour les indexer sans lien permanent vers le
          disque.
        </p>
      </section>

      <section id="revue">
        <h2>Revue code</h2>
        <p>
          L&apos;onglet <strong>Revue code</strong> analyse vos changements Git et produit un
          rapport de revue assisté par IA, avec contrôles de sécurité statiques.
        </p>
        <h3>Modes de revue</h3>
        <ul>
          <li>
            <strong>Modifications en cours</strong> — fichiers modifiés non stagés (
            <code>git diff</code>).
          </li>
          <li>
            <strong>Prêt à committer</strong> — contenu de l&apos;index (<code>git diff --staged</code>
            ).
          </li>
          <li>
            <strong>Dernier commit</strong> — changements du dernier commit (<code>HEAD</code>).
          </li>
          <li>
            <strong>Pull request GitHub</strong> — nécessite <code>gh</code> CLI installé et
            authentifié ; saisissez le numéro de PR.
          </li>
        </ul>
        <h3>Résultat</h3>
        <p>Chaque revue affiche :</p>
        <ul>
          <li>statistiques du diff (fichiers, lignes ajoutées/supprimées) ;</li>
          <li>findings de sécurité (secrets, patterns à risque) ;</li>
          <li>checklist statique ;</li>
          <li>revue narrative générée par le modèle.</li>
        </ul>
        <p>
          Les dépôts Git doivent être liés comme source dans l&apos;onglet Contexte pour apparaître
          dans la liste.
        </p>
      </section>

      <section id="projets">
        <h2>Projets</h2>
        <p>
          L&apos;onglet <strong>Projets</strong> organise votre travail en espaces dédiés. Un projet
          regroupe des bases de contexte et des instructions système propres.
        </p>
        <ul>
          <li>
            <strong>Créer un projet</strong> — donnez un nom et une description.
          </li>
          <li>
            <strong>Activer un projet</strong> — active en un clic toutes ses bases de connaissances
            liées.
          </li>
          <li>
            <strong>Instruction système</strong> — texte injecté à chaque conversation du projet
            (comportement, ton, contraintes).
          </li>
          <li>
            <strong>Règles automatiques</strong> — le Host lit <code>.ownmyownai/rules.md</code> ou{" "}
            <code>.cursorrules</code> dans les dossiers liés et les injecte au chat.
          </li>
          <li>
            <strong>Suppression</strong> — efface le projet sans supprimer les bases de contexte
            sous-jacentes.
          </li>
        </ul>
        <p>
          Sur le web, la liste des projets est en lecture seule ; la création et la configuration
          complète se font depuis le Host.
        </p>
      </section>

      <section id="mcp">
        <h2>MCP</h2>
        <p>
          L&apos;onglet <strong>MCP</strong> (Model Context Protocol) permet de connecter des
          serveurs d&apos;outils externes que le modèle peut appeler pendant une conversation.
        </p>
        <h3>Serveur fichiers intégré</h3>
        <p>
          Un serveur MCP filesystem est fourni par défaut pour lire et explorer les fichiers locaux
          autorisés.
        </p>
        <h3>Ajouter un serveur</h3>
        <ol>
          <li>Cliquez sur <strong>Ajouter un serveur</strong>.</li>
          <li>
            Renseignez le nom, la commande (<code>npx</code>, <code>node</code>, <code>uv</code>,{" "}
            <code>python</code>…) et les arguments (un par ligne).
          </li>
          <li>
            Ajoutez des variables d&apos;environnement si nécessaire (<code>CLE=valeur</code>, une
            par ligne).
          </li>
          <li>Activez ou désactivez le serveur sans le supprimer.</li>
        </ol>
        <p>
          Les serveurs MCP tournent en processus locaux lancés par le Host. Seules les commandes
          autorisées sont acceptées pour des raisons de sécurité.
        </p>
      </section>

      <section id="memoire">
        <h2>Mémoire</h2>
        <p>
          L&apos;onglet <strong>Mémoire</strong> stocke des faits persistants sur vous (préférences,
          contexte professionnel, habitudes) injectés sélectivement dans le chat.
        </p>
        <ul>
          <li>
            <strong>Toggle global</strong> — active ou désactive l&apos;injection de mémoire dans
            toutes les conversations.
          </li>
          <li>
            <strong>Ajouter un fait</strong> — texte court (max 500 caractères, jusqu&apos;à 100
            faits).
          </li>
          <li>
            <strong>Suppression</strong> — retire un fait individuellement.
          </li>
          <li>
            <strong>Injection sélective</strong> — seuls les faits dont les mots-clés correspondent
            à votre question sont inclus (pas de dump complet à chaque message).
          </li>
        </ul>
        <p>
          Les faits sont stockés dans <code>context.db</code> sur votre PC, chiffré au repos via
          DPAPI Windows.
        </p>
      </section>

      <section id="journal">
        <h2>Journal</h2>
        <p>
          L&apos;onglet <strong>Journal</strong> (audit trail) enregistre les actions sensibles
          effectuées par le Host pour la traçabilité locale.
        </p>
        <h3>Types d&apos;événements</h3>
        <ul>
          <li>
            <strong>Indexation</strong> — documents ajoutés ou réindexés.
          </li>
          <li>
            <strong>Erreur d&apos;indexation</strong> — échecs de parsing ou d&apos;embedding.
          </li>
          <li>
            <strong>Suppression</strong> — documents ou bases retirés.
          </li>
          <li>
            <strong>Accès agent</strong> — appels d&apos;outils ou accès MCP pendant une session.
          </li>
        </ul>
        <p>
          Filtrez par type d&apos;action pour diagnostiquer un problème d&apos;indexation ou
          vérifier qu&apos;un agent n&apos;a accédé qu&apos;aux ressources attendues. Les entrées
          restent locales — elles ne sont pas envoyées au cloud.
        </p>
      </section>

      <section>
        <h2>Raccourcis et chat web</h2>
        <p>
          Depuis le navigateur (après pairing), le chat web offre des raccourcis complémentaires :
        </p>
        <ul>
          <li>
            <kbd>Ctrl+K</kbd> / <kbd>⌘+K</kbd> — palette de commandes globale.
          </li>
          <li>
            <kbd>Ctrl+Entrée</kbd> / <kbd>⌘+Entrée</kbd> — envoyer un message.
          </li>
          <li>Mode réflexion — affiche la chaîne de pensée du modèle dans un panneau repliable.</li>
          <li>Export, partage lecture seule, branches de conversation depuis la palette.</li>
        </ul>
      </section>

      <section>
        <h2>Besoin d&apos;aide supplémentaire ?</h2>
        <ul>
          <li>
            <Link href="/download">Télécharger le Host</Link>
          </li>
          <li>
            <Link href="/cursor">Intégration Cursor</Link>
          </li>
          <li>
            <Link href="/host/link">Lier un Host à votre compte</Link>
          </li>
          <li>
            <Link href="/dashboard">Tableau de bord web</Link>
          </li>
        </ul>
      </section>
    </>
  );
}
