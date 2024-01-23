/* eslint-disable @typescript-eslint/return-await */
export class Semaphore {
	private queue: Array<() => void> = [];

	private running = 0;

	constructor(private readonly concurrency: number) {}

	async acquire(): Promise<void> {
		return new Promise((resolve) => {
			this.queue.push(resolve);
			this.running++;
			setImmediate(() => this.process());
		});
	}

	release(): void {
		const resolve = this.queue.shift()!;
		setImmediate(resolve);
		this.running--;
		setImmediate(() => this.process());
	}

	private process() {
		while (this.running <= this.concurrency) {
			const resolve = this.queue.shift()!;
			setImmediate(resolve);
		}
	}
}

export class Mutex extends Semaphore {
	constructor() {
		super(1);
	}
}
