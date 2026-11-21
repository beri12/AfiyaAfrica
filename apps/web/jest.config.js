/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.tsx', '**/*.test.ts'],
  transform: { '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true } }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1', '\\.(css)$': '<rootDir>/src/test/style-mock.js' },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
};
