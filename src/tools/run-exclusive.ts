/** Runs calls one at a time, in the order they arrive. */
export function build<T extends (...args: any[]) => Promise<any>>(fun: T): T {
    const queue: (() => void)[] = [];

    return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
        return new Promise((resolve, reject) => {
            const run = async () => {
                try {
                    resolve(await fun.apply(this, args));
                } catch (error) {
                    reject(error);
                } finally {
                    queue.shift();
                    queue[0]?.();
                }
            };

            queue.push(run);

            if (queue.length === 1) {
                run();
            }
        });
    } as T;
}
