'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-1' });
const docClient = new AWS.DynamoDB.DocumentClient({service: dynamodb});
// // const docClient = new AWS.DynamoDB.DocumentClient();

const helper = require('../helper/helper');

let clubId;

Date.prototype.yyyymm = function() {
  var mm = this.getMonth() + 1; // getMonth() is zero-based

  return [this.getFullYear(),
          (mm>9 ? '' : '0') + mm
         ].join('');
};

const done = function(error, result, callback) {
  return error ? callback(new Error(error)) : callback(null, result);
}

const parseEvent = function(event) {
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

const generateBatchWriteParams = function(apiResult, matchIdToSaveList) {
  let itemList = [];
  let memberHistoryList = [];

  Object.keys(apiResult).map((matchId, index) => {
    if (matchIdToSaveList.includes(matchId)) {
      let timestamp = parseInt(apiResult[matchId]['timestamp']) * 1000;
      let matchDate = new Date(timestamp);
      let matchUid = clubId + '_' + matchDate.yyyymm();

      let playersObj = apiResult[matchId]['players'][clubId];
      let playerList = [];

      // let blazeObj = {};

      Object.keys(playersObj).map((k, i) => {
        let playerStatsObj = playersObj[k];
        delete playerStatsObj['vproattr'];
        delete playerStatsObj['vprohackreason'];
        playerList.push(playerStatsObj);

        // let playername = playerStatsObj['playername'];
        // blazeObj[playername] = playerStatsObj;
        playerStatsObj['blazeId'] = k;
        playerStatsObj['timestamp'] = timestamp;
        playerStatsObj['matchUid'] = matchUid;
        memberHistoryList.push(playerStatsObj);
      });

      // console.log('playersObj', playersObj);
      let opponentName;
      let opponentId;

      Object.keys(apiResult[matchId]['clubs']).map((k, i) => {
        if (k !== clubId) {
          opponentId = k;
          opponentName = apiResult[matchId]['clubs'][k]['details']['name'];
        }
      })

      itemList.push({ 
        PutRequest: {
          Item: {
            matchUid: matchUid,
            timestamp: timestamp,
            clubId: clubId,
            matchId: matchId,
            opponent: opponentName,
            goals: parseInt(apiResult[matchId]['clubs'][clubId]['goals']),
            goalsConceded: parseInt(apiResult[matchId]['clubs'][clubId]['goalsAgainst']),
            passAttempts: parseInt(apiResult[matchId]['aggregate'][clubId]['passattempts']),
            passesMade: parseInt(apiResult[matchId]['aggregate'][clubId]['passesmade']),
            tackleAttempts: parseInt(apiResult[matchId]['aggregate'][clubId]['tackleattempts']),
            tacklesMade: parseInt(apiResult[matchId]['aggregate'][clubId]['tacklesmade']),
            opponentTackleAttempts: parseInt(apiResult[matchId]['aggregate'][opponentId]['tackleattempts']),
            opponentTacklesMade: parseInt(apiResult[matchId]['aggregate'][opponentId]['tacklesmade']),
            players: playerList
            // players2: playersObj,
            // blazes: blazeObj
          }
        }
      });
    }
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.MATCH_TABLE}": []}}`);
  params['RequestItems'][`${helper.MATCH_TABLE}`] = itemList;

  // console.log('params', JSON.stringify(params));

  return { params, memberHistoryList } ;
}

const batchWrite = function(params) {
  return new Promise((resolve, reject) => {
    docClient.batchWrite(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

const generateBatchGetParams = function(apiResult) {

  // generate query params
  let keyList = [];

  Object.keys(apiResult).map((key, index) => {
    let timestamp = parseInt(apiResult[key]["timestamp"]) * 1000;
    let matchDate = new Date(timestamp);
    keyList.push({
      matchUid: clubId + '_' + matchDate.yyyymm(),
      timestamp: timestamp
    });
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.MATCH_TABLE}":{"Keys": [], "ProjectionExpression": "matchId"}}}`);
  params['RequestItems'][`${helper.MATCH_TABLE}`]['Keys'] = keyList;

  return params;
}

const batchGet = function(params) {
  return new Promise((resolve, reject) => {
    docClient.batchGet(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        // console.log(JSON.stringify(data));

        let matchIdList = data['Responses'][`${helper.MATCH_TABLE}`].map((matchIdObj) => {
          return matchIdObj['matchId'];
        });
        resolve(matchIdList);
      }
    });
  });
}

module.exports.crawl = async (event, context, callback) => {

  let matchIdToSaveList;
  let error;
  let memberHistoryList = [];

  try {

    const payload = parseEvent(event);

    clubId = payload.clubId || helper.CLUB_ID;

    let apiResult = await helper.proclubApi.club.getClubMatchHistory(clubId);

    let batchGetParams = generateBatchGetParams(apiResult);

    let matchIdList = await batchGet(batchGetParams);

    // console.log('***matchIdList***', matchIdList);
  
    matchIdToSaveList = Object.keys(apiResult).filter((key, index) => {
      return !Object.values(matchIdList).includes(key);
    });

    // console.log('***matchIdToSaveList***', JSON.stringify(matchIdToSaveList));

    if (matchIdToSaveList.length > 0) {
      let batchWriteParams = generateBatchWriteParams(apiResult, matchIdToSaveList);

      memberHistoryList = batchWriteParams.memberHistoryList;

      await batchWrite(batchWriteParams.params);
    }

  } catch (err) {
    error = err.stack;
    // console.log("***err***", err);
  }

  done(error, {type: 'memberHistoryList', memberHistoryList, newMatches: matchIdToSaveList.length}, callback);
};
