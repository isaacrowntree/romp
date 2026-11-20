export interface Lock {
    file: string;
    release(): void;
}
export declare class LockHeld extends Error {
    file: string;
    pid: number;
    since: string;
    constructor(file: string, pid: number, since: string);
}
export declare function acquireLock(name: string, o?: {
    dir?: string;
}): Lock;
