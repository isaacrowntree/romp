export declare function cachedFile(dir: string, key: string, ext: string, make: (tmpPath: string) => Promise<void>): Promise<{
    path: string;
    hit: boolean;
}>;
