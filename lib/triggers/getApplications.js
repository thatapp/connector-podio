var Podio = require('../../podio');
const { messages } = require('elasticio-node');
var _ = require('lodash');

// App: Poll for Changes — polls the active apps of ONE space and emits the
// {app_id: name} map, as its siblings emit theirs.
//
// STRUCTURAL FIX (2026-10-20). This trigger used to read GET /app/{app_id}: ONE
// app, which Podio returns as a single OBJECT. It then refused anything that was
// not an array, so against Podio's real response it could only ever emit an
// error. It now reads GET /app/space/{space_id}/, the list the component already
// reads for a space's apps (actions/apps/getAppsBySpace.js, and
// helpers/spaceHelper.js, whose active-only {app_id: name} map this trigger
// always built).
//
// WHERE THE SPACE COMES FROM, in order: the message's space_id; else the step
// configuration's space_id; else its spaceId (the key the component's own space
// pickers use). A polling trigger is usually a flow's first step and receives no
// message body, so the configuration is where its space normally lives. The first
// value PRESENT is the one used: an invalid space_id in the message is refused,
// never silently replaced by the configuration's.
//
// The id is placed in a URL path, so anything but a positive whole number is
// refused before any request.
//
// Emits the whole map on every poll, as getSpaces does; it does not diff against
// the previous snapshot.
function resolveSpaceId(msg, cfg) {
    const body = (msg && msg.body && typeof msg.body === 'object') ? msg.body : {};
    const conf = (cfg && typeof cfg === 'object') ? cfg : {};
    const present = (v) => v !== undefined && v !== null && v !== '';
    const raw = [body.space_id, conf.space_id, conf.spaceId].find(present);
    if (!present(raw)) {
        throw new Error('space_id is required: name the space whose apps are polled (message space_id, or the step configuration space_id / spaceId)');
    }
    const text = (typeof raw === 'number' || typeof raw === 'string') ? String(raw).trim() : '';
    if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) {
        throw new Error('space_id must be a positive whole number; got ' + JSON.stringify(raw));
    }
    return text;
}

exports.process = async function getApplications(msg, cfg) {
    var that = this;

    function isActive(app) {
        return 'active' === app.status;
    }

    function transform(result, app) {
        result[app.app_id] = app.config.name;
    }

    try {
        const spaceId = resolveSpaceId(msg, cfg);
        var podio = new Podio(cfg, this);
        let apps = await podio.get('/app/space/' + spaceId + '/');
        if (!_.isArray(apps)) {
            throw new Error('Unable to retrieve apps: GET /app/space/' + spaceId + '/ did not return a list');
        }
        apps = _(apps).filter(isActive).transform(transform, {}).value();
        messages.emitSnapshot.call(that, apps);
        await that.emit('data', messages.newMessageWithBody(apps));
    } catch (err) {
        // 'error', never 'end': a polling trigger that ends on a failure reports a
        // clean cycle while losing everything it should have emitted.
        that.emit('error', err);
    }
};
