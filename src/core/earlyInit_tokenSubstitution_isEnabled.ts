let isTokenSubstitutionEnabled = false;

export function getIsTokenSubstitutionEnabled() {
    return isTokenSubstitutionEnabled;
}

export function markTokenSubstitutionAsEnabled() {
    isTokenSubstitutionEnabled = true;
}
