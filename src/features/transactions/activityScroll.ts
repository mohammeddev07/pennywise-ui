/**
 * Activity's last scroll offset per scope. Kept outside React state: it changes on every scroll
 * frame and is only read at the moment Insights drills down.
 */
const offsets = new Map<string, number>();

export const setActivityScroll = (scope: string, offset: number) => void offsets.set(scope, offset);
export const getActivityScroll = (scope: string) => offsets.get(scope) ?? 0;
