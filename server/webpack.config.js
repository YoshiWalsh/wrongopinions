const path = require("path");
const webpack = require('webpack');

module.exports = {
	output: {
		filename: 'bundle.js',
		libraryTarget: "commonjs2",
		path: path.resolve(__dirname, "dist")
	},
	entry: './src/index.ts',

	// Create source maps
	devtool: "inline-source-map",

	// Resolve .ts and .js extensions
	resolve: {
		extensions: [".ts", ".js"],
	},

	// Target node
	target: "node",

	// AWS recommends always including the aws-sdk in your Lambda package but excluding can significantly reduce
	// the size of your deployment package. If you want to always include it then comment out this line.
	externals: process.env.NODE_ENV === "development" ? [] : ["aws-sdk"],

	// Set the webpack mode
	mode: process.env.NODE_ENV || "production",

	// Add the TypeScript loader
	module: {
		rules: [{
			test: /\.ts?$/,
			loader: "ts-loader",
			exclude: /node_modules/,
			options: {
				configFile: 'tsconfig.build.json'
			},
		}]
	},

	plugins: [
		new webpack.IgnorePlugin({ resourceRegExp: /stream\/consumers/u, contextRegExp: /.*/u })
	],

	ignoreWarnings: [
		{
			// https://github.com/aws/aws-sdk-js-v3/issues/3640
			module: /\@aws-sdk/,
			message: /Can't resolve '(aws-crt|\@aws-sdk\/signature-v4-crt)'/
		}
	],
};