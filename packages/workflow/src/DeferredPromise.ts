export interface IDeferredPromise<T> {
	promise: Promise<T>;
	reject: (error: Error) => void;
	resolve: (result: T) => void;
}

export function createDeferredPromise<T = void>(): IDeferredPromise<T> {
	const value: Partial<IDeferredPromise<T>> = {};
	value.promise = new Promise<T>((res, rej) => {
		value.resolve = res;
		value.reject = rej;
	});
	return value as IDeferredPromise<T>;
}
