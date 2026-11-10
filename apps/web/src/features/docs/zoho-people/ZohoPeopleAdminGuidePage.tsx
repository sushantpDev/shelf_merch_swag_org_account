import { Link } from "react-router";
import { DocsHeading, DocsShell } from "../DocsShell";
import { useDocsMeta } from "../useDocsMeta";
import { BookOpen, ShieldCheck } from "lucide-react";
import { ShelfMerchLogo } from "@/components/brand/ShelfMerchLogo";
import zohoPeopleLogo from "../../../../assets/integrations/zoho-people.png";
import "./zoho-admin-guide.css";

const guideSections = [
  ["responsibilities", "Administrator responsibilities"],
  ["installation", "Installation"],
  ["permissions", "Required permissions"],
  ["oauth-security", "OAuth and security"],
  ["connecting-org", "Connecting an organisation"],
  ["mapping", "Employee mapping"],
  ["running-sync", "Running synchronization"],
  ["tenant-isolation", "Tenant isolation"],
  ["retention", "Data retention and deletion"],
  ["admin-troubleshooting", "Troubleshooting"],
  ["support-checklist", "Support checklist"],
] as const;

export function ZohoPeopleAdminGuidePage() {
  useDocsMeta({
    title: "ShelfMerch for Zoho People — Administrator Guide",
    description:
      "Administrator guide for ShelfMerch for Zoho People: OAuth scopes, security, field mapping, and troubleshooting.",
    canonicalPath: "/docs/zoho-people/admin-guide",
    ogTitle: "ShelfMerch for Zoho People Administrator Guide",
    ogDescription:
      "Security, OAuth permissions, employee mapping, synchronisation summaries, and support checklist.",
  });

  return (
    <DocsShell
      className="zoho-admin-guide"
      activePath="/docs/zoho-people/admin-guide"
      breadcrumbs={[
        { label: "Home", to: "/" },
        { label: "Zoho People docs", to: "/docs/zoho-people" },
        { label: "Administrator Guide" },
      ]}
    >
      <header className="zag-hero">
      <div className="zag-hero-copy">
      <span className="zag-eyebrow"><BookOpen size={18} aria-hidden="true" /> ZOHO PEOPLE DOCUMENTATION</span>
      <h1>Administrator <em>guide.</em></h1>
      <p className="docs-sub">
        Security, permissions, mapping, and operational guidance for company administrators.
      </p>
      <span className="zag-hero-note"><ShieldCheck size={18} aria-hidden="true" /> ShelfMerch for Zoho People</span>
      </div>
      <div className="zag-hero-visual">
        <div className="zag-partner-logos">
          <img src={zohoPeopleLogo} alt="Zoho People" />
          <span aria-hidden="true">+</span>
          <ShelfMerchLogo height={26} theme="dark" />
        </div>
        <img className="zag-welcome-art" src="/images/resources/zoho/zoho-admin-guide-hero-v1.png"
            alt="An administrator reviewing security settings and employee data controls"
          width="1536" height="1024" />
      </div>
      </header>
      <details className="zag-contents" open>
        <summary>On this page <span>11 sections</span></summary>
        <nav aria-label="Administrator guide sections">
          {guideSections.map(([id, label], index) => (
            <a href={`#${id}`} key={id}><span>{String(index + 1).padStart(2, "0")}</span>{label}</a>
          ))}
        </nav>
      </details>

      <DocsHeading id="responsibilities">1. Administrator responsibilities</DocsHeading>
      <p>
        Only connect Zoho People if you have lawful authority to process employee data for your
        organisation. You are responsible for accurate data, role assignment in ShelfMerch, and complying
        with applicable employment and privacy laws. See also the{" "}
        <Link to="/legal/terms-of-service">Terms of Service</Link> and{" "}
        <Link to="/legal/privacy-policy">Privacy Policy</Link>.
      </p>

      <DocsHeading id="installation">2. Installation</DocsHeading>
      <p>
        On Zoho People Marketplace, choose Visit website to open the ShelfMerch integration documentation. Create a ShelfMerch company account or log in to an existing account, then navigate to Integrations → Zoho People → Connect. This API-built integration does not require a Zoho Web Tab.
      </p>

      <DocsHeading id="permissions">3. Required permissions</DocsHeading>
      <p>ShelfMerch currently requests these Zoho People OAuth scopes:</p>
      <ul>
        <li>
          <strong>ZOHOPEOPLE.forms.READ</strong> — read Zoho People employee form / record data needed for
          sync
        </li>
        <li>
          <strong>ZOHOPEOPLE.organization.READ</strong> — read organisation information to verify the
          connection
        </li>
      </ul>
      <p>No additional Zoho scopes are requested by the current integration.</p>

      <DocsHeading id="oauth-security">4. OAuth and security</DocsHeading>
      <ul>
        <li>Zoho OAuth access and refresh tokens are encrypted at rest</li>
        <li>Tokens are stored server-side in your ShelfMerch tenant record</li>
        <li>Tokens are not exposed to browser JavaScript through public status APIs</li>
        <li>OAuth state validation protects the authorization flow</li>
        <li>Access is separated by ShelfMerch tenant / company</li>
        <li>Embedded Zoho sessions are restricted to integration-related actions</li>
      </ul>

      <DocsHeading id="connecting-org">5. Connecting an organisation</DocsHeading>
      <ol>
        <li>Sign in to ShelfMerch as a company administrator.</li>
        <li>Open Integrations → Zoho People → Connect in ShelfMerch.</li>
        <li>Complete Zoho OAuth consent for the scopes above.</li>
        <li>
          Confirm Connected status, organisation name or ID, and that Sync now is available.
        </li>
      </ol>

      <DocsHeading id="mapping">6. Employee mapping</DocsHeading>
      <p>Current field mapping from Zoho People into ShelfMerch contacts:</p>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zoho People (aliases read)</th>
              <th>ShelfMerch contact field</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Zoho record ID (Zoho_ID / recordId / …)</td>
              <td>zohoRecordId</td>
            </tr>
            <tr>
              <td>Employee ID</td>
              <td>employeeCode</td>
            </tr>
            <tr>
              <td>First name / last name / display name</td>
              <td>firstName, lastName, name</td>
            </tr>
            <tr>
              <td>Work email</td>
              <td>email</td>
            </tr>
            <tr>
              <td>Department</td>
              <td>department</td>
            </tr>
            <tr>
              <td>Designation / job title</td>
              <td>designation</td>
            </tr>
            <tr>
              <td>Work location</td>
              <td>workLocation</td>
            </tr>
            <tr>
              <td>Date of joining</td>
              <td>dateOfJoining</td>
            </tr>
            <tr>
              <td>Employment status</td>
              <td>employmentStatus</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li>
          <strong>Missing fields:</strong> optional fields may be stored empty; sync continues when
          required identifiers exist.
        </li>
        <li>
          <strong>Skipped records:</strong> missing Zoho record ID, missing employee ID and email,
          invalid email, unsupported record shape, duplicates in the Zoho response, or database
          validation failures.
        </li>
        <li>
          <strong>Updates:</strong> matched primarily by tenant + Zoho record ID; email can help merge
          when appropriate.
        </li>
        <li>
          <strong>Phone:</strong> not imported from Zoho by the current sync.
        </li>
      </ul>

      <DocsHeading id="running-sync">7. Running synchronization</DocsHeading>
      <p>Click Sync now after connecting to import or update employees manually. Employees are not synced automatically. Run Sync now again when you need a refresh. Each manual sync returns a summary such as:</p>
      <ul>
        <li>
          <strong>totalFetched</strong> — employee records retrieved from Zoho
        </li>
        <li>
          <strong>created</strong> — new ShelfMerch contacts created
        </li>
        <li>
          <strong>updated</strong> — existing contacts updated
        </li>
        <li>
          <strong>skipped</strong> — records not imported (see skippedByReason)
        </li>
        <li>
          <strong>failed</strong> — records that failed during save
        </li>
        <li>
          <strong>skippedByReason</strong> — counts grouped by skip reason
        </li>
      </ul>

      <DocsHeading id="tenant-isolation">8. Tenant isolation</DocsHeading>
      <p>
        Each ShelfMerch organisation has its own Zoho connection and contacts. One ShelfMerch
        organisation cannot access another organisation’s Zoho tokens or employee records.
      </p>

      <DocsHeading id="retention">9. Data retention and deletion</DocsHeading>
      <ul>
        <li>
          Disconnecting requests Zoho token revocation and stops synchronisation immediately. The
          access token is deleted. The refresh token is deleted only after Zoho confirms revocation
          or reports it invalid. If Zoho does not confirm, the token stays encrypted, unused, and
          marked unresolved so revocation can be retried. Other ShelfMerch integrations and
          workspaces are not changed.
        </li>
        <li>
          Imported records may remain until deleted per your instructions and ShelfMerch retention
          practices.
        </li>
        <li>
          Send deletion or access requests to{" "}
          <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>.
        </li>
        <li>
          Identity and authority may need verification before organisation or employee-data requests are
          processed.
        </li>
      </ul>

      <DocsHeading id="admin-troubleshooting">10. Troubleshooting</DocsHeading>
      <ul>
        <li>
          <strong>OAuth redirect errors</strong> — retry Connect; ensure the Marketplace app / redirect
          configuration matches the installed ShelfMerch app.
        </li>
        <li>
          <strong>Reconnect required</strong> — complete OAuth again after token refresh failures.
        </li>
        <li>
          <strong>Missing Zoho People organisation</strong> — confirm the Zoho account can read
          organisation data; reconnect if needed.
        </li>
        <li>
          <strong>Insufficient permissions</strong> — approve both forms and organisation read scopes.
        </li>
        <li>
          <strong>Employee endpoint errors</strong> — temporary Zoho API issues; retry later.
        </li>
        <li>
          <strong>No employees returned</strong> — verify form data and that records include identifiers
          ShelfMerch can map.
        </li>
        <li>
          <strong>Popup blocked</strong> — allow popups for ShelfMerch.
        </li>
        <li>
          <strong>Sync timeout</strong> — retry; for large directories contact support with timing details.
        </li>
      </ul>

      <DocsHeading id="support-checklist">11. Support checklist</DocsHeading>
      <p>
        When contacting <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>, include:
      </p>
      <ul>
        <li>ShelfMerch organisation name</li>
        <li>Approximate error time</li>
        <li>Screenshot of the safe on-screen error message</li>
        <li>Request ID, when shown</li>
      </ul>
      <div className="docs-callout">
        Never send passwords, access tokens, refresh tokens, OAuth codes, cookies, or client secrets.
      </div>
    </DocsShell>
  );
}
