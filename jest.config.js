const { compilerOptions } = require('./tsconfig.json');

const isCI = process.env.CI === 'true';

/** @type {import('jest').Config} */
module.exports = {
	verbose: true,
	preset: 'ts-jest',
	testEnvironment: 'node',
	testRegex: '\\.(test|spec)\\.(js|ts)$',
	testPathIgnorePatterns: ['/dist/', '/node_modules/'],
	globals: {
		'ts-jest': {
			isolatedModules: true,
			tsconfig: {
				...compilerOptions,
				declaration: false,
				sourceMap: false,
				skipLibCheck: true,
			},
		},
	},
	ci: isCI,
	json: isCI,
	reporters: isCI ? ['default', 'github-actions'] : ['default'],
	collectCoverage: isCI,
	coverageDirectory: '.coverage',
	coverageReporters: ['json-summary'],
};
