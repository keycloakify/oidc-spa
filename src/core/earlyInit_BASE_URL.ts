let BASE_URL: string | undefined = undefined;

export function getBASE_URL_earlyInit() {
    return BASE_URL;
}

export function setBASE_URL_earlyInit(params: { BASE_URL: string }) {
    BASE_URL = params.BASE_URL;
}
