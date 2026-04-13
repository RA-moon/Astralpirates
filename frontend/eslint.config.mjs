import { createConfigForNuxt } from '@nuxt/eslint-config';
import astralDesign from 'eslint-plugin-astral-design';

export default createConfigForNuxt({
  features: {
    typescript: {
      strict: false,
    },
  },
})
  .append({
    name: 'astralpirates/ignores',
    ignores: ['app/legacy/**/*', 'app/styles/tokens.*'],
  })
  .append({
    name: 'astralpirates/rules',
    plugins: {
      'astral-design': astralDesign,
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'import/order': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/unified-signatures': 'off',
      curly: 'off',
      'arrow-parens': 'off',
      'no-empty': 'warn',
      'space-before-function-paren': 'off',
      'require-await': 'off',
      'no-console': 'warn',
      'nuxt/prefer-import-meta': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/no-dupe-keys': 'warn',
      'vue/no-unused-vars': 'warn',
      'astral-design/no-legacy-controls': 'error',
      'astral-design/icon-button-aria': 'error',
      'astral-design/no-external-teleport': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '~/composables/useFlightPlanCrew',
              message: 'Import from "~/domains/flightPlans" instead.',
            },
            {
              name: '~/composables/useFlightPlan',
              message: 'Import from "~/domains/flightPlans" instead.',
            },
            {
              name: '~/composables/useFlightPlanSlug',
              message: 'Import from "~/domains/flightPlans" instead.',
            },
            {
              name: '~/composables/useLogs',
              message: 'Import from "~/domains/logs" instead.',
            },
            {
              name: '~/composables/useFlightPlanInvites',
              message: 'Import from "~/domains/invitations" instead.',
            },
            {
              name: '~/composables/useProfile',
              message: 'Import from "~/domains/profiles" instead.',
            },
          ],
          patterns: [
            {
              group: ['~/app/**'],
              message: 'Use the canonical "~/" alias (e.g., "~/domains/logs") instead of "~/app/...".',
            },
            {
              group: ['../domains/**'],
              message:
                'Avoid relative "../domains/..." hops (especially from components/composables); use the "~/" alias, e.g. "~/domains/logs".',
            },
          ],
        },
      ],
    },
  });
