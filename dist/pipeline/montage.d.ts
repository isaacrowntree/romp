export interface Tile {
    file: string;
    label: string;
}
export interface MontageOptions {
    cols?: number;
    rows?: number;
    /** each tile's width on the page, px (default 480) */
    tileWidth?: number;
    /** a heading on every page */
    title?: string;
    /** JPEG quality 0..100 (default 82) */
    quality?: number;
    /** file name prefix (default "sheet") */
    prefix?: string;
}
/** "1:05.3" from seconds. */
export declare function timecode(seconds: number): string;
/** Split tiles into pages of cols × rows. */
export declare function pages<T>(tiles: T[], cols?: number, rows?: number): T[][];
/** The page's HTML (tiles as data URLs). */
export declare function sheetHtml(tiles: {
    src: string;
    label: string;
}[], o?: MontageOptions & {
    page?: string;
}): string;
/** Write the pages; returns their paths. */
export declare function montage(tiles: Tile[], outDir: string, o?: MontageOptions): Promise<string[]>;
