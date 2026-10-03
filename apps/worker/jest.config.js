const { resolve } = require('path');
const { config: loadEnv } = require('dotenv');

loadEnv({ path: resolve(__dirname, '../../.env.test'), override: true });

module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
};
