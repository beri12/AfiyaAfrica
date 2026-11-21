import base from '@afyalink/config/eslint.base.mjs';
export default [...base, { ignores: ['.next', 'next-env.d.ts', 'playwright-report', 'test-results', 'src/test/*.js', 'jest.config.js'] }];
