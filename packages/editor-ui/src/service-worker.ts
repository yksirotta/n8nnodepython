import { useRegisterSW } from 'virtual:pwa-register/vue';

const intervalMS = 60 * 60 * 1000;

const updateServiceWorker = useRegisterSW({
	onRegistered(r) {
		r &&
			setInterval(() => {
				r.update();
			}, intervalMS);
	},
});

self.addEventListener('fetch', (event: FetchEvent) => {
	event.respondWith(fetch(event.request));
});
