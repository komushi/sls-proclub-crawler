'use strict';

const matchesHandler = require('./handlers/matches');
const membersHandler = require('./handlers/members');

module.exports.crawlMatch = async (event, context, callback) => {
  await matchesHandler.crawlMatch(event, context, callback);
};

module.exports.saveStats = async (event, context, callback) => {
  await membersHandler.saveStats(event, context, callback);
};
