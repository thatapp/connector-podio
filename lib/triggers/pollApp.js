'use strict';

const poll = require('../../helpers/pollPodioResource');
const { guard } = require('../../helpers/hookVerify');

exports.process = guard(poll('app'));
