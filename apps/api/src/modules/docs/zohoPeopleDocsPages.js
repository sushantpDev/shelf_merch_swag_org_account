import { docsHtmlShell } from './docsHtmlShell.js';

const crumbs = (...parts) =>
  parts
    .map((p, i) =>
      i === parts.length - 1
        ? `<span aria-current="page">${p.label}</span>`
        : `<a href="${p.href}">${p.label}</a><span>/</span>`,
    )
    .join('');

export function buildZohoPeopleDocsHomeHtml() {
  return docsHtmlShell({
    title: 'ShelfMerch for Zoho People · Documentation',
    description:
      'Sync employees from Zoho People into ShelfMerch for onboarding kits, rewards, and corporate gifting.',
    canonical: 'https://shelfmerch.io/docs/zoho-people',
    ogTitle: 'ShelfMerch for Zoho People Documentation',
    ogDescription:
      'Connect Zoho People to ShelfMerch, sync employees, and streamline onboarding and corporate gifting.',
    activePath: '/docs/zoho-people',
    breadcrumbsHtml: crumbs(
      { href: '/', label: 'Home' },
      { href: '/docs/zoho-people', label: 'Zoho People docs' },
    ),
    bodyHtml: `
      <h1>ShelfMerch for Zoho People</h1>
      <p class="docs-sub">Sync employees and streamline onboarding and corporate gifting.</p>
      <section class="zoho-onboarding" aria-labelledby="zoho-start-title">
        <span class="zag-eyebrow">START USING THE INTEGRATION</span>
        <h2 id="zoho-start-title">Your people. <em>Connected to ShelfMerch.</em></h2>
        <p>Coming from Zoho People Marketplace? Choose your starting point below. You will connect your Zoho People account from ShelfMerch; a Zoho Web Tab is not required.</p>
        <div class="zoho-onboarding__paths">
          <div><h3>New customer</h3><p>Create your company account and complete email verification.</p><a class="docs-cta" href="/signup">Create ShelfMerch Account</a></div>
          <div><h3>Existing customer</h3><p>Sign in to your company workspace as a company administrator.</p><a class="docs-cta docs-cta--ghost" href="/login">Log In to ShelfMerch</a></div>
        </div>
        <h3>After you sign in</h3>
        <ol class="zoho-onboarding__steps">
          <li><strong>Open Integrations → Zoho People → Connect.</strong> Use your company administrator account. If you cannot access Integrations, ask your company administrator for help.</li>
          <li><strong>Authorize with Zoho OAuth.</strong> Sign in to Zoho, review the employee and organisation read permissions, and approve access. Return to ShelfMerch and confirm the Connected status.</li>
          <li><strong>Click Sync now.</strong> This manually imports or updates employee records. Review the sync result, and click Sync now again whenever you want to refresh them. Employees are not synced automatically.</li>
        </ol>
      </section>
      <p>
        <strong>ShelfMerch for Zoho People</strong> allows authorised company administrators to import
        and update employee records from Zoho People. Synced employees can be managed as recipients for
        onboarding kits, employee rewards, corporate gifts, and branded merchandise.
      </p>

      <h2 id="documentation">Documentation</h2>
      <div class="docs-cards">
        <a class="docs-card" href="/docs/zoho-people/user-guide"><strong>User Guide</strong><span>Sign in, connect, sync, and disconnect step by step.</span></a>
        <a class="docs-card" href="/docs/zoho-people/admin-guide"><strong>Administrator Guide</strong><span>Permissions, security, mapping, and tenant isolation.</span></a>
        <a class="docs-card" href="/docs/zoho-people/user-guide#connecting"><strong>Installation and Connection</strong><span>Connect Zoho People through OAuth from ShelfMerch Integrations.</span></a>
        <a class="docs-card" href="/docs/zoho-people/user-guide#syncing"><strong>Employee Synchronisation</strong><span>Import and update employees into ShelfMerch contacts.</span></a>
        <a class="docs-card" href="/docs/zoho-people/user-guide#errors"><strong>Troubleshooting</strong><span>Common errors and practical fixes.</span></a>
        <a class="docs-card" href="/legal/privacy-policy"><strong>Privacy and Data Handling</strong><span>How employee and integration data is processed.</span></a>
        <a class="docs-card" href="mailto:support@shelfmerch.com"><strong>Contact Support</strong><span>support@shelfmerch.com</span></a>
      </div>

      <h2 id="features">Key features</h2>
      <ul>
        <li>Secure Zoho OAuth connection</li>
        <li>Employee import and update</li>
        <li>Duplicate record prevention using Zoho employee identifiers</li>
        <li>Organisation and last-sync status</li>
        <li>Onboarding kit recipient management</li>
        <li>Employee rewards and corporate gifting</li>
        <li>Manual employee synchronisation</li>
        <li>Secure disconnection</li>
      </ul>

      <h2 id="get-started">Get started</h2>
      <p>Choose the guide that matches your role:</p>
      <p>
        <a class="docs-cta" href="/docs/zoho-people/user-guide">Open User Guide</a>
        <a class="docs-cta docs-cta--ghost" href="/docs/zoho-people/admin-guide">Open Administrator Guide</a>
        <a class="docs-cta docs-cta--ghost" href="/case-studies/zoho-people">View example workflow</a>
      </p>
      <p>Product by Chitlu Innovations Private Limited · <a href="https://shelfmerch.io">https://shelfmerch.io</a></p>
    `,
  });
}

