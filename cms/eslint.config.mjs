import astralDesign from 'eslint-plugin-astral-design';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextCoreWebVitals,
  {
    name: 'astralpirates/ignores',
    ignores: [
      '.next/**',
      '.next-dev/**',
      'payload-types.ts',
      'src/payload-generated-schema.ts',
      'src/scripts/**/*',
    ],
  },
  {
    name: 'astralpirates/rules',
    plugins: {
      'astral-design': astralDesign,
    },
    rules: {
      'astral-design/no-legacy-controls': 'error',
      'astral-design/icon-button-aria': 'error',
      'astral-design/no-external-teleport': 'error',
    },
  },
];

export default config;
