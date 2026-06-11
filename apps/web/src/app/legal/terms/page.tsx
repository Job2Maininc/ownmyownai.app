import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — OwnMyOwnAI",
  description: "CGU du service OwnMyOwnAI — IA locale et Host Windows.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Conditions générales d'utilisation" updatedAt="11 juin 2025">
      <section>
        <h2>1. Objet</h2>
        <p>
          Les présentes conditions générales d&apos;utilisation (« CGU ») régissent l&apos;accès et
          l&apos;utilisation du service OwnMyOwnAI, comprenant le site web, le compte utilisateur et
          l&apos;application Host Windows (ci-après le « Service »).
        </p>
        <p>
          OwnMyOwnAI propose une solution d&apos;intelligence artificielle locale : les modèles et la
          majorité des données de conversation sont traités sur votre ordinateur via l&apos;application
          Host.
        </p>
      </section>

      <section>
        <h2>2. Accès au Service</h2>
        <p>
          Le Service est actuellement proposé <strong>gratuitement</strong> dans le cadre d&apos;une
          phase bêta. L&apos;accès nécessite la création d&apos;un compte (authentification par lien
          magique) et, pour utiliser l&apos;IA, l&apos;installation du Host sur un PC compatible
          (Windows 10 ou ultérieur recommandé).
        </p>
        <p>
          Nous nous réservons le droit de faire évoluer les modalités d&apos;accès, y compris
          l&apos;introduction d&apos;offres payantes à l&apos;avenir, avec un préavis raisonnable aux
          utilisateurs actifs.
        </p>
      </section>

      <section>
        <h2>3. Compte et sécurité</h2>
        <p>
          Vous êtes responsable de la confidentialité de votre adresse e-mail et de l&apos;accès à
          votre compte. Toute activité réalisée via votre compte est réputée effectuée par vous.
        </p>
        <p>
          En cas de suspicion d&apos;usage non autorisé, contactez-nous sans délai via les canaux
          indiqués sur le site.
        </p>
      </section>

      <section>
        <h2>4. Données et confidentialité</h2>
        <p>
          OwnMyOwnAI est conçu selon une approche <strong>local-first</strong> : les conversations,
          index de contexte et fichiers liés au Host sont stockés localement sur votre machine,
          sauf fonctionnalités cloud explicitement activées par vous (par ex. synchronisation ou
          authentification).
        </p>
        <p>
          Le traitement des données personnelles liées au compte web est décrit dans notre{" "}
          <a href="/legal/privacy">politique de confidentialité</a>.
        </p>
      </section>

      <section>
        <h2>5. Utilisation acceptable</h2>
        <p>Vous vous engagez à ne pas :</p>
        <ul>
          <li>utiliser le Service à des fins illégales ou portant atteinte aux droits de tiers ;</li>
          <li>tenter de contourner les mesures de sécurité du Service ou du Host ;</li>
          <li>surcharger intentionnellement l&apos;infrastructure (relay, API) ;</li>
          <li>revendre ou redistribuer le Service sans autorisation écrite.</li>
        </ul>
      </section>

      <section>
        <h2>6. Propriété intellectuelle</h2>
        <p>
          Le Service, sa marque, son interface et sa documentation restent la propriété de
          OwnMyOwnAI. Vous conservez la propriété de vos contenus (prompts, fichiers, conversations)
          générés ou importés via le Host.
        </p>
      </section>

      <section>
        <h2>7. Disponibilité et bêta</h2>
        <p>
          Le Service est fourni « en l&apos;état » pendant la phase bêta. Des interruptions,
          bugs ou évolutions majeures peuvent survenir. Nous nous efforçons de maintenir une
          expérience stable sans garantie de disponibilité continue.
        </p>
      </section>

      <section>
        <h2>8. Limitation de responsabilité</h2>
        <p>
          OwnMyOwnAI ne saurait être tenu responsable des dommages indirects, pertes de données
          locales non sauvegardées, ou décisions prises sur la base des réponses générées par les
          modèles d&apos;IA. Les sorties des modèles peuvent être inexactes : vérifiez les
          informations importantes.
        </p>
      </section>

      <section>
        <h2>9. Résiliation</h2>
        <p>
          Vous pouvez cesser d&apos;utiliser le Service à tout moment et demander la suppression de
          votre compte. Nous pouvons suspendre un compte en cas de violation des présentes CGU.
        </p>
      </section>

      <section>
        <h2>10. Droit applicable</h2>
        <p>
          Les présentes CGU sont soumises au droit français. En cas de litige, les tribunaux
          compétents seront ceux du ressort du siège de l&apos;éditeur, sous réserve des règles
          impératives de protection des consommateurs.
        </p>
      </section>
    </LegalDocument>
  );
}
