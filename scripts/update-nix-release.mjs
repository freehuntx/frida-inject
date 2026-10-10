// Points the Nix package at a GitHub release.
//
// The Nix package does not build anything. It downloads the standalone binary
// from the release and needs to know the version and the hash of each file.
// The release workflow runs this script after publishing a release.
//
// Usage: node scripts/update-nix-release.mjs <version> <path to SHA256SUMS.txt>

import fs from 'node:fs';
import path from 'node:path';

const [version, sumsFile] = process.argv.slice(2);
if (!version || !sumsFile) {
  console.error('Usage: node scripts/update-nix-release.mjs <version> <path to SHA256SUMS.txt>');
  process.exit(1);
}

// The platforms that package.nix knows about.
const platforms = ['linux-x64', 'linux-arm64', 'macos-x64', 'macos-arm64'];

// SHA256SUMS.txt has lines like "<hex>  frida-inject-linux-x64.tar.gz".
// Nix wants the hash in SRI form: "sha256-<base64>".
const hashes = {};
for (const line of fs.readFileSync(sumsFile, 'utf8').split('\n')) {
  const match = line.match(/^([0-9a-f]{64})\s+\*?frida-inject-(.+)\.tar\.gz$/);
  if (match && platforms.includes(match[2])) {
    hashes[match[2]] = `sha256-${Buffer.from(match[1], 'hex').toString('base64')}`;
  }
}

const missing = platforms.filter((platform) => !hashes[platform]);
if (missing.length > 0) throw new Error(`${sumsFile} has no checksum for: ${missing.join(', ')}`);

const target = path.join(import.meta.dirname, '..', 'nix', 'release.json');
fs.writeFileSync(target, `${JSON.stringify({ version: version.replace(/^v/, ''), hashes }, null, 2)}\n`);
console.log(`Updated ${path.relative(process.cwd(), target)} to ${version}`);
