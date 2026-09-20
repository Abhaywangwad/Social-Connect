/**
 * Admin Bootstrap Script: Promote an existing user to ADMIN role.
 *
 * Usage:
 *   node scripts/create_admin.js --username=<username>
 *
 * Environment:
 *   Requires ADMIN_PROMOTE_SECRET env var to be set and provided via
 *   ADMIN_SECRET=<secret> on the command line to prevent unauthorized usage.
 *
 * Example:
 *   ADMIN_SECRET=mysecret node scripts/create_admin.js --username=abhay
 *
 * Security:
 *   - Only works when ADMIN_PROMOTE_SECRET is set in .env / environment.
 *   - Caller must provide the secret via ADMIN_SECRET environment variable.
 *   - Does NOT create new users. Only promotes an existing account.
 *   - Production usage requires the --force flag with explicit acknowledgment.
 *   - Never hardcodes credentials.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

// ─── Parse CLI Arguments ──────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, ...rest] = a.slice(2).split('=');
      return [key, rest.join('=') || true];
    })
);

const username = args.username?.toLowerCase?.()?.trim?.();
const forceFlag = args.force === true || args.force === 'true';

// ─── Validation ────────────────────────────────────────────────────────────────
if (!username) {
  console.error('❌ --username argument is required');
  console.error('   Usage: node scripts/create_admin.js --username=<username>');
  process.exit(1);
}

// ─── Environment Guard ─────────────────────────────────────────────────────────
const NODE_ENV = process.env.NODE_ENV || 'development';
const ADMIN_PROMOTE_SECRET = process.env.ADMIN_PROMOTE_SECRET;
const PROVIDED_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_PROMOTE_SECRET) {
  console.error('❌ ADMIN_PROMOTE_SECRET environment variable is not set.');
  console.error('   Set it in your .env file before running this script.');
  process.exit(1);
}

if (PROVIDED_SECRET !== ADMIN_PROMOTE_SECRET) {
  console.error('❌ Incorrect ADMIN_SECRET. Unauthorized promotion attempt blocked.');
  process.exit(1);
}

// ─── Production Safety Gate ────────────────────────────────────────────────────
if (NODE_ENV === 'production' && !forceFlag) {
  console.error('❌ Running in production environment.');
  console.error('   Pass --force to confirm you intend to run this in production.');
  console.error('   Usage: node scripts/create_admin.js --username=<username> --force');
  process.exit(1);
}

// ─── Database Connection & Promotion ──────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set.');
  process.exit(1);
}

console.log(`\n🔐 Admin Promotion Script`);
console.log(`   Environment : ${NODE_ENV}`);
console.log(`   Target user : @${username}`);
console.log(`   Time        : ${new Date().toISOString()}\n`);

try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Connected to MongoDB\n');

  // Find user — never .lean() here since we need .save()
  const user = await User.findOne({ username }).select('+role accountStatus emailVerified createdAt');

  if (!user) {
    console.error(`❌ User '@${username}' not found in the database.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const previousRole = user.role || 'USER';

  if (previousRole === 'ADMIN') {
    console.log(`ℹ️  User '@${username}' is already an ADMIN. No changes made.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  // Promote to admin
  user.role = 'ADMIN';
  await user.save();

  // ─── Summary Table ─────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════╗');
  console.log('║          Admin Promotion Complete         ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ Username      : @${user.username.padEnd(24)}║`);
  console.log(`║ User ID       : ${user._id.toString().padEnd(24)}║`);
  console.log(`║ Previous Role : ${'USER'.padEnd(24)}║`);
  console.log(`║ New Role      : ${'ADMIN'.padEnd(24)}║`);
  console.log(`║ Status        : ${(user.accountStatus || 'ACTIVE').padEnd(24)}║`);
  console.log(`║ Email         : ${(user.emailVerified ? 'Verified' : 'Unverified').padEnd(24)}║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('\n✅ Admin role granted successfully.\n');

  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error('❌ Script failed:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
}
