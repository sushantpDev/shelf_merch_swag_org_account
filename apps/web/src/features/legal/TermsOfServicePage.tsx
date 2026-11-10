import { Link } from "react-router";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import "./legal.css";
import { LegalArticle } from "./LegalArticle";
import { FileText } from "lucide-react";

/** Public Terms of Service — also served as static HTML at GET /legal/terms-of-service. */
export function TermsOfServicePage() {
  return (
    <div className="legal-shell legal-shell--terms">
      <header className="legal-header">
        <div className="legal-header-inner">
          <Link to="/" className="legal-logo-link" aria-label="ShelfMerch home">
            <ShelfMerchLogo height={36} />
          </Link>
          <nav className="legal-nav" aria-label="Legal">
            <Link to="/legal/privacy-policy">Privacy Policy</Link>
            <Link to="/login">Sign in</Link>
            <Link to="/">Home</Link>
          </nav>
        </div>
      </header>

      <main className="legal-main">
        <header className="legal-hero">
          <span className="legal-eyebrow"><FileText size={20} aria-hidden="true" /> THE DETAILS, MADE CLEAR</span>
          <h1>Terms of <em>Service</em></h1>
          <p className="legal-updated">Last updated: 30 July 2026</p>
        </header>
        <LegalArticle collapsedContents>

          <p className="legal-intro">
            These Terms of Service (“<strong>Terms</strong>”) govern access to and use of{" "}
            <strong>ShelfMerch</strong> (the “<strong>Service</strong>”), including{" "}
            <strong>ShelfMerch for Zoho People</strong>, operated by{" "}
            <strong>Chitlu Innovations Private Limited</strong> (“<strong>Chitlu</strong>”, “
            <strong>we</strong>”, “<strong>us</strong>”, or “<strong>our</strong>”) at{" "}
            <a href="https://shelfmerch.io">https://shelfmerch.io</a>. By creating an account,
            accessing the Service, connecting an integration, or placing an order, you agree to these
            Terms on behalf of yourself and the organisation you represent (the “
            <strong>Customer</strong>”).
          </p>

          <h2 id="acceptance">1. Acceptance of Terms</h2>
          <p>
            If you do not agree to these Terms, do not use the Service. If you accept these Terms on
            behalf of a company or other legal entity, you represent that you have authority to bind
            that entity. If you lack that authority, you may not accept these Terms or use the Service
            for that entity.
          </p>
          <p>
            Our <Link to="/legal/privacy-policy">Privacy Policy</Link> explains how we process personal
            information and forms part of how we operate the Service. These Terms control in case of
            conflict about commercial use of the Service, except where mandatory law provides otherwise.{" "}
            <em>
              (Legal review recommended for contract hierarchy and incorporation of privacy terms.)
            </em>
          </p>

          <h2 id="eligibility">2. Eligibility and Authorised Company Users</h2>
          <ul>
            <li>
              The Service is intended for business use by organisations and their authorised personnel.
            </li>
            <li>You must be legally able to enter a binding contract under applicable law.</li>
            <li>
              Customer administrators are responsible for inviting users, assigning roles, and revoking
              access when employment or authority ends.
            </li>
            <li>
              You must not share login credentials or allow unauthorised persons to use your account.
            </li>
          </ul>

          <h2 id="services">3. ShelfMerch Services</h2>
          <p>
            ShelfMerch provides software and related services that may include workspace management,
            contacts, shops, kits, campaigns, wallets, catalogues, integrations, and tools to design,
            order, and distribute merchandise, gifts, and recognition programmes. Features available to
            you depend on your plan, configuration, and permissions. We may add, modify, or discontinue
            features with reasonable notice where practicable, except for urgent security or legal
            changes.
          </p>

          <h2 id="zoho-people">4. Zoho People Integration</h2>
          <p>
            ShelfMerch for Zoho People lets an authorised company administrator connect the Customer’s
            Zoho People account to ShelfMerch so employee records can be imported and updated for use in
            the Service (for example, onboarding kits, rewards, and corporate gifts).
          </p>
          <ul>
            <li>
              The Customer must have permission to import employee information from Zoho People and must
              only connect accounts it is authorised to use.
            </li>
            <li>
              ShelfMerch only accesses Zoho data authorised through OAuth permissions granted by the
              Customer.
            </li>
            <li>
              Customers are responsible for the accuracy and lawful use of employee data, including
              notices and consents required under applicable employment and data-protection laws.
            </li>
            <li>
              Disconnecting Zoho People stops future syncing but does not automatically delete previously
              imported records. The Customer may request deletion or manage contacts in ShelfMerch
              according to product capabilities and our Privacy Policy.
            </li>
            <li>
              Zoho is a third-party service and is governed by Zoho’s own terms and policies. ShelfMerch
              is not responsible for Zoho’s availability, data quality, or changes to Zoho APIs or
              permissions.
            </li>
          </ul>

          <h2 id="account-security">5. Account Security</h2>
          <p>
            You are responsible for maintaining the confidentiality of credentials associated with your
            ShelfMerch account and for activity under your account. Notify us promptly at{" "}
            <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a> if you suspect
            unauthorised access. We implement security measures designed to protect the Service, but we
            do not guarantee absolute security or that unauthorised access will never occur.
          </p>

          <h2 id="employee-data">6. Employee Data and Customer Responsibilities</h2>
          <p>
            As between the parties, the Customer controls employee and contact data it submits or syncs
            into ShelfMerch. The Customer is responsible for:
          </p>
          <ul>
            <li>
              Having a lawful basis to collect, import, sync, and use employee and recipient data
            </li>
            <li>
              Ensuring data provided to ShelfMerch is accurate, complete, and up to date as needed for
              fulfilment
            </li>
            <li>
              Configuring roles so only authorised users can view or act on employee and order data
            </li>
            <li>
              Responding to employee or data-subject requests where the Customer is the controller
            </li>
          </ul>
          <p>
            ShelfMerch processes such data to provide the Service to the Customer and as described in
            the Privacy Policy. We do not sell employee personal data.{" "}
            <em>
              (Legal review recommended for data-processing / DPA wording if you issue a separate DPA.)
            </em>
          </p>

          <h2 id="acceptable-use">7. Acceptable Use</h2>
          <p>You must not, and must not allow others to:</p>
          <ul>
            <li>Use the Service unlawfully, fraudulently, or in violation of third-party rights</li>
            <li>
              Upload malware, probe or attack the Service, or circumvent security or rate limits
            </li>
            <li>
              Scrape, reverse engineer, or resell the Service except as permitted by law or written
              agreement
            </li>
            <li>
              Import or process personal data without authority or for prohibited marketing practices
            </li>
            <li>
              Misrepresent your identity, organisation, or authority to connect integrations such as Zoho
              People
            </li>
            <li>Use the Service to send spam or deceptive communications</li>
          </ul>
          <p>We may investigate and suspend or terminate access for suspected violations.</p>

          <h2 id="orders">8. Onboarding Kits, Gifts and Merchandise Orders</h2>
          <p>
            Customers may use ShelfMerch to configure kits, gifts, shops, and merchandise programmes and
            to place orders for production and delivery to employees or other recipients. Order details,
            recipient addresses, and product selections must be accurate. The Customer is responsible for
            confirming recipient eligibility and for any internal approval workflows before submitting
            orders.
          </p>

          <h2 id="customisation">9. Product Customisation and Approvals</h2>
          <ul>
            <li>
              Final approved artwork is the Customer’s responsibility. Once artwork is approved in the
              Service (or otherwise confirmed for production), production may proceed based on that
              approval.
            </li>
            <li>
              Product colours, sizes, materials, and customisation may have reasonable production
              variations compared with on-screen previews, samples, or proofs.
            </li>
            <li>
              ShelfMerch is not liable for Customer-provided artwork that is incorrect, low-resolution,
              infringing, or unsuitable for production after the Customer has approved it.
            </li>
          </ul>

          <h2 id="pricing">10. Pricing, Taxes and Payments</h2>
          <p>
            Prices, fees, and available payment methods are shown in the Service or in an applicable
            order, quote, or invoice. Prices may change for future orders; changes do not typically
            affect orders already confirmed and paid unless required by law or agreed in writing.
            Applicable taxes, duties, and payment-gateway charges may apply. The Customer is responsible
            for providing accurate billing information and paying undisputed amounts when due.{" "}
            <em>
              (Legal review recommended for Indian GST, invoicing, and late-payment interest clauses.)
            </em>
          </p>

          <h2 id="shipping">11. Shipping and Delivery</h2>
          <p>
            Delivery timelines shown in the Service are estimates, not guarantees. Delivery timelines may
            vary because of logistics partners, stock availability, customs, address issues, or
            force-majeure events. ShelfMerch does not guarantee specific delivery dates. Risk of loss and
            title for physical goods pass according to the shipping terms applicable to the order and
            carrier practices.{" "}
            <em>
              (Legal review recommended for risk-of-loss and Incoterms if you sell internationally.)
            </em>
          </p>

          <h2 id="cancellations">12. Cancellations, Returns and Replacements</h2>
          <p>
            Cancellation, return, and replacement eligibility depends on order status, product type, and
            whether production or shipping has begun. Customised or personalised items may not be
            returnable except for verified manufacturing defects relative to the approved artwork and
            order specification. Contact{" "}
            <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a> promptly with order
            details and evidence of any defect. Remedies may include repair, replacement, or credit at
            our reasonable discretion where a defect is confirmed.{" "}
            <em>
              (Legal review recommended for statutory consumer rights that may apply to certain buyers.)
            </em>
          </p>

          <h2 id="third-parties">13. Third-Party Services, including Zoho</h2>
          <p>
            The Service may interoperate with third-party products and services, including Zoho People,
            payment processors, carriers, and hosting providers. Third-party services are subject to
            their own terms and privacy policies. ShelfMerch is not responsible for third-party outages,
            policy changes, fees, or data handling outside our control. Enabling a third-party
            integration is at the Customer’s election and risk, subject to these Terms.
          </p>

          <h2 id="ip">14. Intellectual Property</h2>
          <p>
            ShelfMerch, including software, branding, documentation, and site content, is owned by Chitlu
            or its licensors and is protected by intellectual-property laws. We grant the Customer a
            limited, non-exclusive, non-transferable right to use the Service during the subscription or
            access period solely for the Customer’s internal business purposes. Customers retain rights
            in their own logos, artwork, and content submitted to the Service, and grant us a licence to
            use that content as needed to provide production, fulfilment, and support.{" "}
            <em>
              (Legal review recommended for IP assignment of custom designs and licence scope.)
            </em>
          </p>

          <h2 id="confidentiality">15. Confidentiality</h2>
          <p>
            Each party may receive non-public information from the other (“Confidential Information”).
            The receiving party will use Confidential Information only to perform under these Terms and
            will protect it with reasonable care. Confidential Information does not include information
            that is public through no fault of the receiving party, independently developed, or
            rightfully received from a third party without duty of confidentiality. Disclosure may be
            made if required by law, with notice where legally permitted.
          </p>

          <h2 id="availability">16. Service Availability</h2>
          <p>
            We aim to keep ShelfMerch available and performant, but we do not guarantee uninterrupted,
            error-free, or continuous availability. Maintenance, updates, third-party failures, and
            events beyond our reasonable control may cause downtime or degraded performance. Scheduled
            maintenance will be communicated when practicable.
          </p>

          <h2 id="suspension">17. Suspension and Termination</h2>
          <p>
            We may suspend or terminate access if you breach these Terms, create security or legal risk,
            fail to pay amounts due, or if we discontinue the Service. The Customer may stop using the
            Service and request account closure through support. Provisions that by nature should survive
            (including intellectual property, confidentiality, disclaimers, limitation of liability,
            indemnification, and governing law) survive termination.{" "}
            <em>(Legal review recommended for notice periods and data-export on exit.)</em>
          </p>

          <h2 id="disclaimers">18. Disclaimers</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE”.
            WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT, AND ANY WARRANTY ARISING FROM COURSE OF DEALING. WE DO NOT WARRANT THAT THE
            SERVICE WILL BE UNINTERRUPTED, SECURE, OR FREE OF ERRORS, OR THAT DATA WILL NEVER BE LOST.{" "}
            <em>
              (Legal review recommended — Indian law may limit the enforceability of broad warranty
              exclusions.)
            </em>
          </p>

          <h2 id="liability">19. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHITLU AND ITS DIRECTORS, EMPLOYEES, AND SUPPLIERS
            WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
            DAMAGES, OR FOR LOST PROFITS, REVENUE, GOODWILL, OR DATA, EVEN IF ADVISED OF THE POSSIBILITY.
            OUR TOTAL LIABILITY ARISING OUT OF OR RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED
            THE AMOUNTS PAID BY THE CUSTOMER TO CHITLU FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE
            THE EVENT GIVING RISE TO LIABILITY (OR, IF NONE, ONE THOUSAND INDIAN RUPEES). These limits do
            not exclude liability that cannot be limited under applicable law (for example, certain
            liability for fraud or personal injury).{" "}
            <em>
              (Legal review essential — liability caps and exclusions under Indian Contract Act /
              consumer law.)
            </em>
          </p>

          <h2 id="indemnification">20. Indemnification</h2>
          <p>
            The Customer will defend and indemnify Chitlu against third-party claims, losses, and
            expenses (including reasonable legal fees) arising from: (a) Customer content, artwork, or
            employee data; (b) the Customer’s use of the Service in breach of these Terms or law; (c)
            unauthorised Zoho or other integration connections; or (d) products produced to
            Customer-approved specifications that allegedly infringe third-party rights.{" "}
            <em>
              (Legal review recommended for mutual vs one-way indemnity and procedure.)
            </em>
          </p>

          <h2 id="governing-law">21. Governing Law and Dispute Resolution</h2>
          <p>
            These Terms are governed by the laws of India, without regard to conflict-of-law rules.
            Courts at Bengaluru, Karnataka, India shall have exclusive jurisdiction over disputes arising
            from these Terms, subject to any mandatory protections that apply to you.{" "}
            <em>
              (Legal review essential — confirm seat, exclusive jurisdiction, and whether arbitration is
              preferred.)
            </em>
          </p>

          <h2 id="changes">22. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. The “Last updated” date will change when we do.
            Material changes may be notified through the Service or by email where appropriate. Continued
            use after the effective date constitutes acceptance of the updated Terms, except where
            mandatory law requires additional consent.
          </p>

          <h2 id="contact">23. Contact Information</h2>
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

          <p className="legal-note">
            These Terms are a product-facing template tailored to ShelfMerch’s current features,
            including ShelfMerch for Zoho People. Clauses marked for legal review — and the document as
            a whole — should be reviewed by a qualified Indian lawyer before publication or customer
            contracting.
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
