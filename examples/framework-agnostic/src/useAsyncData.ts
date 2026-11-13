import { onMounted, ref, shallowRef } from "vue";

export function useAsyncData<Data>(load: () => Promise<Data>) {
    const data = shallowRef<Data>();
    const isLoading = ref(true);

    async function reload() {
        isLoading.value = true;
        data.value = await load();
        isLoading.value = false;
    }

    onMounted(reload);
    return { data, isLoading, reload };
}
