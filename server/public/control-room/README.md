# ZT.AI Control Room

This is a separate, noindex administrator website served by the Gateway at `/admin/`.

Set `ADMIN_PASSWORD_SALT` and `ADMIN_PASSWORD_HASH` in the hosting environment. Generate them locally with `tools/set-admin-password.ps1`; the password itself must not be committed. `DATA_RETENTION_DAYS` controls cleanup, and `ZT_AI_DATA_PATH` selects the JSON store location.

Visitor lists show masked IP addresses. Full IP addresses and message timelines are visible only after administrator authentication. Provider token usage is used when available; otherwise the dashboard labels the local character-based estimate as approximate.

