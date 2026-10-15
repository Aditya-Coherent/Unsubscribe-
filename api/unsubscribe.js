// Vercel serverless function: POST /api/unsubscribe
// Appends the email to a JSON file in a GitHub repo via the Contents API.
//
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   GITHUB_TOKEN   fine-grained PAT with "Contents: Read and write" on the repo
//   GITHUB_REPO    "owner/repo"
//   GITHUB_BRANCH  default "main"
//   GITHUB_FILE    default "data/unsubscribes.json"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RETRIES = 3;

function gh(path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cmi-unsubscribe',
      ...(init.headers || {}),
    },
  });
}

async function readList(repo, file, branch) {
  const res = await gh(`/repos/${repo}/contents/${file}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return { list: [], sha: undefined };
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`);
  const body = await res.json();
  const text = Buffer.from(body.content, 'base64').toString('utf8');
  return { list: text.trim() ? JSON.parse(text) : [], sha: body.sha };
}

async function writeList(repo, file, branch, list, sha, email) {
  return gh(`/repos/${repo}/contents/${file}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `unsubscribe: ${email}`,
      content: Buffer.from(JSON.stringify(list, null, 2) + '\n').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const file = process.env.GITHUB_FILE || 'data/unsubscribes.json';
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: 'Server is not configured.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: bots fill the hidden field; pretend success and drop it.
  if (body.website) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const entry = {
    email,
    reason: String(body.reason || '').slice(0, 200),
    source: String(body.source || '').slice(0, 100),
    unsubscribed_at: new Date().toISOString(),
  };

  try {
    // Retry on 409/422: another request committed between our read and write.
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { list, sha } = await readList(GITHUB_REPO, file, branch);
      if (list.some((e) => e.email === email)) {
        return res.status(200).json({ ok: true, already: true });
      }
      list.push(entry);
      const put = await writeList(GITHUB_REPO, file, branch, list, sha, email);
      if (put.ok) return res.status(200).json({ ok: true });
      if (put.status !== 409 && put.status !== 422) {
        throw new Error(`GitHub write failed: ${put.status}`);
      }
    }
    throw new Error('GitHub write conflicted too many times');
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'Could not save your request. Please try again.' });
  }
};
