if (typeof globalThis.structuredClone === 'undefined') {
    globalThis.structuredClone = (val) => {
        if (val === undefined) return undefined;
        return JSON.parse(JSON.stringify(val));
    };
}

if (typeof AbortSignal !== 'undefined' && !AbortSignal.prototype.throwIfAborted) {
    AbortSignal.prototype.throwIfAborted = function () {
        if (this.aborted) {
            throw this.reason || new Error('Aborted');
        }
    };
}
