import { describe, it, expect } from 'vitest';
import { env } from '../src/config/env.js';
import {
  emailAssetBaseUrl,
  emailAssetUrl,
  useCidEmailAssets,
} from '../src/services/email-templates/emailLayout.js';
import { buildRedemptionInviteEmail } from '../src/services/email-templates/redemptionInvite.template.js';
import { buildSurpriseGiftEmail } from '../src/services/email-templates/surpriseGift.template.js';

describe('email asset URLs', () => {
  it('uses EMAIL_ASSET_BASE_URL when set to a public host', () => {
    const prev = env.EMAIL_ASSET_BASE_URL;
    env.EMAIL_ASSET_BASE_URL = 'https://cdn.example.com/mail';
    try {
      expect(emailAssetBaseUrl()).toBe('https://cdn.example.com/mail');
      expect(emailAssetUrl('shelfmerch-logo.png')).toBe(
        'https://cdn.example.com/mail/shelfmerch-logo.png',
      );
      expect(emailAssetUrl('shelfmerch-logo.png')).not.toContain('data:');
      expect(emailAssetUrl('shelfmerch-logo.png')).not.toContain('cid:');
    } finally {
      env.EMAIL_ASSET_BASE_URL = prev;
    }
  });

  it('uses CID references in non-production when base is unset (no data URIs)', () => {
    const prevAsset = env.EMAIL_ASSET_BASE_URL;
    const prevNode = env.NODE_ENV;
    env.EMAIL_ASSET_BASE_URL = '';
    env.NODE_ENV = 'development';
    try {
      expect(useCidEmailAssets()).toBe(true);
      expect(emailAssetUrl('shelfmerch-logo.png')).toBe('cid:shelfmerch-logo@shelfmerch');
      expect(emailAssetUrl('email-hero-banner.png')).toBe('cid:email-hero-banner@shelfmerch');
      expect(emailAssetUrl('shelfmerch-logo.png')).not.toContain('data:');
      expect(emailAssetUrl('email-hero-banner.png')).not.toContain('base64');
    } finally {
      env.EMAIL_ASSET_BASE_URL = prevAsset;
      env.NODE_ENV = prevNode;
    }
  });

  it('defaults to production CDN HTTPS when NODE_ENV is production and base is unset', () => {
    const prevAsset = env.EMAIL_ASSET_BASE_URL;
    const prevNode = env.NODE_ENV;
    env.EMAIL_ASSET_BASE_URL = '';
    env.NODE_ENV = 'production';
    try {
      expect(useCidEmailAssets()).toBe(false);
      expect(emailAssetBaseUrl()).toBe('https://shelfmerch.io/email-assets');
      expect(emailAssetUrl('shelfmerch-logo.png')).toBe(
        'https://shelfmerch.io/email-assets/shelfmerch-logo.png',
      );
      expect(emailAssetUrl('shelfmerch-logo.png')).not.toContain('cid:');
      expect(emailAssetUrl('shelfmerch-logo.png')).not.toContain('data:');
    } finally {
      env.EMAIL_ASSET_BASE_URL = prevAsset;
      env.NODE_ENV = prevNode;
    }
  });
});

