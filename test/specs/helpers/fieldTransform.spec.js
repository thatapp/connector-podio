'use strict';

const { expect } = require('chai');
const { fieldTransform } = require('../../../helpers/itemHelper');

describe('helpers/itemHelper.fieldTransform', function () {

    it('keeps money fields whole when value is numeric (regression: currency was lost)', function () {
        const out = fieldTransform({ price: { value: 100, currency: 'USD' } });
        expect(out.price).to.deep.equal({ value: 100, currency: 'USD' });
    });

    it('preserves a numeric zero value', function () {
        const out = fieldTransform({ price: { value: 0, currency: 'EUR' } });
        expect(out.price).to.deep.equal({ value: 0, currency: 'EUR' });
    });

    it('keeps location fields whole even with a non-string value', function () {
        const loc = { city: 'Oslo', value: 'Oslo, NO', lat: 59.9, lng: 10.7 };
        expect(fieldTransform({ where: loc }).where).to.deep.equal(loc);
    });

    it('keeps email/phone objects with type + value', function () {
        const out = fieldTransform({ mail: { type: 'work', value: 'a@b.com' } });
        expect(out.mail).to.deep.equal({ type: 'work', value: 'a@b.com' });
    });

    it('unwraps a simple { value } wrapper (single reference)', function () {
        expect(fieldTransform({ ref: { value: 123 } }).ref).to.equal(123);
    });

    it('passes date objects through (no value key)', function () {
        const d = { start_date: '2024-03-15' };
        expect(fieldTransform({ due: d }).due).to.deep.equal(d);
    });

    it('splits ;-delimited values into an array ONLY for splittable fields', function () {
        // A text-like field (e.g. text with "&nbsp;") must NOT be split —
        // splitting it caused Podio "Multiple is not allowed for field ..." errors.
        expect(fieldTransform({ desc: 'Hi&nbsp;there; 3.05Euro' }).desc)
            .to.equal('Hi&nbsp;there; 3.05Euro');
        expect(fieldTransform({ tags: 'a;b;c' }, false, new Set(['other'])).tags)
            .to.equal('a;b;c');
        // A splittable field (present in the provided set) IS split into multiple.
        expect(fieldTransform({ colors: 'a;b;c' }, false, new Set(['colors'])).colors)
            .to.deep.equal(['a', 'b', 'c']);
    });

    it('splits ;-delimited references for relationship (app) fields (regression: multi-references dropped)', function () {
        // Relationship fields are type "app"; getSplittableFieldIds includes them
        // so multiple item references passed as "123;456" become an array Podio
        // accepts. Before this, they were sent as a literal string and dropped.
        expect(fieldTransform({ related: '123;456' }, true, new Set(['related'])).related)
            .to.deep.equal(['123', '456']);
        // A single reference (no ";") is left intact whether or not it's splittable.
        expect(fieldTransform({ related: '123' }, true, new Set(['related'])).related)
            .to.equal('123');
    });
});