export function buildZohoPeopleUserGuideHtml() {
  return docsHtmlShell({
    title: 'ShelfMerch for Zoho People — User Guide',
    description:
      'User guide for connecting Zoho People to ShelfMerch, syncing employees, and troubleshooting.',
    canonical: 'https://shelfmerch.io/docs/zoho-people/user-guide',
    ogTitle: 'ShelfMerch for Zoho People User Guide',
    ogDescription:
      'Step-by-step instructions to sign in, connect Zoho People, sync employees, and disconnect safely.',
    activePath: '/docs/zoho-people/user-guide',
    breadcrumbsHtml: crumbs(
      { href: '/', label: 'Home' },
      { href: '/docs/zoho-people', label: 'Zoho People docs' },
      { href: '/docs/zoho-people/user-guide', label: 'User Guide' },
    ),
    bodyHtml: `
      <h1>ShelfMerch for Zoho People — User Guide</h1>
      <p class="docs-sub">Connect Zoho People, sync employees, and manage onboarding recipients in ShelfMerch.</p>

      <h2 id="introduction">1. Introduction</h2>
      <p>
        This guide is for company administrators who connect Zoho People from ShelfMerch Integrations and manually import employees. A Zoho Web Tab is not required. Synced contacts can be used as recipients for onboarding kits, rewards, and corporate gifts.
      </p>

      <h2 id="requirements">2. Requirements</h2>
      <ul>
        <li>Active Zoho People account</li>
        <li>ShelfMerch company account</li>
        <li>Company administrator permission in ShelfMerch</li>
        <li>Permission to access and import employee information from Zoho People</li>
      </ul>

      <h2 id="signing-in">3. Signing in to ShelfMerch</h2>
      <p>
        Open ShelfMerch and sign in at /login. New customers can create a company account at /signup and complete email verification first. After signing in, navigate to Integrations → Zoho People → Connect. Use a company administrator account.
      </p>

      <h2 id="connecting">4. Connecting Zoho People</h2>
      <ol>
        <li>Open ShelfMerch Integrations and select Zoho People.</li>
        <li>Sign in to ShelfMerch if prompted.</li>
        <li>Click <strong>Connect</strong>.</li>
        <li>Review the requested Zoho permissions (employee forms read and organisation read).</li>
        <li>Select the approval checkbox in Zoho’s consent screen.</li>
        <li>Click <strong>Accept</strong>.</li>
        <li>Wait until ShelfMerch shows a <strong>Connected</strong> status with organisation details when available.</li>
      </ol>

      <h2 id="syncing">5. Syncing employees</h2>
      <p>Employee sync is manual. Connecting authorizes access; it does not start automatic synchronization. Click Sync now whenever you want to import or refresh employee records.</p>
      <ol>
        <li>Open Integrations → Zoho People in ShelfMerch.</li>
        <li>Confirm the status shows <strong>Connected</strong>.</li>
        <li>Click <strong>Sync now</strong>.</li>
        <li>Wait for the success message summarising fetched, created, updated, skipped, and failed counts.</li>
        <li>Open ShelfMerch Contacts to view imported employees.</li>
      </ol>

      <h2 id="fields">6. Information synchronized</h2>
      <p>Based on the current ShelfMerch sync implementation, the integration may synchronize:</p>
      <ul>
        <li>Employee name (first name, last name, and display name when available)</li>
        <li>Work email address</li>
        <li>Employee ID</li>
        <li>Zoho record ID</li>
        <li>Relevant employment fields: department, designation, work location, date of joining, and employment status</li>
        <li>Organisation identifiers (organisation ID and name when returned by Zoho)</li>
      </ul>
      <div class="docs-callout">
        The current Zoho People sync does <strong>not</strong> import work phone numbers. Phone numbers may
        appear on ShelfMerch contacts only if entered or imported through other ShelfMerch features.
      </div>

      <h2 id="duplicates">7. Duplicate prevention</h2>
      <p>
        ShelfMerch matches existing contacts using the Zoho record ID within your company workspace.
        If needed, matching can also use work email. Existing contacts are updated instead of creating
        repeated duplicates when identifiers match.
      </p>

      <h2 id="disconnecting">8. Disconnecting Zoho People</h2>
      <ul>
        <li>Disconnect stops future syncing and clears stored Zoho OAuth tokens for your organisation.</li>
        <li>Previously imported contacts are not automatically deleted.</li>
        <li>You may remove applicable contacts in ShelfMerch, or request deletion via <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>.</li>
      </ul>

      <h2 id="errors">9. Common errors</h2>
      <h3>Sign-in popup blocked</h3>
      <p>Allow popups for shelfmerch.io in your browser, then click Sign in again.</p>
      <h3>Authorisation not completed</h3>
      <p>Complete the Zoho consent screen before the window times out. If it expired, click Connect Zoho People again.</p>
      <h3>Missing permissions</h3>
      <p>Use a Zoho account that can grant the requested People permissions, or ask your Zoho admin to approve the connection.</p>
      <h3>Employee sync returned zero records</h3>
      <p>Confirm employees exist in Zoho People forms accessible to the connected account, then sync again. Records missing required identifiers may be skipped.</p>
      <h3>Token expired or reconnect required</h3>
      <p>Click Reconnect or Connect Zoho People again and complete OAuth consent.</p>
      <h3>Sync failed temporarily</h3>
      <p>Wait a moment and retry. If it continues, contact support with the approximate time and any on-screen error message.</p>

      <h2 id="support">10. Contact support</h2>
      <p><a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a></p>
      <p><a class="docs-cta docs-cta--ghost" href="/docs/zoho-people/admin-guide">Administrator Guide</a>
      <a class="docs-cta docs-cta--ghost" href="/docs/zoho-people">Documentation home</a></p>
    `,
  });
}

