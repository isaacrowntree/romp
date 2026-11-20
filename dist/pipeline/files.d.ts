/** Every file under the paths (files or directories), absolute, sorted. */
export declare function listFiles(paths: string[], root?: string): string[];
/** sha256 over each file's path (relative to root) and contents. */
export declare function hashFiles(files: string[], root?: string): string;
/** Size and modification time of each file: a cheap stamp for big media. */
export declare function stampFiles(files: string[], root?: string): string;
/** sha256 of a buffer or string. */
export declare function sha(data: string | Uint8Array): string;
