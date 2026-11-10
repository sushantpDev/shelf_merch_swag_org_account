import { Link } from "react-router";
import { DocsHeading, DocsShell } from "../DocsShell";
import { useDocsMeta } from "../useDocsMeta";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import zohoPeopleLogo from "../../../../assets/integrations/zoho-people.png";
import "./zoho-admin-guide.css";

export function ZohoPeopleUserGuidePage() {
  useDocsMeta({
    title: "ShelfMerch for Zoho People — User Guide",
    description:
      "User guide for connecting Zoho People to ShelfMerch, syncing employees, and troubleshooting.",
    canonicalPath: "/docs/zoho-people/user-guide",
    ogTitle: "ShelfMerch for Zoho People User Guide",
    ogDescription:
      "Step-by-step instructions to sign in, connect Zoho People, sync employees, and disconnect safely.",
  });

  return (
    <DocsShell
      className="zoho-admin-guide zoho-user-guide"
      activePath="/docs/zoho-people/user-guide"
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: "Zoho People docs", to: "/docs/zoho-people" },
        { label: "User Guide" },
      ]}
    >
      <header className="zag-hero">
      <div className="zag-hero-copy">
      <span className="zag-eyebrow">ZOHO PEOPLE DOCUMENTATION</span>
      <h1>User <em>guide.</em></h1>
      <p className="docs-sub">
        Connect Zoho People, sync employees, and manage onboarding recipients in ShelfMerch.
      </p>
      </div>
      <div className="zag-hero-visual">
        <div className="zag-partner-logos"><img src={zohoPeopleLogo} alt="Zoho People" /><span aria-hidden="true">+</span><ShelfMerchLogo height={26} theme="dark" /></div>
        <img className="zag-welcome-art" src="/images/resources/zoho/zoho-user-guide-hero-v1.png" alt="A colleague connecting and checking employee records from a laptop" width="1536" height="1024" />
      </div>
      </header>

      <DocsHeading id="introduction">1. Introduction</DocsHeading>
      <p>
        This guide is for company administrators who connect Zoho People from ShelfMerch Integrations and manually import employees. A Zoho Web Tab is not required. Synced contacts can be used as recipients for onboarding kits, rewards, and corporate gifts.
      </p>

      <DocsHeading id="requirements">2. Requirements</DocsHeading>
      <ul>
        <li>Active Zoho People account</li>
        <li>ShelfMerch company account</li>
        <li>Company administrator permission in ShelfMerch</li>
        <li>Permission to access and import employee information from Zoho People</li>
      </ul>

      <DocsHeading id="signing-in">3. Signing in to ShelfMerch</DocsHeading>
      <p>
        Open ShelfMerch and sign in at /login. New customers can create a company account at /signup and complete email verification first. After signing in, navigate to Integrations → Zoho People → Connect. Use a company administrator account.
      </p>

      <DocsHeading id="connecting">4. Connecting Zoho People</DocsHeading>
      <ol>
        <li>Open ShelfMerch Integrations and select Zoho People.</li>
        <li>Sign in to ShelfMerch if prompted.</li>
        <li>
          Click <strong>Connect</strong>.
        </li>
        <li>Review the requested Zoho permissions (employee forms read and organisation read).</li>
        <li>Select the approval checkbox in Zoho’s consent screen.</li>
        <li>
          Click <strong>Accept</strong>.
        </li>
        <li>
          Wait until ShelfMerch shows a <strong>Connected</strong> status with organisation details when
          available.
        </li>
      </ol>

      <DocsHeading id="syncing">5. Syncing employees</DocsHeading>
      <p>Employee sync is manual. Connecting authorizes access; it does not start automatic synchronization. Click Sync now whenever you want to import or refresh employee records.</p>
      <ol>
        <li>Open Integrations → Zoho People in ShelfMerch.</li>
        <li>
          Confirm the status shows <strong>Connected</strong>.
        </li>
        <li>
          Click <strong>Sync now</strong>.
        </li>
        <li>
          Wait for the success message summarising fetched, created, updated, skipped, and failed counts.
        </li>
        <li>Open ShelfMerch Contacts to view imported employees.</li>
      </ol>

      <DocsHeading id="fields">6. Information synchronized</DocsHeading>
      <p>Based on the current ShelfMerch sync implementation, the integration may synchronize:</p>
      <ul>
        <li>Employee name (first name, last name, and display name when available)</li>
        <li>Work email address</li>
        <li>Employee ID</li>
        <li>Zoho record ID</li>
        <li>
          Relevant employment fields: department, designation, work location, date of joining, and
          employment status
        </li>
        <li>Organisation identifiers (organisation ID and name when returned by Zoho)</li>
      </ul>
      <div className="docs-callout">
        The current Zoho People sync does <strong>not</strong> import work phone numbers. Phone numbers
        may appear on ShelfMerch contacts only if entered or imported through other ShelfMerch features.
      </div>

      <DocsHeading id="duplicates">7. Duplicate prevention</DocsHeading>
      <p>
        ShelfMerch matches existing contacts using the Zoho record ID within your company workspace. If
        needed, matching can also use work email. Existing contacts are updated instead of creating
        repeated duplicates when identifiers match.
      </p>

      <DocsHeading id="disconnecting">8. Disconnecting Zoho People</DocsHeading>
      <ul>
        <li>
          Disconnect asks Zoho to revoke authorization and stops future syncing. If Zoho confirms
          revocation, stored tokens are removed. If Zoho cannot confirm, ShelfMerch keeps the
          authorization encrypted and unused until revocation succeeds. You can also revoke
          ShelfMerch under Zoho Accounts → Sessions → Connected Apps.
        </li>
        <li>Previously imported contacts are not automatically deleted.</li>
        <li>
          You may remove applicable contacts in ShelfMerch, or request deletion via{" "}
          <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>.
        </li>
      </ul>

      <DocsHeading id="errors">9. Common errors</DocsHeading>
      <DocsHeading id="error-popup" level={3}>
        Sign-in popup blocked
      </DocsHeading>
      <p>Allow popups for shelfmerch.io in your browser, then click Sign in again.</p>
      <DocsHeading id="error-auth" level={3}>
        Authorisation not completed
      </DocsHeading>
      <p>
        Complete the Zoho consent screen before the window times out. If it expired, click Connect Zoho
        People again.
      </p>
      <DocsHeading id="error-permissions" level={3}>
        Missing permissions
      </DocsHeading>
      <p>
        Use a Zoho account that can grant the requested People permissions, or ask your Zoho admin to
        approve the connection.
      </p>
      <DocsHeading id="error-zero" level={3}>
        Employee sync returned zero records
      </DocsHeading>
      <p>
        Confirm employees exist in Zoho People forms accessible to the connected account, then sync
        again. Records missing required identifiers may be skipped.
      </p>
      <DocsHeading id="error-expired" level={3}>
        Token expired or reconnect required
      </DocsHeading>
      <p>Click Reconnect or Connect Zoho People again and complete OAuth consent.</p>
      <DocsHeading id="error-temp" level={3}>
        Sync failed temporarily
      </DocsHeading>
      <p>
        Wait a moment and retry. If it continues, contact support with the approximate time and any
        on-screen error message.
      </p>

      <DocsHeading id="support">10. Contact support</DocsHeading>
      <p>
        <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>
      </p>
      <p>
        <Link className="docs-cta docs-cta--ghost" to="/docs/zoho-people/admin-guide">
          Administrator Guide
        </Link>
        <Link className="docs-cta docs-cta--ghost" to="/docs/zoho-people">
          Documentation home
        </Link>
      </p>
    </DocsShell>
  );
}
