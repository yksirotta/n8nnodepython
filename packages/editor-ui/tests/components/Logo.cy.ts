import Logo from '@/components/Logo.vue';

describe('Logo', () => {
	it('renders a message', () => {
		cy.mount(Logo, {
			props: {
				value: 'Hello Tests',
				dialogVisible: true,
				parameter: 'p1',
				path: 'p2',
				isReadOnly: 'true',
			},
			global: {
				plugins: [cy.initStores()],
			},
		});
		cy.get('img').invoke('attr', 'src').should('eq', '/n8n-logo-expanded.svg');
	});
});
