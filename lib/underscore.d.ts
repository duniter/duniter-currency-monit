export interface Map<T> {
    [k: string]: T;
}
export interface UnderscoreClass<T> {
    filter(filterFunc: (t: T) => boolean): UnderscoreClass<T>;
    where(props: {
        [k in keyof T]?: T[k];
    }): UnderscoreClass<T>;
    sortBy(sortFunc: (element: T) => number): UnderscoreClass<T>;
    pluck<K extends keyof T>(k: K): UnderscoreClass<T>;
    uniq<K extends keyof T>(isSorted?: boolean, iteratee?: (t: T) => K): UnderscoreClass<T>;
    value(): T[];
}
export declare const Underscore: {
    filter: <T>(elements: T[], filterFunc: (t: T) => boolean) => T[];
    where: <T_1>(elements: T_1[], props: { [k in keyof T_1]?: T_1[k]; }) => T_1[];
    findWhere: <T_2>(elements: T_2[], props: { [k_1 in keyof T_2]?: T_2[k_1]; }) => T_2;
    keys: <T_3>(map: T_3) => (keyof T_3)[];
    values: <T_4>(map: {
        [k: string]: T_4;
    }) => T_4[];
    pluck: <T_5, K extends keyof T_5>(elements: T_5[], k: K) => T_5[K][];
    pick: <T_6, K_1 extends keyof T_6>(elements: T_6, ...k: K_1[]) => T_6[K_1][];
    omit: <T_7, K_2 extends keyof T_7>(element: T_7, ...k: K_2[]) => T_7[K_2][];
    uniq: <T_8, K_3>(elements: T_8[], isSorted?: boolean, iteratee?: (t: T_8) => K_3) => T_8[];
    clone: <T_9>(t: T_9) => T_9;
    mapObject: <T_10, K_4 extends keyof T_10, L extends keyof T_10[K_4]>(t: T_10, cb: (k: K_4) => T_10[K_4][L]) => Map<T_10[K_4][L]>;
    mapObjectByProp: <T_11, K_5 extends keyof T_11, L_1 extends keyof T_11[K_5]>(t: T_11, prop: L_1) => Map<T_11[K_5][L_1]>;
    sortBy: <T_12, K_6 extends keyof T_12>(elements: T_12[], sortFunc: K_6 | ((element: T_12) => string | number)) => T_12[];
    difference: <T_13>(array1: T_13[], array2: T_13[]) => T_13[];
    shuffle: <T_14>(elements: T_14[]) => T_14[];
    extend: <T_15, U>(t1: T_15, t2: U) => T_15 | U;
    range: (count: number, end?: number) => number[];
    chain: <T_16>(element: T_16[]) => UnderscoreClass<T_16>;
};
