module.exports = {
  projects: [
    {
      displayName: 'adapters',
      testEnvironment: 'node',
      roots: ['<rootDir>/packages/adapters'],
      testMatch: ['**/__tests__/**/*.ts', '**/*.spec.ts'],
      moduleNameMapper: {
        '^@autoapply/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
        '^@autoapply/adapters$': '<rootDir>/packages/adapters/src/index.ts',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
      },
    },
    {
      displayName: 'worker',
      testEnvironment: 'node',
      roots: ['<rootDir>/apps/worker'],
      testMatch: ['**/__tests__/**/*.ts', '**/*.spec.ts'],
      moduleNameMapper: {
        '^@autoapply/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
        '^@autoapply/adapters$': '<rootDir>/packages/adapters/src/index.ts',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
      },
    },
  ],
  collectCoverageFrom: [
    'packages/**/*.ts',
    'apps/**/*.ts',
    '!**/*.spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 75,
      statements: 75,
    },
  },
};
