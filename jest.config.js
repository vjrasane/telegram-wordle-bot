/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  globalSetup: "<rootDir>/test/globalSetup.ts",
};