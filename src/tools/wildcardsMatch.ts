export function getDoMatchWildcardsPattern(params: {
    stringWithWildcards: string;
    candidate: string;
}): boolean {
    const { stringWithWildcards, candidate } = params;

    if (!stringWithWildcards.includes("*")) {
        return stringWithWildcards === candidate;
    }

    const escapedRegex = stringWithWildcards
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, ".*");

    return new RegExp(`^${escapedRegex}$`).test(candidate);
}
