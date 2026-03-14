export class Deferred<T> {
    public readonly pr: Promise<T>;

    /** NOTE: Does not need to be called bound to instance*/
    public readonly resolve: (value: T) => void;
    public readonly reject: (error: any) => void;
    public readonly getState: () =>
        | { hasResolved: true; value: T }
        | { hasResolved: false; value?: never };

    constructor() {
        let resolve!: (value: T) => void;
        let reject!: (error: any) => void;

        let valueWrap: [T] | undefined = undefined;

        this.pr = new Promise<T>((resolve_, reject_) => {
            resolve = value => {
                if (valueWrap !== undefined) {
                    return;
                }
                valueWrap = [value];
                resolve_(value);
            };

            reject = error => {
                reject_(error);
            };
        });

        this.resolve = resolve;
        this.reject = reject;
        this.getState = () =>
            valueWrap === undefined
                ? { hasResolved: false }
                : { hasResolved: true, value: valueWrap[0] };
    }
}

export namespace Deferred {
    export type Unpack<T extends Deferred<any>> = T extends Deferred<infer U> ? U : never;
}

export class VoidDeferred extends Deferred<undefined> {
    public declare readonly resolve: () => void;
}
