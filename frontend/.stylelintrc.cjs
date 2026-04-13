module.exports = {
  extends: [],
  rules: {
    'color-no-hex': true,
    'color-no-invalid-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],
  },
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.output/**',
    '**/.nuxt/**',
    'frontend/app/styles/tokens.css',
  ],
};
