// lab-driver bundle, the shape of skyrim-platform/tools/plugin-example and of
// skymp5-client's own config: one file, skyrimPlatform left external because
// SP injects it as a global before evaluating the plugin.
const path = require("path");

module.exports = {
  mode: "development",
  devtool: "inline-source-map",
  target: "node",
  entry: { main: "./src/index.ts" },
  output: { path: path.resolve(__dirname, "build"), filename: "lab-driver.js" },
  resolve: { extensions: [".ts", ".js"] },
  externals: {
    "@skyrim-platform/skyrim-platform": ["skyrimPlatform"],
    skyrimPlatform: ["skyrimPlatform"],
  },
  module: {
    rules: [{ test: /\.ts$/, loader: "ts-loader", options: { configFile: "tsconfig.json" } }],
  },
};
