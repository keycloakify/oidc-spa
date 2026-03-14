export type ParamsOfCreateGetServerDateNow = {
    issuedAtTime_local: number;
    issuedAtTime: number;
};

export function createGetServerDateNow(params: ParamsOfCreateGetServerDateNow) {
    const { issuedAtTime_local, issuedAtTime } = params;
    return function getServerDateNow() {
        return Date.now() + (issuedAtTime - issuedAtTime_local);
    };
}
