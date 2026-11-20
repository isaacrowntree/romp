/**
 * One process per device or resource: `acquireLock("sim-iphone")` takes a lock
 * file, and a second taker is refused while the first is alive. A lock left by
 * a process that died is taken over.
 */
import { mkdirSync, openSync, readFileSync, unlinkSync, writeSync, closeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
export class LockHeld extends Error {
    file;
    pid;
    since;
    constructor(file, pid, since) {
        super(`${path.basename(file, ".lock")} is in use by process ${pid} since ${since}`);
        this.file = file;
        this.pid = pid;
        this.since = since;
    }
}
const alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        return e.code === "EPERM";
    }
};
export function acquireLock(name, o = {}) {
    const dir = o.dir ?? path.join(os.tmpdir(), "romp-locks");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name.replace(/[^\w.-]+/g, "_")}.lock`);
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const fd = openSync(file, "wx");
            writeSync(fd, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
            closeSync(fd);
            let held = true;
            const release = () => {
                if (!held)
                    return;
                held = false;
                try {
                    unlinkSync(file);
                }
                catch {
                    /* already gone */
                }
            };
            process.once("exit", release);
            return { file, release };
        }
        catch (e) {
            if (e.code !== "EEXIST")
                throw e;
            let info = { pid: 0, since: "?" };
            try {
                info = JSON.parse(readFileSync(file, "utf8"));
            }
            catch {
                /* half-written: treat as stale */
            }
            if (info.pid && alive(info.pid))
                throw new LockHeld(file, info.pid, info.since);
            try {
                unlinkSync(file); // stale: its process is gone
            }
            catch {
                /* someone else took it over */
            }
        }
    }
    throw new Error(`could not take the lock ${file}`);
}
//# sourceMappingURL=lock.js.map