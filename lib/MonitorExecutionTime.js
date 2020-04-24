"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const underscore_1 = require("duniter/app/lib/common-libs/underscore");
function getMicrosecondsTime() {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1000000 + nanoseconds / 1000;
}
exports.getMicrosecondsTime = getMicrosecondsTime;
function getDurationInMicroSeconds(before) {
    return parseInt(String(getMicrosecondsTime() - before));
}
exports.getDurationInMicroSeconds = getDurationInMicroSeconds;
const monitorings = {};
exports.showExecutionTimes = () => {
    let traces = [];
    Object
        .keys(monitorings)
        .forEach(k => {
        const m = monitorings[k];
        const total = m.times.reduce((s, t) => s + t.time / 1000, 0);
        const avg = m.times.length ? total / m.times.length : 0;
        traces.push({
            name: k,
            times: m.times.length,
            avg,
            total
        });
    });
    traces = underscore_1.Underscore.sortBy(traces, t => t.total);
    traces
        .forEach(t => {
        console.log('%s %s times %sms (average) %sms (total time)', (t.name + ':').padEnd(50, ' '), String(t.times).padStart(10, ' '), t.avg.toFixed(3).padStart(10, ' '), t.total.toFixed(0).padStart(10, ' '));
    });
};
exports.MonitorExecutionTime = function (idProperty) {
    return function (target, propertyKey, descriptor) {
        if (process.argv.includes('--monitor')) {
            const original = descriptor.value;
            if (original.__proto__.constructor.name === "AsyncFunction") {
                descriptor.value = async function (...args) {
                    const start = getMicrosecondsTime();
                    const entities = await original.apply(this, args);
                    const duration = getDurationInMicroSeconds(start);
                    const k = propertyKey === 'getFromCacheOrDB'
                        ? target.constructor.name + '.<>' + args[0] + '(' + args[1] + ')'
                        : target.constructor.name + '.' + propertyKey + (idProperty ? `[${this[idProperty]}]` : '');
                    // const k = target.constructor.name + '.' + propertyKey + (idProperty ? `[${(this as any)[idProperty]}]` : '')
                    if (!monitorings[k]) {
                        monitorings[k] = {
                            times: []
                        };
                    }
                    monitorings[k].times.push({
                        time: duration
                    });
                    return entities;
                };
            }
            else {
                descriptor.value = function (...args) {
                    const start = getMicrosecondsTime();
                    const entities = original.apply(this, args);
                    const duration = getDurationInMicroSeconds(start);
                    const k = target.constructor.name + '.' + propertyKey + (idProperty ? `[${this[idProperty]}]` : '');
                    if (!monitorings[k]) {
                        monitorings[k] = {
                            times: []
                        };
                    }
                    monitorings[k].times.push({
                        time: duration
                    });
                    return entities;
                };
            }
        }
    };
};
//# sourceMappingURL=MonitorExecutionTime.js.map