const path = require('path');
const fs = require('fs');
const TerserPlugin = require('terser-webpack-plugin');

// Writes the built bookmarklet into README.md, which doubles as the install page.
class BookmarkletPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('BookmarkletPlugin', () => {
      const jsFile = path.resolve(__dirname, 'dist', 'bookmarklet.js');
      const readmePath = path.resolve(__dirname, 'README.md');

      if (fs.existsSync(jsFile) && fs.existsSync(readmePath)) {
        const jsContent = fs.readFileSync(jsFile, 'utf8');
        const bookmarkletUrl = `javascript:${encodeURIComponent(jsContent)}`;
        const readmeContent = fs.readFileSync(readmePath, 'utf8').replace(
          /(<!-- BOOKMARKLET_CODE_START -->\n```\n)[\s\S]*?(\n```\n<!-- BOOKMARKLET_CODE_END -->)/,
          (match, start, end) => `${start}${bookmarkletUrl}${end}`
        );
        fs.writeFileSync(readmePath, readmeContent);
        console.log('✅ README.md updated with current bookmarklet');
      }
    });
  }
}

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bookmarklet.js',
    iife: true
  },
  plugins: [new BookmarkletPlugin()],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader' }
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          compress: { drop_console: true, drop_debugger: true, passes: 2 },
          mangle: true,
          format: { comments: false }
        }
      })
    ]
  },
  resolve: { extensions: ['.js'] }
};
