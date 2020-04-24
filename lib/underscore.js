"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _underscore_ = require("underscore");
exports.Underscore = {
    filter: (elements, filterFunc) => {
        return _underscore_.filter(elements, filterFunc);
    },
    where: (elements, props) => {
        return _underscore_.where(elements, props);
    },
    findWhere: (elements, props) => {
        return _underscore_.findWhere(elements, props);
    },
    keys: (map) => {
        return _underscore_.keys(map);
    },
    values: (map) => {
        return _underscore_.values(map);
    },
    pluck: (elements, k) => {
        return _underscore_.pluck(elements, k);
    },
    pick: (elements, ...k) => {
        return _underscore_.pick(elements, ...k);
    },
    omit: (element, ...k) => {
        return _underscore_.omit(element, ...k);
    },
    uniq: (elements, isSorted = false, iteratee) => {
        return _underscore_.uniq(elements, isSorted, iteratee);
    },
    clone: (t) => {
        return _underscore_.clone(t);
    },
    mapObject: (t, cb) => {
        return _underscore_.mapObject(t, cb);
    },
    mapObjectByProp: (t, prop) => {
        return _underscore_.mapObject(t, (o) => o[prop]);
    },
    sortBy: (elements, sortFunc) => {
        return _underscore_.sortBy(elements, sortFunc);
    },
    difference: (array1, array2) => {
        return _underscore_.difference(array1, array2);
    },
    shuffle: (elements) => {
        return _underscore_.shuffle(elements);
    },
    extend: (t1, t2) => {
        return _underscore_.extend(t1, t2);
    },
    range: (count, end) => {
        return _underscore_.range(count, end);
    },
    chain: (element) => {
        return _underscore_.chain(element);
    },
};
//# sourceMappingURL=underscore.js.map