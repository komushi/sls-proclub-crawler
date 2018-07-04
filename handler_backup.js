'use strict';

const proclub = require('./lib/proclub');

function makeResponse(error, result) {
  const statusCode = error ? 500 : 200;

  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin" : "*",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(error || result)
  }
}

function parseEvent(event) {
  // This function cannot be optimised, it's best to
  // keep it small!

  // console.log("***event***", event);

  let payload;

  try {
    // api gateway pattern
    payload = JSON.parse(event.body);
  } catch (e) {
    console.log("***event***", event);
    console.log("***parse event error***", e);
  } finally {
    // step functions pattern
    payload = payload || event;
  }

  return payload; // Could be undefined!
}

module.exports.crawlMatches = async (event, context, callback) => {

  let result;
  let error;

  try {

    const payload = parseEvent(event);

    result = await proclub.club.getClubMembers(payload.clubId);

    console.log("***result***", result);

  } catch (err) {
    error = err.stack;
    console.log("***err***", err);
  }

  const response = makeResponse(error, {message: 'getClubMembers', input: result});

  callback(null, response);
};
