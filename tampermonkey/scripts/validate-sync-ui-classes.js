const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const USERSCRIPT_PATH = path.join(ROOT_DIR, 'goal_portfolio_viewer.user.js');

const CLASS_PREFIXES = ['gpv-sync-', 'gpv-conflict-'];
const REQUIRED_MARKUP_CLASSES = [
    'gpv-sync-settings',
    'gpv-sync-header',
    'gpv-sync-status-bar',
    'gpv-sync-status-item',
    'gpv-sync-form',
    'gpv-sync-form-group',
    'gpv-sync-input',
    'gpv-sync-toggle',
    'gpv-sync-help',
    'gpv-sync-actions',
    'gpv-sync-auth-buttons',
    'gpv-sync-btn',
    'gpv-sync-btn-primary',
    'gpv-sync-btn-secondary',
    'gpv-sync-btn-danger',
    'gpv-conflict-dialog',
    'gpv-conflict-stepper',
    'gpv-conflict-step-panel',
    'gpv-conflict-actions'
];
const EXCLUDED_STYLE_CLASSES = new Set([
    'gpv-sync-enabled',
    'gpv-sync-auto',
    'gpv-sync-interval',
    'gpv-conflict-overlay',
    'gpv-sync-overlay-title'
]);

function readUserscript() {
    return fs.readFileSync(USERSCRIPT_PATH, 'utf8');
}

function unique(values) {
    return Array.from(new Set(values)).sort();
}

function extractStyleText(contents) {
    const styleAnchor = contents.indexOf('const STYLE_SECTIONS');
    if (styleAnchor === -1) {
        return '';
    }
    return contents.slice(styleAnchor);
}

function extractTemplateText(contents) {
    const uiAnchor = contents.indexOf('UI: Sync Functions');
    if (uiAnchor === -1) {
        return contents;
    }
    const styleAnchor = contents.indexOf('const STYLE_SECTIONS');
    const end = styleAnchor === -1 ? contents.length : styleAnchor;
    return contents.slice(uiAnchor, end);
}

function extractClassTokens(text) {
    const tokenMatches = text.match(/\bgpv-(?:sync|conflict)-[a-z0-9-]+/g) || [];
    return unique(tokenMatches);
}

function extractDynamicPrefixes(text) {
    const prefixMatches = text.match(/\bgpv-(?:sync|conflict)-[a-z0-9-]+-\$\{/g) || [];
    return unique(prefixMatches.map(prefix => prefix.slice(0, -2)));
}

function extractSelectorTokens(text) {
    const selectorMatches = text.match(/\.gpv-(?:sync|conflict)-[a-z0-9-]+/g) || [];
    return unique(selectorMatches.map(selector => selector.replace(/^\./, '')));
}

function extractIdTokens(text) {
    const idMatches = text.match(/\bid="(gpv-(?:sync|conflict)-[a-z0-9-]+)"/g) || [];
    return unique(idMatches.map(match => match.replace(/.*id="/, '').replace(/"/, '')));
}

function filterRequiredClasses(classTokens) {
    return classTokens.filter(token => CLASS_PREFIXES.some(prefix => token.startsWith(prefix)));
}

function validateSyncUiClasses() {
    const contents = readUserscript();
    const templateText = extractTemplateText(contents);
    const styleText = extractStyleText(contents);

    const dynamicPrefixes = extractDynamicPrefixes(templateText);
    const templateClasses = filterRequiredClasses(extractClassTokens(templateText));
    const styleClasses = filterRequiredClasses(extractSelectorTokens(styleText));
    const templateIds = extractIdTokens(templateText);
    const templateIdSet = new Set(templateIds);
    const templateClassesFiltered = templateClasses.filter(token => !templateIdSet.has(token) && !token.endsWith('-'));

    const dynamicStyleClasses = dynamicPrefixes.flatMap(prefix =>
        styleClasses.filter(token => token.startsWith(prefix))
    );

    const expandedTemplateClasses = unique([...templateClassesFiltered, ...dynamicStyleClasses]);

    const missingDynamicSelectors = dynamicPrefixes.filter(prefix =>
        !styleClasses.some(token => token.startsWith(prefix))
    );

    const missingSelectors = expandedTemplateClasses
        .filter(token => !EXCLUDED_STYLE_CLASSES.has(token))
        .filter(token => !styleClasses.includes(token));

    const missingMarkup = REQUIRED_MARKUP_CLASSES
        .filter(token => !expandedTemplateClasses.includes(token));

    const errors = [];
    if (missingDynamicSelectors.length) {
        errors.push(`Missing CSS selectors for dynamic prefixes: ${missingDynamicSelectors.join(', ')}`);
    }
    if (missingSelectors.length) {
        errors.push(`Missing CSS selectors for classes: ${missingSelectors.join(', ')}`);
    }
    if (missingMarkup.length) {
        errors.push(`Missing required markup classes: ${missingMarkup.join(', ')}`);
    }

    if (errors.length) {
        console.error('Sync UI class validation failed.');
        errors.forEach(message => console.error(`- ${message}`));
        process.exit(1);
    }

    console.log('Sync UI class validation passed.');
    console.log(`Checked ${expandedTemplateClasses.length} markup classes and ${styleClasses.length} style selectors.`);
}

if (require.main === module) {
    validateSyncUiClasses();
}

module.exports = {
    validateSyncUiClasses
};
