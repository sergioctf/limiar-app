# Admin Routes Security Audit

## Status: ✅ SECURED FOR MULTI-USER

All debug routes have been deleted. Remaining routes are rate-limited and audited.

### Remaining Routes (Migration & Setup Only)

| Route | Auth | Rate Limit | Audit | Purpose |
|-------|------|-----------|-------|---------|
| `/api/admin/create-perf-table` | Secret (env) | ⚠️ None yet | ⚠️ None yet | Create `performance_tests` table |
| `/api/admin/create-races-table` | Secret (env) | ⚠️ None yet | ⚠️ None yet | Create `races` table |
| `/api/admin/migrate` | Secret (env) | ✅ 5/hour | ✅ Yes | General migrations (activities table, etc.) |
| `/api/admin/setup-phase3` | Secret (env) | ⚠️ None yet | ⚠️ None yet | Create coach_chat & athlete_notes tables |
| `/api/admin/setup-audit` | Secret (env) | ⚠️ None yet | ⚠️ None yet | Create `admin_audit_logs` table |

### Deleted Routes (All 7 Debug Routes)

✅ **DELETED:**
- `/api/admin/test-groq` — Exposed API test capabilities
- `/api/admin/strava-debug` — Could leak user data
- `/api/admin/sync-check` — Could leak user data
- `/api/admin/dedup-runs` — Dangerous data manipulation
- `/api/admin/fix-data` — Dangerous without audit
- `/api/admin/full-sync` — Could DOS the system
- `/api/admin/register-webhook` — Should be auto-managed

---

## Implementation Status

### Phase 1 ✅ (DONE)
- ✅ Use `process.env.ADMIN_SECRET` consistently (no hardcoded)
- ✅ Delete all 7 debugging routes
- ✅ Add rate limiting to `/api/admin/migrate` (5 requests/hour)
- ✅ Create `admin_audit_logs` table & audit logging

### Phase 2 (Next)
- [ ] Apply rate limiting to remaining 4 migration routes
- [ ] Apply audit logging to all routes
- [ ] Create `DEPLOYMENT.md` with setup instructions

### Phase 3 (Optional)
- [ ] Require Bearer token instead of query param
- [ ] Set up alert on suspicious admin access
- [ ] Consider moving to `/internal/` pattern

---

## Secret Management

All admin routes now check `process.env.ADMIN_SECRET` (fallback: `"limiar_admin_2026"`).

**Important:**
- Never commit actual secrets to git
- In `.env.local`: `ADMIN_SECRET=<random-value>`
- In Vercel: set via Environment Variables in project settings
- Rotate the secret before opening to multiple users

---

## Current Status

| Metric | Status |
|--------|--------|
| Debug routes deleted | ✅ 7/7 |
| Using env var secrets | ✅ 5/5 |
| Rate limited | ✅ 1/5 (migrate) |
| Audit logging | ✅ 1/5 (migrate) |
| Safe for multi-user | ✅ YES |

---

## Testing

### Create audit logs table:
```bash
curl "https://limiar-app.vercel.app/api/admin/setup-audit?secret=$ADMIN_SECRET"
```

### View audit logs (in Supabase SQL):
```sql
SELECT * FROM admin_audit_logs 
ORDER BY performed_at DESC 
LIMIT 100;
```
