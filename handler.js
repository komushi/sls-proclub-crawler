'use strict';

const matchesHandler = require('./handlers/matches');
const membersHandler = require('./handlers/members');

module.exports.crawlMatches = async (event, context, callback) => {
  await matchesHandler.crawl(event, context, callback);
};

module.exports.saveMemberHistory = async (event, context, callback) => {
  await membersHandler.save(event, context, callback);
};
