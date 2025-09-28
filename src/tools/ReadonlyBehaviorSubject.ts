import type { Observable } from "rxjs";

/**
 * An observable with a .getValue() you can think of it
 * as a BehaviorSubject on which you can't call .next()
 */
export interface ReadonlyBehaviorSubject<T> extends Observable<T> {
    getValue(): T;
}
