# Social Connect — Security Incident Response
**Classification:** Internal Operating Procedure  
**Last Updated:** September 2026

---

## Incident Severity Levels

| Level | Description | Response SLA |
|-------|-------------|--------------|
| **P1 — Critical** | Active breach, data exfiltration, authentication bypass in production | Immediate (< 1 hour) |
| **P2 — High** | Known vulnerability with PoC, significant data at risk | Same day (< 8 hours) |
| **P3 — Medium** | Limited exposure, no immediate exploitation confirmed | Within 2 business days |
| **P4 — Low** | Minor hardening issues, informational | Next sprint |

---

## Phase 1: Detect & Triage

1. **Identify the signal** — Error tracker alerts, anomalous audit log entries, rate limit spikes, security researcher report, CI failure
2. **Assign incident commander** — One person owns the incident from detection to resolution
3. **Create private incident channel** — Do not discuss details in public channels
4. **Assess scope** — What data is affected? Which users? Which environments?
5. **Assign severity level** — Use table above

---

## Phase 2: Contain

### For active authentication compromise
```bash
# Revoke ALL sessions for a specific user
node server/scripts/admin/revoke_user_sessions.js --userId <userId>

# Rotate JWT secrets (forces re-login for all users)
# 1. Generate new secrets
node -e "require('crypto').randomBytes(64).toString('hex')" 

# 2. Update secrets in deployment environment
# 3. Restart application instances
```

### For database compromise
```bash
# See: docs/DISASTER_RECOVERY.md
# Immediately isolate database from application
# Restore from last verified clean backup
```

### For active scanning / brute-force attack
```bash
# Block attacker IP at reverse proxy / cloud firewall level
# Do NOT block in-app — the attacker has already initiated sessions
```

---

## Phase 3: Eradicate

1. **Identify root cause** — Review audit logs, application logs, access logs
2. **Patch the vulnerability** — Code change, configuration change, or dependency upgrade
3. **Review for similar patterns** — Search codebase for similar vulnerabilities
4. **Run security tests** — `npm test -- tests/security/security.test.js`
5. **Run full test suite** — `npm run test:coverage`

---

## Phase 4: Recover

1. **Restore from backup if needed** — See `docs/DATABASE_RESTORE_RUNBOOK.md`
2. **Notify affected users** — Per applicable privacy regulations
3. **Deploy patched version** — Via normal CI/CD process after tests pass
4. **Monitor for recurrence** — Increase monitoring sensitivity for 72 hours post-incident

---

## Phase 5: Post-Incident

1. **Write incident report** — Timeline, root cause, impact, fix applied
2. **Update `SECURITY_AUDIT.md`** — Document the new finding and fix
3. **Add regression test** — Ensure the specific attack vector is covered by `security.test.js`
4. **Retrospective** — What detection/prevention controls were missing?

---

## Key Contacts

| Role | Responsibility |
|------|---------------|
| Incident Commander | Owns incident timeline and communications |
| Backend Engineer | Code investigation and patch |
| DevOps/Infrastructure | Server access, firewall, restart |
| Legal/Compliance | User notification requirements |

---

## Audit Log Queries for Investigation

```javascript
// Find all actions by a suspect user in last 24h
db.auditlogs.find({
  actor: ObjectId("..."),
  createdAt: { $gte: new Date(Date.now() - 86400000) }
}).sort({ createdAt: -1 });

// Find failed login attempts
db.auditlogs.find({
  action: "USER_LOGIN_FAILED",
  createdAt: { $gte: new Date(Date.now() - 3600000) }
}).sort({ createdAt: -1 });

// Find admin access denials
db.auditlogs.find({
  action: "ADMIN_ACCESS_DENIED"
}).sort({ createdAt: -1 }).limit(50);
```
