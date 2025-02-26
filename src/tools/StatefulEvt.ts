export type StatefulEvt<T> = {
    current: T;
    subscribe: (next: (data: T) => void) => Subscription;
};

export type StatefulReadonlyEvt<T> = {
    readonly current: T;
    subscribe: (next: (data: T) => void) => Subscription;
};

export type Subscription = {
    unsubscribe: () => void;
};

export function createStatefulEvt<T>(getInitialValue: () => T): StatefulEvt<T> {
    let nextFunctions: ((data: T) => void)[] = [];

    let wrappedState: [T] | undefined = undefined;

    return {
        get current() {
            if (wrappedState === undefined) {
                wrappedState = [getInitialValue()];
            }
            return wrappedState[0];
        },
        set current(data: T) {
            wrappedState = [data];

            nextFunctions.forEach(next => next(data));
        },
        subscribe: (next: (data: T) => void) => {
            nextFunctions.push(next);

            return { unsubscribe: () => nextFunctions.splice(nextFunctions.indexOf(next), 1) };
        }
    };
}
