import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Politique de confidentialité — OwnMyOwnAI",
  description: "Comment OwnMyOwnAI traite vos données — approche local-first.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Politique de confidentialité" updatedAt="11 juin 2025">
      <section>
        <h2>1. Responsable du traitement</h2>
        <p>
          OwnMyOwnAI (« nous ») est responsable du traitement des données personnelles collectées
          via le site web et les services associés au compte utilisateur.
        </p>
      </section>

      <section>
        <h2>2. Philosophie local-first</h2>
        <p>
          OwnMyOwnAI est conçu pour que l&apos;essentiel de votre activité IA reste sur votre PC :
        </p>
        <ul>
          <li>conversations et historique gérés par le Host (stockage local SQLite) ;</li>
          <li>index de contexte, embeddings et fichiers liés stockés localement ;</li>
          <li>inférence des modèles via Ollama sur votre machine.</li>
        </ul>
        <p>
          Le cloud intervient principalement pour l&apos;authentification, la liaison Host ↔ compte
          (pairing) et, le cas échéant, le relais de messages entre navigateur et Host.
        </p>
      </section>

      <section>
        <h2>3. Données collectées</h2>
        <h3>Compte web</h3>
        <ul>
          <li>adresse e-mail (connexion par lien magique) ;</li>
          <li>identifiants techniques de session (cookies d&apos;authentification) ;</li>
          <li>métadonnées des Hosts liés (nom, identifiant, état de connexion).</li>
        </ul>
        <h3>Host local</h3>
        <p>
          Les données traitées sur votre PC (conversations, contexte, journaux locaux) ne sont pas
          transmises à nos serveurs sauf si vous activez explicitement une fonctionnalité qui le
          requiert (ex. partage lecture seule, synchronisation cloud).
        </p>
      </section>

      <section>
        <h2>4. Finalités et bases légales</h2>
        <ul>
          <li>
            <strong>Fourniture du Service</strong> — création de compte, pairing, accès au dashboard
            (exécution du contrat).
          </li>
          <li>
            <strong>Sécurité</strong> — prévention des abus, intégrité du relay (intérêt légitime).
          </li>
          <li>
            <strong>Amélioration produit</strong> — statistiques agrégées et anonymisées lorsque
            applicable (intérêt légitime, avec minimisation des données).
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Durée de conservation</h2>
        <p>
          Les données de compte sont conservées tant que votre compte est actif. Sur demande de
          suppression, nous effaçons les données cloud associées dans un délai raisonnable, hors
          obligations légales de conservation.
        </p>
        <p>
          Les données locales sur le Host restent sous votre contrôle ; vous pouvez les supprimer
          en désinstallant l&apos;application ou en effaçant les données depuis l&apos;interface Host.
        </p>
      </section>

      <section>
        <h2>6. Sous-traitants</h2>
        <p>Nous pouvons faire appel à des prestataires pour :</p>
        <ul>
          <li>hébergement du site et des fonctions serveur ;</li>
          <li>authentification et base de données (ex. Supabase) ;</li>
          <li>distribution des installateurs (ex. GitHub Releases).</li>
        </ul>
        <p>
          Ces prestataires n&apos;accèdent qu&apos;aux données nécessaires à leur mission et sont
          soumis à des obligations contractuelles de confidentialité.
        </p>
      </section>

      <section>
        <h2>7. Vos droits (RGPD)</h2>
        <p>
          Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement, de limitation,
          d&apos;opposition et de portabilité concernant vos données personnelles. Pour les exercer,
          contactez-nous via le site.
        </p>
        <p>
          Vous pouvez également introduire une réclamation auprès de la CNIL (
          <a href="https://www.cnil.fr" rel="noopener noreferrer" target="_blank">
            www.cnil.fr
          </a>
          ).
        </p>
      </section>

      <section>
        <h2>8. Transferts hors UE</h2>
        <p>
          Si certains sous-traitants sont situés hors de l&apos;Espace économique européen, nous
          veillons à ce que des garanties appropriées (clauses contractuelles types, etc.) soient en
          place.
        </p>
      </section>

      <section>
        <h2>9. Modifications</h2>
        <p>
          Cette politique peut être mise à jour. La date de dernière révision figure en tête de page.
          Les changements substantiels vous seront signalés de manière appropriée.
        </p>
      </section>
    </LegalDocument>
  );
}
