import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import { MeasurementConsentChoice } from "@/features/privacy/MeasurementConsentChoice";
import "./legal.css";
import { LegalArticle } from "./LegalArticle";
import { ShieldCheck } from "lucide-react";

/** Public Privacy Policy — also served as static HTML at GET /legal/privacy-policy. */
export function PrivacyPolicyPage() {
  return (
    <div className="legal-shell legal-shell--privacy">
      <header className="legal-header">
        <div className="legal-header-inner">
          <Link to="/" className="legal-logo-link" aria-label="ShelfMerch home">
            <ShelfMerchLogo height={36} />
          </Link>
          <nav className="legal-nav" aria-label="Legal">
            <Link to="/legal/terms-of-service">Terms of Service</Link>
            <Link to="/login">Sign in</Link>
            <Link to="/">Home</Link>
          </nav>
        </div>
      </header>

      <main className="legal-main">
        <header className="legal-hero">
          <span className="legal-eyebrow"><ShieldCheck size={20} aria-hidden="true" /> YOUR DATA, EXPLAINED CLEARLY</span>
          <h1>Privacy <em>Policy</em></h1>
          <p className="legal-updated">Last updated: 26 October 2026</p>
        </header>
        <LegalArticle>

          <p className="legal-intro">
            This Privacy Policy describes how <strong>Chitlu Innovations Private Limited</strong> (“
            <strong>Chitlu</strong>”, “<strong>we</strong>”, “<strong>us</strong>”, or “
            <strong>our</strong>”) collects, uses, stores, and shares personal information in connection
            with <strong>ShelfMerch</strong> (the “<strong>Service</strong>”), including the{" "}
            <strong>ShelfMerch for Zoho People</strong> integration, available at{" "}
            <a href="https://shelfmerch.io">https://shelfmerch.io</a>.
          </p>
          <p>
            This policy is intended for organisations that use ShelfMerch and for individuals whose
            information is processed through ShelfMerch (for example, employees synced from Zoho People).
            Where ShelfMerch processes employee data on behalf of a customer organisation, that
            organisation is typically the controller of the employee data, and ShelfMerch acts as a
            processor or service provider — subject to the customer’s instructions and applicable law.{" "}
            <em>
              (Legal review recommended for controller/processor characterisation in your
              jurisdictions.)
            </em>
          </p>

          <h2 id="information-we-collect">1. Information We Collect</h2>
          <p>
            Depending on how ShelfMerch is used, we may process the following categories of information:
          </p>

          <h3>Account and organisation information</h3>
          <ul>
            <li>ShelfMerch user identifiers and profile details associated with signed-in users</li>
            <li>Tenant / company (workspace) identifiers and related organisation metadata</li>
            <li>Role and permission information used to enforce access control</li>
          </ul>

          <h3>Employee and contact information</h3>
          <p>
            ShelfMerch stores contact records that customers create manually, import (for example via
            CSV), or sync from connected systems such as Zoho People. Contact fields may include name,
            work email, phone number (when provided through ShelfMerch features other than Zoho sync),
            department, employee code, designation, work location, date of joining, employment status,
            shipping address fields, and related contact metadata.
          </p>

          <h3>Zoho People integration data</h3>
          <p>
            When a customer connects ShelfMerch for Zoho People, ShelfMerch processes the data described
            in <a href="#zoho-people-integration">Section 3</a>.
          </p>

          <h3>Security and technical logs</h3>
          <ul>
            <li>Request identifiers used to correlate support and security investigations</li>
            <li>
              IP address information recorded in application HTTP access logs and used for rate limiting
            </li>
          </ul>
          <p>
            ShelfMerch’s current HTTP logging configuration does not record browser or device user-agent
            strings as a dedicated logged field.
          </p>

          <h2 id="how-we-use-information">2. How We Use Information</h2>
          <p>We use personal information to:</p>
          <ul>
            <li>Connect ShelfMerch with Zoho People at a customer’s request</li>
            <li>Import and update employee records in the customer’s ShelfMerch workspace</li>
            <li>Help customers prepare employee onboarding kits, rewards, and corporate gifts</li>
            <li>
              Prevent duplicate employee records within a tenant (for example by Zoho record ID and email
              matching)
            </li>
            <li>Maintain integration security, including encrypted token storage and access controls</li>
            <li>Provide troubleshooting and customer support</li>
            <li>Meet legal and compliance obligations</li>
            <li>Operate, maintain, and improve the ShelfMerch Service</li>
          </ul>

          <h2 id="zoho-people-integration">3. Zoho People Integration</h2>
          <p>
            ShelfMerch for Zoho People allows a company administrator to authorise ShelfMerch to read
            organisation and employee form data from Zoho People using OAuth. The integration requests
            Zoho People read scopes for forms and organisation information.
          </p>
          <p>When connected, ShelfMerch may process:</p>
          <ul>
            <li>Employee name (including first name, last name, and derived display name)</li>
            <li>Work email address</li>
            <li>Employee ID / employee code and Zoho record ID</li>
            <li>
              Employment-related fields used for syncing, such as department, designation, work location,
              date of joining, and employment status
            </li>
            <li>
              Zoho organisation / company identifiers and organisation name (when returned by Zoho)
            </li>
            <li>ShelfMerch user and tenant identifiers associated with the connection</li>
            <li>Integration connection status, connected timestamps, and last-sync information</li>
            <li>Encrypted Zoho OAuth access and refresh tokens (see Section 4)</li>
          </ul>
          <p>
            The Zoho People sync implementation does <strong>not</strong> currently import work phone
            numbers from Zoho into ShelfMerch contact records. Phone numbers may still appear on
            ShelfMerch contacts if they were entered or imported through other ShelfMerch features.
          </p>
          <p>
            Employee information synced into ShelfMerch is stored in the customer’s tenant-scoped
            workspace and is <strong>not displayed publicly</strong> on the ShelfMerch marketing website.
          </p>

          <h2 id="oauth-tokens">4. OAuth Tokens and Account Access</h2>
          <ul>
            <li>
              Zoho OAuth access and refresh tokens are stored <strong>encrypted at rest</strong> using
              application-managed encryption.
            </li>
            <li>
              Zoho OAuth tokens are <strong>not exposed to browser JavaScript</strong> through
              ShelfMerch’s public Zoho status APIs.
            </li>
            <li>
              Tokens are used only to call Zoho People APIs needed for organisation verification and
              employee sync.
            </li>
            <li>
              Access to connect, sync, and disconnect Zoho People is restricted by tenant and company
              permissions (company administrators manage the connection).
            </li>
          </ul>

          <h2 id="how-we-share-information">5. How We Share Information</h2>
          <p>We may share personal information only as needed to operate the Service, including:</p>
          <ul>
            <li>With the customer organisation that owns the relevant ShelfMerch workspace</li>
            <li>With service providers that host or support the Service (see Section 6)</li>
            <li>
              With Zoho, when a customer authorises the Zoho People integration and ShelfMerch calls Zoho
              APIs on the customer’s behalf
            </li>
            <li>
              When required by law, regulation, legal process, or to protect rights, safety, and security
            </li>
            <li>
              In connection with a corporate transaction such as a merger or acquisition, subject to
              appropriate safeguards
            </li>
          </ul>
          <p>
            <strong>ShelfMerch does not sell employee personal data.</strong>{" "}
            <em>
              (Legal review recommended if “sale” / “share” has a specific statutory definition in your
              markets, such as under CCPA/CPRA.)
            </em>
          </p>

          <h2 id="service-providers">6. Service Providers</h2>
          <p>
            We use infrastructure and operational service providers (for example cloud hosting,
            databases, email delivery, and observability tooling) to run ShelfMerch. These providers
            process data only as needed to provide their services to us and are expected to protect it
            under appropriate contractual and technical measures.
          </p>

          <h2 id="data-storage-and-security">7. Data Storage and Security</h2>
          <p>
            We implement technical and organisational measures designed to protect personal information,
            including encryption of Zoho OAuth tokens at rest, HTTPS for network transport in production
            deployments, tenant-scoped data access, and role-based permissions.
          </p>
          <p>
            No method of transmission or storage is completely secure. We do not promise absolute
            security, and customers should use strong account controls and promptly report suspected
            unauthorised access to{" "}
            <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>.
          </p>

          <h2 id="data-retention">8. Data Retention</h2>
          <p>
            We retain personal information for as long as needed to provide the Service to the customer,
            to maintain security and auditability, and as required by applicable legal obligations.
            Specific retention periods may vary by data category and customer configuration.{" "}
            <em>(Legal review recommended before publishing fixed retention periods.)</em>
          </p>

          <h2 id="disconnecting-zoho-people">9. Disconnecting Zoho People</h2>
          <p>A company administrator can disconnect Zoho People from ShelfMerch. Disconnecting:</p>
          <ul>
            <li>
              Asks Zoho to revoke the refresh token. The access token is cleared immediately. The
              encrypted refresh token is deleted when Zoho confirms revocation or reports that token
              invalid. If Zoho cannot confirm revocation, the ciphertext stays unused and marked
              unresolved so it can be revoked later without storing the token in plaintext
            </li>
            <li>Stops further Zoho People syncing for that connection</li>
            <li>
              Does not automatically delete previously imported employee contacts or related ShelfMerch
              records
            </li>
          </ul>
          <p>
            Previously imported data may remain until deleted according to the customer’s instructions
            and ShelfMerch retention requirements.
          </p>

          <h2 id="data-deletion-requests">10. Data Deletion Requests</h2>
          <p>
            Customers and authorised individuals may contact{" "}
            <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a> to request:
          </p>
          <ul>
            <li>Access to stored information</li>
            <li>Correction of inaccurate information</li>
            <li>Export of information</li>
            <li>Deletion of information</li>
            <li>Integration disconnection</li>
          </ul>
          <p>
            We may need to verify identity and authority before processing organisation or employee-data
            requests. Where ShelfMerch processes employee data for a customer organisation, some requests
            may need to be handled by or with that organisation. Deletion may be soft-deleted or staged
            according to product capabilities and legal holds; we do not guarantee immediate irreversible
            deletion in every case.
          </p>

          <h2 id="international-data-transfers">11. International Data Transfers</h2>
          <p>
            ShelfMerch may process and store information in India and in other countries where we or our
            service providers operate. Where required, we use appropriate safeguards for cross-border
            transfers.{" "}
            <em>
              (Legal review recommended for transfer mechanisms applicable to your customers.)
            </em>
          </p>

          <h2 id="user-and-organisation-rights">12. User and Organisation Rights</h2>
          <p>
            Depending on applicable law, individuals and customer organisations may have rights to
            access, correct, delete, restrict, or export personal information, and to object to certain
            processing. To exercise these rights, contact{" "}
            <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>. We may redirect employee
            requests to the relevant customer organisation when that organisation controls the data.
          </p>

          <h2 id="childrens-privacy">13. Children’s Privacy</h2>
          <p>
            ShelfMerch is a business service and is not directed to children. We do not knowingly collect
            personal information from children for the purpose of offering the Service to them. If you
            believe a child has provided personal information to us inappropriately, contact{" "}
            <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>.
          </p>

          <h2 id="changes">14. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The “Last updated” date at the top of
            this page will change when we do. Material changes may also be communicated through the
            Service or by email where appropriate. Continued use of ShelfMerch after an update means the
            updated policy applies to that use, except where applicable law requires additional consent
            or notice.
          </p>

          <h2 id="contact-us">15. Contact Us</h2>
          <p>For privacy questions, data requests, or integration concerns:</p>
          <ul>
            <li>
              <strong>Legal entity:</strong> Chitlu Innovations Private Limited
            </li>
            <li>
              <strong>Product:</strong> ShelfMerch
            </li>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>
            </li>
            <li>
              <strong>Website:</strong> <a href="https://shelfmerch.io">https://shelfmerch.io</a>
            </li>
          </ul>

          <h2 id="cookies">Cookies and similar technology</h2>
          <p>
            Essential cookies support session continuity, security, preferences, and authentication. Those
            cookies are not optional. Google Analytics 4 and the Meta pixel are loaded through the existing
            Google Tag Manager container only after you allow the matching category. Until you choose, and
            if you reject optional measurement, that container is not requested.
          </p>
          <p>
            The OpenAI measurement pixel is a separate optional tag. It records a saved demo request or a
            finished registration with an event id. The event Shelf Merch creates does not include your
            name, email, phone number, or verification code. If Shelf Merch enables the pixel, OpenAI
            automatic advanced matching hashes recognizable form details in your browser. OpenAI does not
            provide a supported way to turn that hashing off. The pixel stays unloaded until you allow
            advertising measurement and Shelf Merch has explicitly accepted that behavior. OpenAI may then
            store __oppref for about 30 days and __obref for about 365 days. Withdrawing advertising
            consent stops later OpenAI measurement.
          </p>

          <MeasurementConsentChoice />

          <p className="legal-note">
            This page is a product privacy notice tailored to the current ShelfMerch implementation.
            Statements marked for legal review, and the policy as a whole, should be reviewed by
            qualified counsel before reliance in regulated procurement or contractual disclosures.
          </p>
        </LegalArticle>
      </main>

      <footer className="legal-footer">
        © 2026 Chitlu Innovations Private Limited · ShelfMerch ·{" "}
        <Link to="/legal/terms-of-service">Terms of Service</Link> ·{" "}
        <Link to="/legal/privacy-policy">Privacy Policy</Link>
      </footer>
    </div>
  );
}
