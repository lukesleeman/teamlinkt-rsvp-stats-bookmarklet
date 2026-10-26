// Jest transform that mirrors webpack's `asset/source`: a CSS import becomes its text.
module.exports = {
  process(source) {
    return { code: `module.exports = ${JSON.stringify(source)};` };
  },
};