export function buildZohoPeopleAdminGuideHtml() {
  return docsHtmlShell({
    title: 'ShelfMerch for Zoho People — Administrator Guide',
    description:
      'Administrator guide for ShelfMerch for Zoho People: OAuth scopes, security, field mapping, and troubleshooting.',
    canonical: 'https://shelfmerch.io/docs/zoho-people/admin-guide',
    ogTitle: 'ShelfMerch for Zoho People Administrator Guide',
    ogDescription:
      'Security, OAuth permissions, employee mapping, synchronisation summaries, and support checklist.',
    activePath: '/docs/zoho-people/admin-guide',
    breadcrumbsHtml: crumbs(
      { href: '/', label: 'Home' },
      { href: '/docs/zoho-people', label: 'Zoho People docs' },
      { href: '/docs/zoho-people/admin-guide', label: 'Administrator Guide' },
    ),
    bodyHtml: `
      <h1>ShelfMerch for Zoho People — Administrator Guide</h1>
      <p class="docs-sub">Security, permissions, mapping, and operational guidance for company administrators.</p>

      <h2 id="responsibilities">1. Administrator responsibilities</h2>
      <p>
        Only connect Zoho People if you have lawful authority to process employee data for your organisation.
        You are responsible for accurate data, role assignment in ShelfMerch, and complying with applicable
        employment and privacy laws. See also the
        <a href="/legal/terms-of-service">Terms of Service</a> and
        <a href="/legal/privacy-policy">Privacy Policy</a>.
      </p>

      <h2 id="installation">2. Installation</h2>
      <p>
        On Zoho People Marketplace, choose Visit website to open the ShelfMerch integration documentation. Create a ShelfMerch company account or log in to an existing account, then navigate to Integrations → Zoho People → Connect. This API-built integration does not require a Zoho Web Tab.
      </p>

      <h2 id="permissions">3. Required permissions</h2>
      <p>ShelfMerch currently requests these Zoho People OAuth scopes:</p>
      <ul>
        <li><strong>ZOHOPEOPLE.forms.READ</strong> — read Zoho People employee form / record data needed for sync</li>
        <li><strong>ZOHOPEOPLE.organization.READ</strong> — read organisation information to verify the connection</li>
      </ul>
      <p>No additional Zoho scopes are requested by the current integration.</p>

      <h2 id="oauth-security">4. OAuth and security</h2>
      <ul>
        <li>Zoho OAuth access and refresh tokens are encrypted at rest</li>
        <li>Tokens are stored server-side in your ShelfMerch tenant record</li>
        <li>Tokens are not exposed to browser JavaScript through public status APIs</li>
        <li>OAuth state validation protects the authorization flow</li>
        <li>Access is separated by ShelfMerch tenant / company</li>
        <li>Embedded Zoho sessions are restricted to integration-related actions</li>
      </ul>

      <h2 id="connecting-org">5. Connecting an organisation</h2>
      <ol>
        <li>Sign in to ShelfMerch as a company administrator.</li>
        <li>Open Integrations → Zoho People → Connect in ShelfMerch.</li>
        <li>Complete Zoho OAuth consent for the scopes above.</li>
        <li>Confirm Connected status, organisation name or ID, and that Sync now is available.</li>
      </ol>

      <h2 id="mapping">6. Employee mapping</h2>
      <p>Current field mapping from Zoho People into ShelfMerch contacts:</p>
      <div class="docs-table-wrap">
        <table>
          <thead><tr><th>Zoho People (aliases read)</th><th>ShelfMerch contact field</th></tr></thead>
          <tbody>
            <tr><td>Zoho record ID (Zoho_ID / recordId / …)</td><td>zohoRecordId</td></tr>
            <tr><td>Employee ID</td><td>employeeCode</td></tr>
            <tr><td>First name / last name / display name</td><td>firstName, lastName, name</td></tr>
            <tr><td>Work email</td><td>email</td></tr>
            <tr><td>Department</td><td>department</td></tr>
            <tr><td>Designation / job title</td><td>designation</td></tr>
            <tr><td>Work location</td><td>workLocation</td></tr>
            <tr><td>Date of joining</td><td>dateOfJoining</td></tr>
            <tr><td>Employment status</td><td>employmentStatus</td></tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li><strong>Missing fields:</strong> optional fields may be stored empty; sync continues when required identifiers exist.</li>
        <li><strong>Skipped records:</strong> missing Zoho record ID, missing employee ID and email, invalid email, unsupported record shape, duplicates in the Zoho response, or database validation failures.</li>
        <li><strong>Updates:</strong> matched primarily by tenant + Zoho record ID; email can help merge when appropriate.</li>
        <li><strong>Phone:</strong> not imported from Zoho by the current sync.</li>
      </ul>

      <h2 id="running-sync">7. Running synchronization</h2>
      <p>Click Sync now after connecting to import or update employees manually. Employees are not synced automatically. Run Sync now again when you need a refresh. Each manual sync returns a summary such as:</p>
      <ul>
        <li><strong>totalFetched</strong> — employee records retrieved from Zoho</li>
        <li><strong>created</strong> — new ShelfMerch contacts created</li>
        <li><strong>updated</strong> — existing contacts updated</li>
        <li><strong>skipped</strong> — records not imported (see skippedByReason)</li>
        <li><strong>failed</strong> — records that failed during save</li>
        <li><strong>skippedByReason</strong> — counts grouped by skip reason</li>
      </ul>

      <h2 id="tenant-isolation">8. Tenant isolation</h2>
      <p>
        Each ShelfMerch organisation has its own Zoho connection and contacts. One ShelfMerch organisation
        cannot access another organisation’s Zoho tokens or employee records.
      </p>

      <h2 id="retention">9. Data retention and deletion</h2>
      <ul>
        <li>Disconnecting stops future synchronisation and clears Zoho tokens for that tenant.</li>
        <li>Imported records may remain until deleted per your instructions and ShelfMerch retention practices.</li>
        <li>Send deletion or access requests to <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>.</li>
        <li>Identity and authority may need verification before organisation or employee-data requests are processed.</li>
      </ul>

      <h2 id="admin-troubleshooting">10. Troubleshooting</h2>
      <ul>
        <li><strong>OAuth redirect errors</strong> — retry Connect; ensure the Marketplace app / redirect configuration matches the installed ShelfMerch app.</li>
        <li><strong>Reconnect required</strong> — complete OAuth again after token refresh failures.</li>
        <li><strong>Missing Zoho People organisation</strong> — confirm the Zoho account can read organisation data; reconnect if needed.</li>
        <li><strong>Insufficient permissions</strong> — approve both forms and organisation read scopes.</li>
        <li><strong>Employee endpoint errors</strong> — temporary Zoho API issues; retry later.</li>
        <li><strong>No employees returned</strong> — verify form data and that records include identifiers ShelfMerch can map.</li>
        <li><strong>Popup blocked</strong> — allow popups for ShelfMerch.</li>
        <li><strong>Sync timeout</strong> — retry; for large directories contact support with timing details.</li>
      </ul>

      <h2 id="support-checklist">11. Support checklist</h2>
      <p>When contacting <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a>, include:</p>
      <ul>
        <li>ShelfMerch organisation name</li>
        <li>Approximate error time</li>
        <li>Screenshot of the safe on-screen error message</li>
        <li>Request ID, when shown</li>
      </ul>
      <div class="docs-callout">
        Never send passwords, access tokens, refresh tokens, OAuth codes, cookies, or client secrets.
      </div>
    `,
  });
}

