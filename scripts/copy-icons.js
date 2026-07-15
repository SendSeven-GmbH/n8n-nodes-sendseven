/**
 * Copy node assets into the dist/ build output.
 *
 * Two kinds of asset live alongside the TypeScript sources under nodes/ and
 * must be shipped next to the compiled node JS, because `tsc` only emits the
 * compiled `.js`/`.d.ts` and never copies non-code files:
 *
 *   1. Icons        — *.svg / *.png (the node logo shown in the editor).
 *   2. Codex files  — *.node.json (n8n "codex" metadata: categories, aliases,
 *                     documentation links). n8n's directory + in-editor search
 *                     index the `alias` array from these files, so if they are
 *                     missing from dist the node is NOT discoverable by those
 *                     search terms (e.g. "whatsapp").
 *
 * Dependency-free — uses only Node.js built-ins so it adds no devDependencies
 * and no audit surface. Mirrors the n8n community-node convention of shipping
 * icons + codex alongside the compiled node JS under dist/nodes/.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'nodes');
const DEST_DIR = path.join(ROOT, 'dist', 'nodes');
const ICON_EXTENSIONS = new Set(['.svg', '.png']);

/**
 * Is this filename a node asset that must be copied into dist/ verbatim?
 * @param {string} name basename of the file
 * @returns {boolean}
 */
function isAsset(name) {
	if (ICON_EXTENSIONS.has(path.extname(name).toLowerCase())) return true;
	// n8n codex metadata (e.g. SendSeven.node.json). Matched by suffix rather
	// than plain `.json` so unrelated config never gets bundled by accident.
	if (name.endsWith('.node.json')) return true;
	return false;
}

/**
 * Recursively collect asset files (relative paths) under a directory.
 * @param {string} dir absolute directory to scan
 * @param {string} baseDir absolute base used to compute relative paths
 * @returns {string[]} relative file paths
 */
function collectAssets(dir, baseDir) {
	const found = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const absPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...collectAssets(absPath, baseDir));
		} else if (isAsset(entry.name)) {
			found.push(path.relative(baseDir, absPath));
		}
	}
	return found;
}

function main() {
	if (!fs.existsSync(SRC_DIR)) {
		console.error(`copy-assets: source directory not found: ${SRC_DIR}`);
		process.exit(1);
	}

	const assets = collectAssets(SRC_DIR, SRC_DIR);
	if (assets.length === 0) {
		console.warn('copy-assets: no icon/codex files (*.svg/*.png/*.node.json) found under nodes/');
		return;
	}

	for (const relPath of assets) {
		const srcPath = path.join(SRC_DIR, relPath);
		const destPath = path.join(DEST_DIR, relPath);
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.copyFileSync(srcPath, destPath);
		console.log(`copy-assets: ${relPath}`);
	}

	console.log(`copy-assets: copied ${assets.length} asset file(s) to dist/nodes/`);
}

main();
