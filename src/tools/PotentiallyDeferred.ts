export type PotentiallyDeferred<T> =
    | PotentiallyDeferred.NotResolved<T>
    | PotentiallyDeferred.Resolved<T>;

export namespace PotentiallyDeferred {
    export type Resolved<T> = {
        hasResolved: true;
        value: T;
    };

    export type NotResolved<T> = {
        hasResolved: false;
        prValue: Promise<T>;
    };
}