export function buildZohoPeopleExampleWorkflowHtml() {
  return docsHtmlShell({
    title: 'Example Employee Onboarding Workflow · ShelfMerch for Zoho People',
    description:
      'Example workflow showing how Zoho People and ShelfMerch can support employee onboarding kits and gifts. Not a customer case study.',
    canonical: 'https://shelfmerch.io/case-studies/zoho-people',
    ogTitle: 'Example Onboarding Workflow with Zoho People and ShelfMerch',
    ogDescription:
      'An illustrative workflow for syncing employees and preparing onboarding kits. Not a specific customer result.',
    activePath: '/case-studies/zoho-people',
    breadcrumbsHtml: crumbs(
      { href: '/', label: 'Home' },
      { href: '/docs/zoho-people', label: 'Zoho People docs' },
      { href: '/case-studies/zoho-people', label: 'Example Workflow' },
    ),
    bodyHtml: `
      <span class="docs-badge">Example Workflow</span>
      <h1>Example Employee Onboarding Workflow with Zoho People and ShelfMerch</h1>
      <div class="docs-callout">
        This page demonstrates an <strong>example workflow</strong> and does <strong>not</strong> represent a
        specific customer result. It is not a verified customer case study.
      </div>

      <h2 id="workflow">Example workflow</h2>
      <ol>
        <li>HR adds an employee in Zoho People.</li>
        <li>An administrator synchronizes employees with ShelfMerch.</li>
        <li>ShelfMerch updates or creates the employee contact.</li>
        <li>HR selects the employee as an onboarding recipient.</li>
        <li>A welcome kit or corporate gift is prepared.</li>
        <li>Delivery is tracked in ShelfMerch.</li>
      </ol>

      <h2 id="benefits">Benefits of this approach</h2>
      <ul>
        <li>Reduced manual data entry</li>
        <li>More accurate recipient information</li>
        <li>Faster onboarding preparation</li>
        <li>Centralised employee gifting</li>
        <li>Fewer duplicate records</li>
      </ul>

      <p>
        <a class="docs-cta" href="/docs/zoho-people/user-guide">Read the User Guide</a>
        <a class="docs-cta docs-cta--ghost" href="/docs/zoho-people">Documentation home</a>
      </p>
      <p>Questions? <a href="mailto:support@shelfmerch.com">support@shelfmerch.com</a></p>
    `,
  });
}
