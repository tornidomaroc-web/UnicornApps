# Auth email templates

The emails Supabase sends for this app, kept here so they are reviewed and
versioned. Supabase has no import for them: each file is pasted by hand into
**Authentication → Emails** in the dashboard, subject line first (the first
line of each file), then the HTML body.

| File | Dashboard template | Status |
|---|---|---|
| `reset-password.html` | Reset Password | in use |
| `confirm-signup.html` | Confirm sign up | stored only: email confirmation is off, so it is never sent |

Every link points at `https://www.unicornapps.app/auth/confirm` with
`{{ .TokenHash }}`, never at `{{ .ConfirmationURL }}`. The confirm page draws
a Continue button and spends the token only when it is pressed, so a mail
scanner that opens links ahead of the reader does not use it up.
`__tests__/email-templates.test.ts` pins the link shape, the Arabic
punctuation and the parts every email must carry.
