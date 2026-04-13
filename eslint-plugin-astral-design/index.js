const path = require('node:path');

const legacyClasses = ['button', 'card'];
const legacyTags = ['button', 'input', 'select', 'textarea'];
const classAttributePattern = /class\s*=\s*["']([^"']+)["']/gi;
const legacyTagPattern = /<\s*(button|input|select|textarea)\b/gi;
const iconButtonPattern = /<UiIconButton\b([^>]*)>/gi;
const teleportPattern = /<\s*Teleport\b/i;

const isVueFile = (filename) => typeof filename === 'string' && filename.endsWith('.vue');
const isUiKitFile = (filename) =>
  typeof filename === 'string' && filename.split(path.sep).includes('ui') && filename.includes(`${path.sep}components${path.sep}ui${path.sep}`);
const shouldSkipFile = (filename) =>
  !filename || filename === '<input>' || filename.includes('node_modules') || !isVueFile(filename);

const hasLegacyClass = (source) => {
  classAttributePattern.lastIndex = 0;
  let match;
  while ((match = classAttributePattern.exec(source)) !== null) {
    const classes = match[1]
      .split(/\s+/)
      .map((cls) => cls.trim())
      .filter(Boolean);
    if (classes.some((cls) => legacyClasses.includes(cls))) {
      return true;
    }
  }
  return false;
};

const findLegacyTag = (source) => {
  legacyTagPattern.lastIndex = 0;
  const match = legacyTagPattern.exec(source);
  if (match) {
    return match[1]?.toLowerCase() ?? null;
  }
  return null;
};

const hasIconButtonWithoutAria = (source) => {
  iconButtonPattern.lastIndex = 0;
  let match;
  while ((match = iconButtonPattern.exec(source)) !== null) {
    const attrs = match[1] ?? '';
    if (!/aria-label\s*=|aria-labelledby\s*=/i.test(attrs)) {
      return true;
    }
  }
  return false;
};

const hasTeleportUsage = (source) => teleportPattern.test(source);

const getFilename = (context) => {
  if (typeof context.filename === 'string') {
    return context.filename;
  }
  if (typeof context.getFilename === 'function') {
    return context.getFilename();
  }
  return '<input>';
};

const getSourceCode = (context) => {
  if (context.sourceCode) {
    return context.sourceCode;
  }
  if (typeof context.getSourceCode === 'function') {
    return context.getSourceCode();
  }
  return null;
};

const createRuleContext = (context) => {
  const filename = getFilename(context);
  const sourceCode = getSourceCode(context);
  const rootNode = sourceCode?.ast ?? null;
  const source =
    typeof sourceCode?.getText === 'function' ? sourceCode.getText() : sourceCode?.text ?? '';
  return { filename, source, node: rootNode };
};

module.exports = {
  rules: {
    'no-legacy-controls': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow raw HTML controls and legacy utility classes outside the UI kit.',
        },
        schema: [],
        messages: {
          legacyClass: 'Legacy utility classes (button/card) are not allowed. Use Ui kit components instead.',
          legacyTag: 'Raw <{{tag}}> elements are not allowed outside components/ui. Use UiButton/UiTextInput/etc.',
        },
      },
      create(context) {
        const { filename, source, node } = createRuleContext(context);
        if (shouldSkipFile(filename) || isUiKitFile(filename)) {
          return {};
        }
        return {
          Program(programNode) {
            const reportNode = node ?? programNode;
            if (hasLegacyClass(source)) {
              context.report({ node: reportNode, messageId: 'legacyClass' });
              return;
            }
            const legacyTag = findLegacyTag(source);
            if (legacyTag && legacyTags.includes(legacyTag)) {
              context.report({ node: reportNode, messageId: 'legacyTag', data: { tag: legacyTag } });
            }
          },
        };
      },
    },
    'icon-button-aria': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Ensure UiIconButton instances include aria-label or aria-labelledby for accessibility.',
        },
        schema: [],
        messages: {
          missingAria: 'UiIconButton requires aria-label or aria-labelledby when used outside components/ui.',
        },
      },
      create(context) {
        const { filename, source, node } = createRuleContext(context);
        if (shouldSkipFile(filename) || isUiKitFile(filename)) {
          return {};
        }
        return {
          Program(programNode) {
            const reportNode = node ?? programNode;
            if (hasIconButtonWithoutAria(source)) {
              context.report({ node: reportNode, messageId: 'missingAria' });
            }
          },
        };
      },
    },
    'no-external-teleport': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Only Ui overlay primitives may use <Teleport>; other components should rely on UiModal/UiDrawer/etc.',
        },
        schema: [],
        messages: {
          teleport: 'Use UiModal/UiDrawer/UiPopover instead of raw <Teleport> outside components/ui.',
        },
      },
      create(context) {
        const { filename, source, node } = createRuleContext(context);
        if (shouldSkipFile(filename) || isUiKitFile(filename)) {
          return {};
        }
        return {
          Program(programNode) {
            const reportNode = node ?? programNode;
            if (hasTeleportUsage(source)) {
              context.report({ node: reportNode, messageId: 'teleport' });
            }
          },
        };
      },
    },
  },
};
