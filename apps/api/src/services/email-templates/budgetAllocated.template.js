import {
  appUrl,
  callout,
  ctaButton,
  detailRows,
  emailShell,
  greeting,
  paragraph,
  signOff,
  strong,
} from './emailLayout.js';

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '');
  return `₹${n.toLocaleString('en-IN')}`;
}

/**
 * Notification when additional budget is allocated to an active Entity Manager.
 * Not an invitation — existing password / account stay unchanged.
 */
export function buildBudgetAllocatedEmail({
  recipientName = '',
  amount = 0,
  newBalance = null,
  departmentName = '',
  organizationName = 'your organization',
  link = '',
} = {}) {
  const amountLabel = formatInr(amount);
  const organizationLabel = String(organizationName || '').trim() || 'your organization';
  const balanceLabel =
    newBalance == null || !Number.isFinite(Number(newBalance)) ? null : formatInr(newBalance);
  const subject = `Additional budget allocated ${amountLabel}`;
  const walletLink = link || appUrl('/login');

  const text = [
    recipientName ? `Hello ${recipientName},` : 'Hello,',
    '',
    `Additional budget has been added to your wallet.`,
    `${amountLabel} has been allocated to your account${departmentName ? ` for ${departmentName}` : ''}.`,
    balanceLabel ? `Your updated available balance is ${balanceLabel}.` : '',
    '',
    `Log in to view your wallet: ${walletLink}`,
    '',
    'Thanks,',
    'The ShelfMerch Team',
  ]
    .filter(Boolean)
    .join('\n');

  const bodyHtml = `
    ${greeting(recipientName)}
    ${paragraph(
      `Additional budget has been added to your wallet. ${strong(amountLabel)} has been allocated to your account${
        departmentName ? ` for ${strong(departmentName)}` : ''
      }.`,
    )}
    ${
      balanceLabel
        ? paragraph(`Your updated available balance is ${strong(balanceLabel)}.`)
        : ''
    }
    ${ctaButton('View Wallet', walletLink)}
    ${detailRows([
      { label: 'Amount added', value: amountLabel },
      { label: 'Department', value: departmentName },
      { label: 'Organization', value: organizationLabel },
      ...(balanceLabel ? [{ label: 'Updated balance', value: balanceLabel }] : []),
    ])}
    ${callout(
      '',
      'This is a budget notification only. Your existing ShelfMerch password and account remain unchanged.',
    )}
    ${signOff()}`;

  const html = emailShell({
    title: subject,
    heroEyebrow: `${organizationLabel} Budget`,
    heroTitle: 'Budget added to your wallet',
    preheader: `${amountLabel} has been allocated to your account. Log in to view your updated balance.`,
    footerNote: 'You are receiving this because budget was allocated to your department.',
    bodyHtml,
  });

  return { subject, text, html };
}
