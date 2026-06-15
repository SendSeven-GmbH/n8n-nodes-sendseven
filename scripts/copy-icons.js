/**
 * Copy node icon assets (SVG/PNG) into the dist/ build output.
 *
 * Replaces the previous gulp-based `build:icons` task. Dependency-free —
 * uses only Node.js built-ins so it adds no devDependencies and no audit
 * surface. Mirrors the n8n community-node convention of shipping icons
 * alongside the compiled node JS under dist/nodes/.
 *
 * Behaviour matches the old gulp task: copy every *.svg / *.png found under
 * nodes/ into dist/nodes/, preserving the relative directory structure.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'nodes');
const DEST_DIR = path.join(ROOT, 'dist', 'nodes');
const ICON_EXTENSIONS = new Set(['.svg', '.png']);

/**
 * Recursively collect icon files (relative paths) under a directory.
 * @param {string} dir absolute directory to scan
 * @param {string} baseDir absolute base used to compute relative paths
 * @returns {string[]} relative file paths
 */
function collectIcons(dir, baseDir) {
	const found = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const absPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...collectIcons(absPath, baseDir));
		} else if (ICON_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			found.push(path.relative(baseDir, absPath));
		}
	}
	return found;
}

function main() {
	if (!fs.existsSync(SRC_DIR)) {
		console.error(`copy-icons: source directory not found: ${SRC_DIR}`);
		process.exit(1);
	}

	const icons = collectIcons(SRC_DIR, SRC_DIR);
	if (icons.length === 0) {
		console.warn('copy-icons: no icon files (*.svg/*.png) found under nodes/');
		return;
	}

	for (const relPath of icons) {
		const srcPath = path.join(SRC_DIR, relPath);
		const destPath = path.join(DEST_DIR, relPath);
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.copyFileSync(srcPath, destPath);
		console.log(`copy-icons: ${relPath}`);
	}

	console.log(`copy-icons: copied ${icons.length} icon file(s) to dist/nodes/`);
}

main();
