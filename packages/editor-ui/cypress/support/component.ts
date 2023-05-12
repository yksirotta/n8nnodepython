import { mount } from '@cypress/vue';
import { createPinia, setActivePinia } from 'pinia';

const initStores = () => setActivePinia(createPinia());

Cypress.Commands.add('mount', mount);
Cypress.Commands.add('initStores', initStores);

declare global {
	namespace Cypress {
		interface Chainable {
			mount: typeof mount;
			initStores: typeof initStores;
		}
	}
}
