/** @type {import('jest').Config} */
const common = { preset: 'ts-jest', testEnvironment: 'node', moduleFileExtensions: ['ts', 'js', 'json'] };
module.exports = {
  projects: [
    { ...common, displayName: 'unit', roots: ['<rootDir>/src'], testMatch: ['**/*.spec.ts'] },
    {
      ...common,
      displayName: 'integration',
      roots: ['<rootDir>/test'],
      testMatch: ['**/*.int-spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/env.ts'],
    },
  ],
};
