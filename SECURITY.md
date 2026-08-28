# AI Songs Security

AI Songs is a private-studio application. Production access is protected by server-side authentication and signed session cookies.

## Current protections

- Server-side API keys only
- Auth required for application and API access
- Secure, HttpOnly, SameSite=Strict session cookies
- Login throttling
- Same-origin API enforcement
- Request and upload validation
- File-size and upstream response limits
- Restricted upstream URL fetching
- Content Security Policy and browser security headers
- Pinned dependency versions
- Environment and private-key files ignored by Git

## Secret handling

Secrets must only be stored in encrypted deployment environment variables. Never commit API keys, passwords, session secrets, certificates, or private keys to this repository.

## Incident response

If a credential is suspected to be exposed, rotate it immediately in the relevant provider and deployment environment, then redeploy the application.
