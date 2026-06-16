// Cloudflare Pages deployment.
//
// LIVE mode (CLOUDFLARE_* set): writes the compiled site into the local sites
// directory, then ships the whole directory to Cloudflare Pages via wrangler.
// Every business lives at  https://<project>.pages.dev/<slug>/  (stable URL).
//
// DRY-RUN mode (keys missing): the file is written locally and served by the
// Express server at  http://localhost:<port>/sites/<slug>/  so you can click
// and view a real generated site immediately.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SITES_DIR, cloudflare, siteBaseUrl } from './config.js';

async function writeSiteToDisk(slug, html) {
  const dir = path.join(SITES_DIR, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
  return dir;
}

function runWrangler(args, env) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'npx.cmd' : 'npx';
    // With shell:true (needed on Windows for npx.cmd) the args are re-joined by
    // the shell, so any path containing spaces must be quoted explicitly.
    const finalArgs = ['--yes', 'wrangler', ...args].map((a) =>
      isWin && /\s/.test(a) && !a.startsWith('"') ? `"${a}"` : a,
    );
    const child = spawn(cmd, finalArgs, {
      env: { ...process.env, ...env },
      shell: isWin,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err) }));
  });
}

// Deploy the accumulated sites directory to Cloudflare Pages (production branch).
// Called once per campaign batch after all sites are written to disk.
export async function publishBatch() {
  if (!cloudflare.live) {
    return { mode: 'dry-run', deployed: false };
  }
  const { code, stdout, stderr } = await runWrangler(
    [
      'pages',
      'deploy',
      SITES_DIR,
      `--project-name=${cloudflare.project}`,
      `--branch=${cloudflare.branch}`,
      '--commit-dirty=true',
    ],
    {
      CLOUDFLARE_API_TOKEN: cloudflare.apiToken,
      CLOUDFLARE_ACCOUNT_ID: cloudflare.accountId,
    },
  );
  if (code !== 0) {
    throw new Error(`Cloudflare Pages deploy failed: ${stderr || stdout}`);
  }
  const urlMatch = (stdout + stderr).match(/https:\/\/[^\s]+\.pages\.dev[^\s]*/);
  return { mode: 'live', deployed: true, deploymentUrl: urlMatch ? urlMatch[0] : null };
}

// Compile output -> on-disk site. Returns the public URL for this slug.
export async function stageSite(slug, html) {
  await writeSiteToDisk(slug, html);
  return `${siteBaseUrl()}/${slug}/`;
}
