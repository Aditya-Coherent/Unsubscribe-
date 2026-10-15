# cmi-unsubscribe

One-page unsubscribe site for Coherent Market Insights newsletters.
Static page + one Vercel serverless function. Every unsubscribe is committed to
`data/unsubscribes.json` in a GitHub repo, so there is no database to run.

```
index.html              the page (prefills from ?email=)
api/unsubscribe.js      POST /api/unsubscribe → appends to the JSON file on GitHub
data/unsubscribes.json  the list (starts as [])
vercel.json             skips redeploys when only data/ changes
```

## Setup

1. Push this folder to its own GitHub repo. **Keep the repo private**, since the JSON holds email addresses.
2. Create a fine-grained personal access token (GitHub → Settings → Developer settings)
   scoped to that repo only, with **Contents: Read and write**.
3. Import the repo in Vercel (framework preset: **Other**, no build command).
4. Add environment variables in Vercel (see `.env.example`):
   - `GITHUB_TOKEN`: the token from step 2
   - `GITHUB_REPO`: `owner/repo`
   - `GITHUB_BRANCH`: `main` (optional)
   - `GITHUB_FILE`: `data/unsubscribes.json` (optional)
5. Deploy.

## Linking from the newsletter

Point the footer's Unsubscribe link at:

```
https://<your-app>.vercel.app/?email={{ recipient_email }}&src={{ brief_id }}
```

`email` prefills the field. `src` is optional and is stored with the record.

## Stored record

```json
{
  "email": "someone@company.com",
  "reason": "Too many emails",
  "source": "fortinet_industry_brief",
  "unsubscribed_at": "2026-10-15T09:30:00.000Z"
}
```

Emails are lowercased and de-duplicated. The send pipeline should read this file
and skip any address on it.

## Notes

- Each unsubscribe is a commit to `data/`. `vercel.json`'s `ignoreCommand` stops
  those commits from triggering a redeploy.
- Concurrent submissions are handled by retrying on GitHub's SHA conflict (409/422).
- A hidden honeypot field drops basic bot submissions.

## Local dev

```
npm i -g vercel
vercel dev        # reads env vars from .env (copy .env.example)
```
