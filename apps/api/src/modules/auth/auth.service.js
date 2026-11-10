import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env, REFRESH_TTL_MS } from '../../config/env.js';
import { accessSignOptions } from '../../config/jwt.js';
import { sendPasswordResetEmail, sendSignupVerificationEmail } from '../../services/email.service.js';
import { SignupPending } from './signupPending.model.js';
import mongoose from 'mongoose';
import { User } from '../users/user.model.js';
import { RoleAssignment } from '../roles/roleAssignment.model.js';
import { RefreshToken } from './refreshToken.model.js';
import { PasswordResetToken } from './passwordResetToken.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import {
  createSession,
  getSession,
  isSessionStoreReady,
  revokeAllUserSessions,
  revokeSession,
} from '../../services/session.service.js';
import { ApiError, ConflictError, UnauthorizedError } from '../../utils/errors.js';
import { assertAllowedAuthEmail } from './workEmail.js';

const BCRYPT_ROUNDS = 12;
/** Parallel tab refreshes present the just-rotated token; don't treat that as theft. */
const REFRESH_REUSE_GRACE_MS = 15 * 1000;
const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const SIGNUP_OTP_TTL_MS = 2 * 60 * 1000;
const SIGNUP_RESEND_COOLDOWN_MS = 30 * 1000;
/** Pending signup docs auto-expire (Mongo TTL) after this window. */
const SIGNUP_PENDING_TTL_MS = 30 * 60 * 1000;

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function signAccessToken(user, roleAssignment, impersonation = null, { expiresIn } = {}) {
  const payload = {
    sub: String(user._id),
    tenantId: roleAssignment.tenantId ? String(roleAssignment.tenantId) : null,
    role: roleAssignment.role,
    scopeType: roleAssignment.scopeType,
    scopeId: roleAssignment.scopeId ? String(roleAssignment.scopeId) : null,
    assignedEntityIds: (roleAssignment.assignedEntityIds ?? []).map(String),
    sv: user.sessionVersion ?? 0,
    ...(impersonation ? { impersonation } : {}),
  };
  return jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET,
    accessSignOptions({ expiresIn: expiresIn ?? env.JWT_ACCESS_TTL, jwtid: crypto.randomUUID() }),
  );
}

/** Short-lived token for platform impersonation (§6.4). */
export function signImpersonationAccessToken(user, roleAssignment, impersonation) {
  const payload = {
    sub: String(user._id),
    tenantId: roleAssignment.tenantId ? String(roleAssignment.tenantId) : null,
    role: roleAssignment.role,
    scopeType: roleAssignment.scopeType,
    scopeId: roleAssignment.scopeId ? String(roleAssignment.scopeId) : null,
    assignedEntityIds: (roleAssignment.assignedEntityIds ?? []).map(String),
    impersonation,
  };
  return jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET,
    accessSignOptions({ expiresIn: '15m', jwtid: crypto.randomUUID() }),
  );
}

export async function issueRefreshToken(userId, { ip = '', userAgent = '' } = {}) {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = sha256(token);
  const deviceInfo = String(userAgent || '').slice(0, 512);
  const ipAddress = String(ip || '').slice(0, 64);
  // Mongo is the source of truth (hashed only). Redis is an optional cache.
  await RefreshToken.create({
    userId,
    tokenHash,
    ip: ipAddress,
    ipAddress,
    userAgent: deviceInfo,
    deviceInfo,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  if (await isSessionStoreReady()) {
    await createSession({ userId, tokenHash, ip: ipAddress, userAgent: deviceInfo });
  }
  return token;
}

/** Revoke every device session and bump sessionVersion so live access JWTs die. */
async function invalidateAllSessions(userId) {
  if (!userId) return;
  await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } });
  if (await isSessionStoreReady()) await revokeAllUserSessions(userId);
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
  const { revokeOauthGrantsForUser } = await import('../oauth/oauthRevoke.js');
  await revokeOauthGrantsForUser(userId);
}

async function revokeStoredRefreshToken(tokenHash, userId = null) {
  if (await isSessionStoreReady()) {
    const session = userId ? { userId: String(userId) } : await getSession(tokenHash);
    await revokeSession({ tokenHash, userId: session?.userId ?? userId });
  }
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
}

