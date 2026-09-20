# Social Connect — Secret Rotation Runbook
**Classification:** Internal Operating Procedure  
**Last Updated:** September 2026

---

## When to Rotate

Rotate secrets **immediately** when any of the following occur:

- A secret has been committed to version control (even briefly)
- A team member with secret access leaves the organization
- A suspected or confirmed security incident
- A production database or CI/CD system is compromised
- A secret provider (Cloudinary, email service) reports a breach
- Scheduled rotation (recommended: every 90 days for JWT secrets)

---

## JWT Access Secret (`JWT_ACCESS_SECRET`)

**Effect of rotation:** ALL currently valid access tokens become immediately invalid. Every user is forced to use their refresh token to get a new access token. Access tokens have a 15-minute TTL, so disruption lasts at most 15 minutes.

```bash
# 1. Generate new secret (minimum 64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 2. Update in deployment environment (Render, Railway, etc.)
#    Environment variable: JWT_ACCESS_SECRET

# 3. Redeploy the application
#    Rolling restart: new instances will use new secret
#    After 15 minutes: all old tokens are expired naturally
```

---

## JWT Refresh Secret (`JWT_REFRESH_SECRET`)

**Effect of rotation:** ALL currently valid refresh tokens become immediately invalid. Every user will need to log in again.

```bash
# 1. Generate new secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 2. Optionally: Revoke all sessions before rotation (cleaner)
#    Connect to MongoDB and run:
#    db.sessions.updateMany({}, { $set: { revokedAt: new Date(), revokedReason: 'SECRET_ROTATION' }})

# 3. Update JWT_REFRESH_SECRET in deployment environment

# 4. Redeploy — all users will need to re-authenticate
```

---

## MongoDB Connection URI (`MONGODB_URI`)

**Effect of rotation:** Application cannot connect to database until new URI is deployed.

```bash
# 1. On MongoDB Atlas: Database Access > Edit User > Update password
#    OR: Create a new database user

# 2. Construct new URI with new credentials

# 3. Update MONGODB_URI in deployment environment

# 4. Redeploy the application

# 5. Verify: curl https://your-domain/api/health
```

---

## Cloudinary Credentials

**Effect of rotation:** Image uploads and deletions will fail until new credentials are deployed.

```bash
# 1. On Cloudinary dashboard: Settings > Access Keys > Generate New Key

# 2. Update in deployment environment:
#    CLOUDINARY_API_KEY=<new-key>
#    CLOUDINARY_API_SECRET=<new-secret>
#    CLOUDINARY_CLOUD_NAME does not change

# 3. Revoke old API key from Cloudinary dashboard

# 4. Redeploy the application
```

---

## Email Service Credentials (`SMTP_PASSWORD` or `EMAIL_API_KEY`)

**Effect of rotation:** Email sending (verification, password reset) will fail until new credentials are deployed.

```bash
# 1. Generate new app password or API key from email provider

# 2. Update in deployment environment:
#    SMTP_PASSWORD=<new-password>

# 3. Test email sending after redeployment
```

---

## Session Secret (`SESSION_SECRET`)

**Effect of rotation:** All existing cookie-based sessions are invalidated. Users must re-authenticate.

```bash
# Generate new secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Update SESSION_SECRET in deployment environment
# Redeploy
```

---

## Verification After Rotation

After rotating any secret, verify the application is functioning:

```bash
# Health check
curl https://your-domain/api/health

# Verify MongoDB connectivity
curl https://your-domain/api/health | python -m json.tool

# Smoke test login flow
curl -X POST https://your-domain/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword"}'
```

---

## CI/CD Secret Rotation (GitHub Actions)

When rotating secrets used in CI/CD:

1. Go to GitHub → Repository → Settings → Secrets and variables → Actions
2. Click the secret name → "Update"
3. Paste the new secret value
4. Trigger a new CI run to verify the pipeline still passes
5. If the old secret was leaked from CI logs, also rotate all derived credentials

---

## Secret Storage Principles

| ✅ DO | ❌ DON'T |
|------|---------|
| Store secrets in environment variables | Hardcode secrets in source code |
| Use a secrets manager (e.g., Doppler, Vault) | Commit secrets to `.env` files in git |
| Rotate after every suspected exposure | Reuse the same secret across environments |
| Use different secrets per environment | Share production secrets with developers |
| Audit who has access to secrets | Leave old secrets active after rotation |
