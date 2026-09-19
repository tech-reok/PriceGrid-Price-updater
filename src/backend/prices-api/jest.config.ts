import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests', '<rootDir>/prisma'],
  testMatch: ['**/*.spec.ts'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    'prisma/seed/**/*.ts',
    '!src/server.ts',
    '!src/types/**/*.ts',
    '!src/di/**/*.ts',
    '!src/routes/**/*.ts',
    '!**/index.ts'
  ],
  coverageThreshold: {
    global: {
      lines: 70,
      statements: 70,
      functions: 70,
      branches: 70
    }
  },
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          strict: false,
          types: ['node', 'jest']
        }
      }
    ]
  }
};

export default config;
