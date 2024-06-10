import cloneDeep from 'lodash/cloneDeep';
import merge from 'lodash/merge';
import type { IN8nUISettings } from 'n8n-workflow';
import { settings } from './commands';

let defaultSettings: IN8nUISettings;

before(() => {
	cy.resetDatabase();

	Cypress.on('uncaught:exception', (error) => {
		return !error.message.includes('ResizeObserver');
	});

	cy.request('/rest/settings').then((response) => {
		defaultSettings = Object.freeze(response.body.data);
	});
});

beforeEach(() => {
	if (!cy.config('disableAutoLogin')) {
		cy.signinAsOwner();
	}

	cy.window().then((win): void => {
		win.localStorage.setItem('N8N_THEME', 'light');
	});

	cy.intercept('GET', '/rest/settings', (req) =>
		req.reply({ data: merge(cloneDeep(defaultSettings), settings) }),
	).as('loadSettings');
	cy.intercept('GET', '/types/nodes.json').as('loadNodeTypes');

	// Always intercept the request to test credentials and return a success
	cy.intercept('POST', '/rest/credentials/test', {
		statusCode: 200,
		body: {
			data: { status: 'success', message: 'Tested successfully' },
		},
	});

	cy.intercept({ pathname: '/api/health' }, { status: 'OK' });
	cy.intercept({ pathname: '/api/versions/*' }, [
		{
			name: '1.45.1',
			createdAt: '2023-08-18T11:53:12.857Z',
			hasSecurityIssue: null,
			hasSecurityFix: null,
			securityIssueFixVersion: null,
			hasBreakingChange: null,
			documentationUrl: 'https://docs.n8n.io/release-notes/#n8n131',
			nodes: [],
			description: 'Includes <strong>bug fixes</strong>',
		},
		{
			name: '1.0.5',
			createdAt: '2023-07-24T10:54:56.097Z',
			hasSecurityIssue: false,
			hasSecurityFix: null,
			securityIssueFixVersion: null,
			hasBreakingChange: true,
			documentationUrl: 'https://docs.n8n.io/release-notes/#n8n104',
			nodes: [],
			description: 'Includes <strong>core functionality</strong> and <strong>bug fixes</strong>',
		},
	]);
});
