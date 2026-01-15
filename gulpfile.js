const { src, dest } = require('gulp');

/**
 * Copy icon files to dist folder
 */
function buildIcons() {
  return src('nodes/**/*.{png,svg}').pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
