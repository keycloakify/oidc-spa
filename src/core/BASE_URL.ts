let BASE_URL: string | undefined = undefined;

export function getBASE_URL() {
    return { BASE_URL };
}

export function setBASE_URL(params: { BASE_URL: string }) {
    BASE_URL = params.BASE_URL;
}