describe('redemption invite email template', () => {
  it('renders branded kit invite with CTA and sender details', () => {
    const prevAppUrl = env.APP_URL;
    const prevAssetBase = env.EMAIL_ASSET_BASE_URL;
    env.APP_URL = 'https://app.shelfmerch.com';
    env.EMAIL_ASSET_BASE_URL = 'https://shelfmerch.io/email-assets';
    try {
      const { subject, html, text } = buildRedemptionInviteEmail({
        recipientName: 'Priya Sharma',
        senderName: 'People Team, Rubix',
        message: "Your welcome kit is on its way! A little something from all of us — we're so glad you're here.",
        giftName: 'Welcome Kit',
        companyName: 'Rubix',
        link: '/redeem/test-token-abc',
        campaignType: 'kit',
        shopName: 'Salesforce',
      });

      expect(subject).toBe('People Team, Rubix sent you a gift');
      expect(html).toContain('https://shelfmerch.io/email-assets/shelfmerch-logo.png');
      expect(html).toContain('alt="Shelf Merch"');
      expect(html).toContain('Claim your gift');
      expect(html).toContain('People Team, Rubix');
      expect(html).toContain('Welcome Kit');
      expect(html).toContain('gift from');
      expect(html).toContain('Rubix');
      expect(html).toContain('redeem/test-token-abc');
      expect(html).toContain('https://shelfmerch.io/email-assets/email-hero-banner.png');
      expect(html).toContain('background-image');
      expect(html).not.toContain('cid:');
      expect(html).not.toContain('data:image');
      expect(html).not.toContain('base64');
      expect(html).not.toContain('shelfmerch-logo@shelfmerch');
      expect(html).not.toContain('email-hero-banner@shelfmerch');
      expect(html).not.toContain('em-hero-desktop');
      expect(html).not.toContain('em-hero-mobile');
      expect(html).not.toContain('email-hero-art@shelfmerch');
      expect(html).not.toContain('em-hero-art');
      expect(html).toContain('em-hero-copy');
      expect(html).not.toContain('Link expires in 30 days');
      expect(text).toContain('Priya Sharma');
      expect(text).not.toContain('Link expires in 30 days');
      expect(html).toContain('#F0F0F0');
      expect(html).toContain('#3155FF');
      expect(html).toContain('Helvetica Neue');
      expect(html).toContain('A gift is waiting for you');
    } finally {
      env.APP_URL = prevAppUrl;
      env.EMAIL_ASSET_BASE_URL = prevAssetBase;
    }
  });

  it('renders points invite with shop-scoped copy and redeem CTA', () => {
    const { subject, html, text } = buildRedemptionInviteEmail({
      recipientName: 'Alex',
      senderName: 'sm',
      giftName: 'test',
      companyName: 'IBM',
      link: '/redeem/points-token',
      campaignType: 'points',
      pointsScope: 'shop',
      shopName: 'test',
      shopCurrencyMode: 'points',
    });

    expect(subject).toBe("You've received reward points from sm");
    expect(html).toContain("You&#39;ve earned");
    expect(html).toContain('reward points');
    expect(html).toContain('Redeem your points');
    expect(html).toContain('redeem in');
    expect(html).toContain('test');
    expect(html).not.toContain('SENT YOU A GIFT');
    expect(text).toContain('Alex');
    expect(text).toContain('Redeem these points exclusively in test.');
  });

  it('escapes user-supplied HTML in message body', () => {
    const { html } = buildRedemptionInviteEmail({
      senderName: 'Team',
      message: '<script>alert(1)</script>',
      giftName: 'Kit',
      companyName: 'Co',
      link: '/redeem/x',
      campaignType: 'kit',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('surprise gift email template', () => {
  it('informs the recipient without redemption actions or a link', () => {
    const { subject, html, text } = buildSurpriseGiftEmail({
      recipientName: 'Priya Sharma',
      senderName: 'People Team, Rubix',
      message: 'A little something from all of us.',
      giftName: 'Welcome Kit',
      companyName: 'Rubix',
    });

    expect(subject).toBe("You've received a gift from Rubix!");
    expect(html).toContain('Rubix is sending');
    expect(html).toContain('No action required');
    expect(html).not.toContain('Claim your gift');
    expect(html).not.toContain('How to claim');
    expect(html).not.toContain('Link expires');
    expect(html).not.toContain('/redeem/');
    expect(text).toContain('shipped automatically to your address on file');
  });

  it('omits the personal-message quote when no message was entered', () => {
    const { html, text } = buildSurpriseGiftEmail({
      recipientName: 'Priya Sharma',
      senderName: 'Zira',
      message: '',
      giftName: 'Welcome Kit',
      companyName: 'Zira',
    });

    expect(html).not.toContain('&ldquo;');
    expect(text).not.toContain('""');
  });
});
