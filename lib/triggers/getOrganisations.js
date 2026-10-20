var Podio = require('../../podio');
const { messages } = require('elasticio-node');
var _ = require('lodash');

// Org: Poll for Changes — polls the organisations the connected Podio user
// belongs to and emits the {org_id: name} map, as its siblings emit theirs.
//
// STRUCTURAL FIX (2026-10-20). This trigger used to read GET /org/{org_id}: ONE
// organisation, which Podio returns as a single OBJECT. It then refused anything
// that was not an array, so against Podio's real response it could only ever
// emit an error ("needs a structural review", its own comment said). It now reads
// GET /org/, the list the component already uses for its organisation picker
// (helpers/orgHelper.js). The list needs no id, so the trigger takes no input and
// declares none; an org_id left on an old message is ignored.
//
// Emits the whole map on every poll, as getSpaces does; it does not diff against
// the previous snapshot.
exports.process = async function getOrganisations(msg, cfg) {
    var that = this;
    var podio = new Podio(cfg, this);

    function transform(result, org) {
        result[org.org_id] = org.name;
    }

    try {
        let orgs = await podio.get('/org/');
        if (!_.isArray(orgs)) {
            throw new Error('Unable to retrieve organisations: GET /org/ did not return a list');
        }
        orgs = _(orgs).transform(transform, {}).value();
        messages.emitSnapshot.call(that, orgs);
        await that.emit('data', messages.newMessageWithBody(orgs));
    } catch (err) {
        // 'error', never 'end': a polling trigger that ends on a failure reports a
        // clean cycle while losing everything it should have emitted.
        that.emit('error', err);
    }
};
