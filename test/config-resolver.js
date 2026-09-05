const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const stub = path.join(projectRoot, 'test', 'stubs', 'config.ts');

/**
 * Redirects only src/'s own './config' import to the test stub. A plain
 * moduleNameMapper entry for '^\\./config$' would also capture rxjs's internal
 * './config' module, which breaks rxjs at import time.
 */
module.exports = (request, options) => {
    if (request === './config' && options.basedir === srcDir) {
        return stub;
    }
    return options.defaultResolver(request, options);
};
