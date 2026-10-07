/** Grants exclusive access in the order acquire() is called. */
export class Mutex {
    private tail: Promise<void> = Promise.resolve();

    /** Always call the returned release function in a finally block. */
    public async acquire(): Promise<() => void> {
        const previous = this.tail;

        let release!: () => void;
        this.tail = new Promise<void>(resolve => {
            release = resolve;
        });

        await previous;

        // Promise resolution makes repeated calls to release harmless.
        return release;
    }
}