export async function getPrimaryRoleAssignment(userId) {
  const assignments = await RoleAssignment.find({ userId }).sort({ createdAt: 1 });
  if (!assignments.length) throw new ApiError(403, 'User has no role assignment', 'NO_ROLE');
  const tenantScoped = assignments.find((a) => a.scopeType !== 'platform' && a.tenantId);
  return tenantScoped ?? assignments[0];
}

function publicUser(user, roleAssignment) {
  return {
    id: String(user._id),
    tenantId: roleAssignment.tenantId ? String(roleAssignment.tenantId) : null,
    name: user.name,
    email: user.email,
    role: roleAssignment.role,
    scopeType: roleAssignment.scopeType,
    assignedEntityIds: (roleAssignment.assignedEntityIds ?? []).map(String),
  };
}

function slugifyCompany(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 2 ? base : 'workspace';
}

async function uniqueTenantSlug(companyName) {
  let slug = slugifyCompany(companyName);
  let attempt = 0;
  while (await Tenant.findOne({ slug }).setOptions({ skipTenantGuard: true })) {
    attempt += 1;
    slug = `${slugifyCompany(companyName)}-${attempt}`;
  }
  return slug;
}

async function createCompanyAdminAccount({
  name,
  email,
  passwordHash,
  companyName,
  googleId = null,
  ip,
  userAgent,
}) {
  const { getSetting } = await import('../platform/platformSettings.service.js');
  const signupMode = await getSetting('signup.mode');
  if (signupMode === 'closed') {
    throw new ApiError(403, 'Self-service signup is currently disabled', 'SIGNUP_CLOSED');
  }

  const slug = await uniqueTenantSlug(companyName);
  const tenantStatus = signupMode === 'open' ? 'active' : 'trial';

  const session = await mongoose.startSession();
  let user;
  let roleAssignment;
  try {
    await session.withTransaction(async () => {
      const [tenant] = await Tenant.create(
        [{ name: companyName, slug, currency: 'INR', status: tenantStatus }],
        { session },
      );
      [user] = await User.create(
        [
          {
            tenantId: tenant._id,
            name,
            email,
            passwordHash,
            googleId,
            status: 'active',
          },
        ],
        { session },
      );
      [roleAssignment] = await RoleAssignment.create(
        [
          {
            tenantId: tenant._id,
            userId: user._id,
            role: 'company_admin',
            scopeType: 'tenant',
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return {
    accessToken: signAccessToken(user, roleAssignment),
    refreshToken: await issueRefreshToken(user._id, { ip, userAgent }),
    user: publicUser(user, roleAssignment),
  };
}

export async function register({ name, email, password, companyName, ip, userAgent, googleId = null }) {
  await assertAllowedAuthEmail(email);

  const normalizedEmail = email.toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ConflictError('An account with this email already exists — try logging in instead');
  }

  const passwordHash = password ? await hashPassword(password) : null;
  return createCompanyAdminAccount({
    name,
    email: normalizedEmail,
    passwordHash,
    companyName,
    googleId,
    ip,
    userAgent,
  });
}

function hashSignupOtp(email, otp) {
  return sha256(`${String(email).toLowerCase()}:${otp}`);
}

function generateSignupOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/**
 * Begin email/password signup — stores pending payload + hashed OTP, does NOT create User.
 */
export async function startSignup({ name, email, password, companyName, ip = '' }) {
  await assertAllowedAuthEmail(email);

  const { getSetting } = await import('../platform/platformSettings.service.js');
  const signupMode = await getSetting('signup.mode');
  if (signupMode === 'closed') {
    throw new ApiError(403, 'Self-service signup is currently disabled', 'SIGNUP_CLOSED');
  }

  const normalizedEmail = email.toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ApiError(409, 'Account already exists. Please sign in.', 'EMAIL_EXISTS');
  }

  // Invalidate any prior pending signup for this email.
  await SignupPending.deleteMany({ email: normalizedEmail });

  const otp = generateSignupOtp();
  const now = Date.now();
  const pending = await SignupPending.create({
    email: normalizedEmail,
    name,
    companyName,
    passwordHash: await hashPassword(password),
    otpHash: hashSignupOtp(normalizedEmail, otp),
    otpExpiresAt: new Date(now + SIGNUP_OTP_TTL_MS),
    resendAvailableAt: new Date(now + SIGNUP_RESEND_COOLDOWN_MS),
    createdIp: ip || '',
    expiresAt: new Date(now + SIGNUP_PENDING_TTL_MS),
  });

  await sendSignupVerificationEmail(normalizedEmail, otp);

  return {
    pendingId: pending.pendingId,
    email: normalizedEmail,
    emailMasked: maskEmail(normalizedEmail),
    otpExpiresInSec: Math.ceil(SIGNUP_OTP_TTL_MS / 1000),
    resendAvailableInSec: Math.ceil(SIGNUP_RESEND_COOLDOWN_MS / 1000),
  };
}

export async function resendSignupOtp({ pendingId }) {
  const pending = await SignupPending.findOne({ pendingId }).select('+otpHash +passwordHash');
  if (!pending || pending.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'Signup session expired. Please sign up again.', 'SIGNUP_SESSION_EXPIRED');
  }

  const waitMs = pending.resendAvailableAt.getTime() - Date.now();
  if (waitMs > 0) {
    throw new ApiError(429, 'Please wait before requesting a new code.', 'RESEND_COOLDOWN', {
      retryAfterSec: Math.ceil(waitMs / 1000),
    });
  }

  const existingUser = await User.findOne({ email: pending.email });
  if (existingUser) {
    await SignupPending.deleteOne({ _id: pending._id });
    throw new ApiError(409, 'Account already exists. Please sign in.', 'EMAIL_EXISTS');
  }

  const otp = generateSignupOtp();
  const now = Date.now();
  pending.otpHash = hashSignupOtp(pending.email, otp);
  pending.otpExpiresAt = new Date(now + SIGNUP_OTP_TTL_MS);
  pending.resendAvailableAt = new Date(now + SIGNUP_RESEND_COOLDOWN_MS);
  await pending.save();

  await sendSignupVerificationEmail(pending.email, otp);

  return {
    pendingId: pending.pendingId,
    email: pending.email,
    emailMasked: maskEmail(pending.email),
    otpExpiresInSec: Math.ceil(SIGNUP_OTP_TTL_MS / 1000),
    resendAvailableInSec: Math.ceil(SIGNUP_RESEND_COOLDOWN_MS / 1000),
  };
}

/**
 * Verify signup OTP → create user + issue session tokens (auto login).
 */
export async function verifySignupOtp({ pendingId, otp, ip, userAgent }) {
  const pending = await SignupPending.findOne({ pendingId }).select('+otpHash +passwordHash');
  if (!pending || pending.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, 'Signup session expired. Please sign up again.', 'SIGNUP_SESSION_EXPIRED');
  }

  if (pending.otpExpiresAt.getTime() <= Date.now()) {
    throw new ApiError(
      400,
      'Verification code has expired. Please request a new code.',
      'OTP_EXPIRED',
    );
  }

  const expected = hashSignupOtp(pending.email, String(otp || '').trim());
  if (expected !== pending.otpHash) {
    throw new ApiError(400, 'Incorrect verification code. Please try again.', 'OTP_INVALID');
  }

  const existingUser = await User.findOne({ email: pending.email });
  if (existingUser) {
    await SignupPending.deleteOne({ _id: pending._id });
    throw new ApiError(409, 'Account already exists. Please sign in.', 'EMAIL_EXISTS');
  }

  const result = await createCompanyAdminAccount({
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash,
    companyName: pending.companyName,
    ip,
    userAgent,
  });

  await SignupPending.deleteOne({ _id: pending._id });
  await SignupPending.deleteMany({ email: pending.email });

  return result;
}

export async function login({ email, password, ip, userAgent }) {
  await assertAllowedAuthEmail(email);

  const normalizedEmail = email.toLowerCase();
  const { DEMO_LOGIN_EMAIL, verifyDemoLoginPassword } = await import('../platform/platformSettings.service.js');
  const isDemoLogin = normalizedEmail === DEMO_LOGIN_EMAIL;

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  if (!user) {
    throw new ApiError(
      401,
      'No account exists with this email. Sign up to create one.',
      'NO_ACCOUNT',
    );
  }
  if (!user.passwordHash && !isDemoLogin) {
    throw new ApiError(401, 'Incorrect password.', 'INVALID_CREDENTIALS');
  }
  if (user.status === 'suspended') {
    throw new ApiError(
      403,
      'Your account has been suspended. Please contact Shelf Merch support.',
      'ACCOUNT_SUSPENDED',
    );
  }
  if (user.status === 'invited') {
    throw new ApiError(403, 'Invite not yet accepted — set your password first', 'INVITE_PENDING');
  }

  // Tell archived/suspended workspaces before the password check so users see
  // a clear contact message instead of a generic "Incorrect password".
  if (user.tenantId) {
    const tenant = await Tenant.findOne({ _id: user.tenantId }).select('status');
    if (tenant?.status === 'archived' || tenant?.status === 'suspended') {
      throw new ApiError(
        403,
        'Your organization account has been suspended. Please contact Shelf Merch support.',
        tenant.status === 'archived' ? 'TENANT_ARCHIVED' : 'TENANT_SUSPENDED',
      );
    }
  }

  // Temporary: account lockout timer disabled — clear any leftover locks.
  if (user.lockedUntil || user.failedLoginCount) {
    await User.updateOne({ _id: user._id }, { lockedUntil: null, failedLoginCount: 0 });
    user.lockedUntil = null;
    user.failedLoginCount = 0;
  }

  const ok = isDemoLogin
    ? await verifyDemoLoginPassword({ email: normalizedEmail, password })
    : await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new ApiError(401, 'Incorrect password.', 'INVALID_CREDENTIALS');
  }

  if (user.tenantId) {
    const tenant = await Tenant.findOne({ _id: user.tenantId }).select('status');
    if (tenant?.status === 'archived') {
      throw new UnauthorizedError('This workspace has been archived — contact support');
    }
    if (tenant?.status === 'suspended') {
      throw new UnauthorizedError('This workspace has been suspended — contact support');
    }
  }

  const roleAssignment = await getPrimaryRoleAssignment(user._id);
  user.lastLoginAt = new Date();
  if (user.failedLoginCount || user.lockedUntil) {
    user.failedLoginCount = 0;
    user.lockedUntil = null;
  }
  await user.save();

  return {
    accessToken: signAccessToken(user, roleAssignment),
    refreshToken: await issueRefreshToken(user._id, { ip, userAgent }),
    user: publicUser(user, roleAssignment),
  };
}

export async function refresh({ refreshToken, ip, userAgent }) {
  if (!refreshToken) {
    throw new UnauthorizedError(SESSION_EXPIRED_MESSAGE, 'SESSION_EXPIRED');
  }

  const tokenHash = sha256(refreshToken);
  const stored = await RefreshToken.findOne({ tokenHash });
  let userId = null;

  if (stored) {
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedError(SESSION_EXPIRED_MESSAGE, 'SESSION_EXPIRED');
    }
    if (stored.revokedAt) {
      const age = Date.now() - new Date(stored.revokedAt).getTime();
      // A second in-flight refresh from another tab still holds the previous cookie.
      if (age <= REFRESH_REUSE_GRACE_MS) {
        throw new UnauthorizedError(SESSION_EXPIRED_MESSAGE, 'REFRESH_IN_PROGRESS');
      }
      // Reuse after rotation is a replay. Kill every device session.
      await invalidateAllSessions(stored.userId);
      throw new UnauthorizedError(SESSION_EXPIRED_MESSAGE, 'SESSION_EXPIRED');
    }
    userId = stored.userId;
  } else if (await isSessionStoreReady()) {
    const session = await getSession(tokenHash);
    if (session) userId = session.userId;
  }

  if (!userId) {
    throw new UnauthorizedError(SESSION_EXPIRED_MESSAGE, 'SESSION_EXPIRED');
  }

  const user = await User.findOne({ _id: userId });
  if (!user || user.status !== 'active') {
    throw new UnauthorizedError(SESSION_EXPIRED_MESSAGE, 'SESSION_EXPIRED');
  }

  const { DEMO_LOGIN_EMAIL, getDemoLoginPasswordStatus } = await import('../platform/platformSettings.service.js');
  if (user.email === DEMO_LOGIN_EMAIL) {
    const status = await getDemoLoginPasswordStatus();
    if (!status.active) {
      await revokeStoredRefreshToken(tokenHash, userId);
      throw new UnauthorizedError('Demo login password expired or revoked');
    }
  }

  if (user.tenantId) {
    const tenant = await Tenant.findOne({ _id: user.tenantId }).select('status');
    if (tenant?.status === 'archived' || tenant?.status === 'suspended') {
      throw new ApiError(
        403,
        'Your organization account has been suspended. Please contact Shelf Merch support.',
        tenant.status === 'archived' ? 'TENANT_ARCHIVED' : 'TENANT_SUSPENDED',
      );
    }
  }

  await revokeStoredRefreshToken(tokenHash, userId);

  const roleAssignment = await getPrimaryRoleAssignment(user._id);
  return {
    accessToken: signAccessToken(user, roleAssignment),
    refreshToken: await issueRefreshToken(user._id, { ip, userAgent }),
    user: publicUser(user, roleAssignment),
  };
}

