'use strict';

const matchesHandler = require('./handlers/matches');
const membersHandler = require('./handlers/members');
// const patchHandler = require('./handlers/patch');
// const patchMemberHandler = require('./handlers/patchMember');

module.exports.crawlMatch = async (event, context, callback) => {
  await matchesHandler.crawlMatch(event, context, callback);
};

module.exports.saveStats = async (event, context, callback) => {
  await membersHandler.saveStats(event, context, callback);
};

/*
module.exports.patch = async (event, context, callback) => {
  await patchHandler.patch(event, context, callback);
};

module.exports.patchMember = async (event, context, callback) => {
  await patchMemberHandler.patch(event, context, callback);
};
*/