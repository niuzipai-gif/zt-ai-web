# ZT.AI Control Room

This is a separate, noindex administrator website served by the Gateway at `/admin/`.

Set `ADMIN_USERNAME` plus either `ADMIN_PASSWORD` or `ADMIN_PASSWORD_SALT`/`ADMIN_PASSWORD_HASH` in the hosting environment. The current local administrator username is `shali`; the password is kept only in the local environment file and must not be committed. `DATA_RETENTION_DAYS` controls cleanup, and `ZT_AI_DATA_PATH` selects the JSON store location.

Visitor lists show masked IP addresses. Full IP addresses and message timelines are visible only after administrator authentication. Provider token usage is used when available; otherwise the dashboard labels the local character-based estimate as approximate.

Desktop registrations are stored as `pending` until an administrator approves them from “用户审核”. Revoking an account removes its existing sessions immediately; the desktop client then returns to its login screen on the next authenticated request.
