# Security Checklist — Late Night Study Room

Pre-deployment security checklist. Run through every item before deploying.

---

## Environment & Secrets

- [ ] `.env` is **not** committed to Git (verified in `.gitignore`)
- [ ] All secrets are configured in the hosting platform's environment variables
- [ ] `JWT_SECRET` is at least 32 characters (generated with `crypto.randomBytes(64).toString('hex')`)
- [ ] No hardcoded credentials exist in frontend or server source code
- [ ] `VITE_*` variables contain only public, non-secret values

## Authentication

- [ ] JWT access token expiry is set to 1 hour
- [ ] JWT token is stored in HttpOnly, Secure, SameSite cookie (not localStorage)
- [ ] Passwords are hashed with bcrypt cost ≥ 12
- [ ] Account lockout activates after 5 failed login attempts (15-minute lockout)
- [ ] Logout endpoint clears the authentication cookie

## Rate Limiting

- [ ] General API rate limit: 60 requests / minute per IP
- [ ] Auth endpoints rate limit: 5 requests / 15 minutes per IP
- [ ] Socket event throttle: 10 messages / 10 seconds per connection
- [ ] Rate limit responses return HTTP 429 with clear error messages

## Input Validation

- [ ] All API inputs are validated with Zod schemas on the server
- [ ] Email validated for format and max length (254)
- [ ] Password minimum 8 characters, maximum 128
- [ ] Display name maximum 50 characters
- [ ] Chat messages capped at 1000 characters
- [ ] Timer duration validated (1 min–3 hours)
- [ ] All socket payloads are validated and sanitized

## CORS & Headers

- [ ] CORS does **not** use wildcard `*` origin
- [ ] CORS restricts methods to `GET` and `POST` only
- [ ] `helmet()` middleware is active
- [ ] `X-Powered-By` header is removed
- [ ] `Content-Security-Policy` is configured
- [ ] `X-Frame-Options: DENY` is set
- [ ] `X-Content-Type-Options: nosniff` is set
- [ ] `Strict-Transport-Security` is set
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` is set

## XSS Prevention

- [ ] No use of `dangerouslySetInnerHTML`, `eval()`, `new Function()`, or `innerHTML`
- [ ] Chat link rendering validates URL protocol (http/https only)
- [ ] React auto-escaping is relied upon for all user content rendering

## Error Handling

- [ ] Global error handler never exposes stack traces, internal paths, or database errors
- [ ] All 500 errors return generic `{ error: "Something went wrong." }`
- [ ] Structured server-side logging includes timestamp, level, and sanitized context
- [ ] Request body size limited to 10kb

## Dependencies

- [ ] `npm audit` returns 0 high/critical vulnerabilities
- [ ] All dependency versions are pinned via `package-lock.json`
- [ ] No abandoned or unmaintained packages in use

## Deployment

- [ ] Debug mode / development logging is disabled in production
- [ ] HTTPS is enforced on the hosting platform
- [ ] `NODE_ENV=production` is set on the server
- [ ] Cookie `Secure` flag is enabled in production
- [ ] Cookie `SameSite=Strict` is set in production
- [ ] Unused routes are removed or protected
- [ ] Database (if migrated from in-memory) is not publicly exposed
