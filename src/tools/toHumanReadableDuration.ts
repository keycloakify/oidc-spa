export function toHumanReadableDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);

    if (seconds < 60) {
        return `${Math.round(milliseconds / 1000)} seconds`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes} minutes ${remainingSeconds} seconds`;
    } else if (seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        const remainingMinutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours} hours ${remainingMinutes} minutes ${remainingSeconds} seconds`;
    } else {
        const days = Math.floor(seconds / 86400);
        const remainingHours = Math.floor((seconds % 86400) / 3600);
        const remainingMinutes = Math.floor((seconds % 3600) / 60);
        return `${days} days ${remainingHours} hours ${remainingMinutes} minutes`;
    }
}
