'use strict';

const matchesHandler = require('./handlers/matches');
const membersHandler = require('./handlers/members');

module.exports.crawlMatches = async (event, context, callback) => {
  await matchesHandler.crawl(event, context, callback);
};

module.exports.saveMemberHistory = async (event, context, callback) => {
  await membersHandler.saveHistory(event, context, callback);
};

module.exports.saveMemberStats = async (event, context, callback) => {
  await membersHandler.saveStats(event, context, callback);
};
