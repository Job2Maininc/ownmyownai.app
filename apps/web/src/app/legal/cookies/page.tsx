import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Politique cookies — OwnMyOwnAI",
  description: "Cookies et stockage local utilisés par OwnMyOwnAI.",
};

export default function CookiesPage() {
  return (
    <LegalDocument title="Politique cookies" updatedAt="11 juin 2025">
      <section>
        <h2>1. Qu&apos;est-ce qu&apos;un cookie ?</h2>
        <p>
          Un cookie est un petit fichier texte déposé sur votre navigateur lors de la visite d&apos;un
          site. OwnMyOwnAI utilise également le stockage local du navigateur pour certaines
          préférences d&apos;interface.
        </p>
      </section>

      <section>
        <h2>2. Cookies que nous utilisons</h2>
        <h3>Cookies strictement nécessaires</h3>
        <p>
          Ces cookies sont indispensables au fonctionnement du Service. Ils ne nécessitent pas votre
          consentement préalable au sens de la réglementation européenne.
        </p>
        <table>
          <thead>
            <tr>
              <th>Nom / type</th>
              <th>Finalité</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cookies d&apos;authentification Supabase</td>
              <td>Maintenir votre session connectée après le lien magique</td>
              <td>Session / selon configuration</td>
            </tr>
          </tbody>
        </table>

        <h3>Préférences locales (localStorage)</h3>
        <table>
          <thead>
            <tr>
              <th>Clé</th>
              <th>Finalité</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>omoa-theme</code>
              </td>
              <td>Mémoriser votre choix de thème clair ou sombre</td>
              <td>Jusqu&apos;à suppression manuelle</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>3. Cookies que nous n&apos;utilisons pas</h2>
        <p>
          OwnMyOwnAI ne déploie pas de cookies publicitaires, de reciblage ou de mesure d&apos;audience
          tiers (type Google Analytics) sur le site à ce jour.
        </p>
      </section>

      <section>
        <h2>4. Gestion de vos choix</h2>
        <p>
          Vous pouvez configurer votre navigateur pour refuser les cookies ; cela peut toutefois
          empêcher la connexion à votre compte.
        </p>
        <p>
          Pour le thème, vous pouvez basculer entre mode clair et sombre via le bouton dans
          l&apos;en-tête ; la préférence est enregistrée localement.
        </p>
      </section>

      <section>
        <h2>5. En savoir plus</h2>
        <p>
          Pour le traitement global de vos données, consultez notre{" "}
          <a href="/legal/privacy">politique de confidentialité</a>.
        </p>
      </section>
    </LegalDocument>
  );
}
