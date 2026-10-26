module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transform: {
    '\\.css$': '<rootDir>/tests/cssTransform.js',
    '\\.js$': 'babel-jest'
  }
};