export async function logout({ refreshToken, everywhere = false, userId = null }) {
  if (everywhere) {
    if (!userId) throw new UnauthorizedError(SESSION_EXPIRED_MESSAGE, 'SESSION_EXPIRED');
    await invalidateAllSessions(userId);
    return;
  }
  if (refreshToken) {
    await revokeStoredRefreshToken(sha256(refreshToken));
  }
}

async function purgeExpiredResetTokens() {
  await PasswordResetToken.deleteMany({ expiresAt: { $lt: new Date() } });
}

export async function forgotPassword({ email, ip = '' }) {
  await purgeExpiredResetTokens();
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || user.status === 'suspended') return { sent: false };

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await PasswordResetToken.updateMany(
    { userId: user._id, usedAt: null },
    { usedAt: new Date() },
  );

  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    createdIp: ip || '',
  });

  if (user.passwordResetTokenHash || user.passwordResetExpiresAt) {
    await User.updateOne(
      { _id: user._id },
      { passwordResetTokenHash: null, passwordResetExpiresAt: null },
    );
  }

  await sendPasswordResetEmail(user.email, token);
  return { sent: true, userId: String(user._id) };
}

export async function validateResetToken({ token }) {
  if (!token) {
    return { valid: false, reason: 'invalid' };
  }

  const tokenHash = sha256(token);
  const record = await PasswordResetToken.findOne({ tokenHash }).select('+tokenHash');
  if (!record) {
    const legacy = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+passwordResetTokenHash email');
    if (legacy) {
      return { valid: true, email: legacy.email, reason: null };
    }
    return { valid: false, reason: 'invalid' };
  }

  if (record.usedAt) {
    return { valid: false, reason: 'used' };
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    return { valid: false, reason: 'expired' };
  }

  const user = await User.findById(record.userId).select('email status');
  if (!user || user.status === 'suspended') {
    return { valid: false, reason: 'invalid' };
  }

  return { valid: true, email: user.email, reason: null };
}

export async function resetPassword({ token, newPassword }) {
  const tokenHash = sha256(token);
  let user = null;
  let resetRecord = null;

  resetRecord = await PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+tokenHash');

  if (resetRecord) {
    user = await User.findById(resetRecord.userId).select('+passwordHash');
  } else {
    user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select('+passwordHash +passwordResetTokenHash');
  }

  if (!user) {
    const used = await PasswordResetToken.findOne({ tokenHash }).select('+tokenHash');
    if (used?.usedAt) {
      throw new ApiError(400, 'This reset link has already been used', 'RESET_TOKEN_USED');
    }
    throw new ApiError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
  }

  if (user.passwordHash) {
    const same = await bcrypt.compare(newPassword, user.passwordHash);
    if (same) {
      throw new ApiError(
        400,
        'New password must be different from your current password',
        'PASSWORD_REUSED',
      );
    }
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  await user.save();

  if (resetRecord) {
    resetRecord.usedAt = new Date();
    await resetRecord.save();
  }
  await PasswordResetToken.updateMany(
    { userId: user._id, usedAt: null },
    { usedAt: new Date() },
  );

  await logout({ everywhere: true, userId: user._id });

  return { userId: String(user._id) };
}
