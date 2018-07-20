'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-1' });
const docClient = new AWS.DynamoDB.DocumentClient({service: dynamodb});
// // const docClient = new AWS.DynamoDB.DocumentClient();

const helper = require('../helper/helper');

let clubId;

Date.prototype.yyyymm = function() {
  const mm = this.getMonth() + 1; // getMonth() is zero-based

  return [this.getFullYear(),
          '-',
          (mm>9 ? '' : '0') + mm
         ].join('');
};

Date.prototype.nextMonth = function() {
  let result;

  if (this.getMonth() == 11) {
      result = new Date(this.getFullYear() + 1, 0, 1);
  } else {
      result = new Date(this.getFullYear(), this.getMonth() + 1, 1);
  }

  return result;
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

const generateBatchWriteParams = function(memberHistoryList) {
  let paramsList = [];
  let itemList = [];

  memberHistoryList.map((record, index) => {

    itemList.push({ 
      PutRequest: {
        Item: record
      }
    });

    if (itemList.length == 25 || index + 1 == memberHistoryList.length) {
      let params = JSON.parse(`{"RequestItems": {"${helper.MEMBER_HISTORY_TABLE}": []}}`);
      params['RequestItems'][`${helper.MEMBER_HISTORY_TABLE}`] = Array.from(itemList);

      paramsList.push(params);

      itemList = [];
    }

  });

  return paramsList;
}

const batchWrite = function(paramsList) {
  return paramsList.map(params => {
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
  });
}


module.exports.saveHistory = async (event, context, callback) => {

  let error;

  try {

    const payload = parseEvent(event);

    clubId = payload.clubId || helper.CLUB_ID;

    // let paramsList = generateBatchWriteParams(payload.memberHistoryList);
    // await Promise.all(batchWrite(paramsList));

    // let monthList = generateMonthParams(payload.monthList);
    // console.log("***monthList***", JSON.stringify(monthList));

    // let clubPlayedGames = await calcClubPlayedGames(clubId, monthList);
    // console.log('***clubPlayedGames***', clubPlayedGames);

    // let memberPlayedGames = await calcMemberStats(payload.playerList, monthList);
    // console.log('***memberPlayedGames***', JSON.stringify(memberPlayedGames));

    // let memberStats = await getMemberStats(clubId);
    // console.log('memberStats', memberStats);

    let params = generateBatchGetParams(payload.playerList);
    console.log('params', JSON.stringify(params));

    let result = await batchGet(params);
    console.log('result', JSON.stringify(result));

  } catch (err) {
    error = err.stack;
    // console.log("***err***", err);
  }

  done(error, { clubId }, callback);
};

const getMemberStats = async (clubId) => {
  let apiResult = await helper.proclubApi.club.getClubMemberStats(clubId);

  let result = {};
  
  Object.values(apiResult).map((record, index) => {
    result[record.name] = record;
  });

  return await result;
}

const generateBatchWriteStatsParams = function(apiResult, blazeIdList) {

  let itemList = blazeIdList.map(blazeId => {
    let record = apiResult[blazeId];
    record['gamesPlayedList'] = []

    return { 
      PutRequest: {
        Item: record
      }
    };
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.MEMBER_HISTORY_TABLE}": []}}`);
  params['RequestItems'][`${helper.MEMBER_HISTORY_TABLE}`] = itemList;

  // console.log('params', JSON.stringify(params));
  return { params, blazeIdList: Object.keys(blazeIdList) };
};

const calcMemberStats = async (playerList, monthList) => {
  let paramsList = [];

  playerList.map(playerName => {
    let params = monthList.map(currentMonth => {
      return {
        TableName: helper.MEMBER_HISTORY_TABLE,
        KeyConditionExpression: '#hkey = :hkey and #rkey BETWEEN :rkey_begin AND :rkey_end',
        ExpressionAttributeValues: {
          ':hkey': playerName,
          ':rkey_begin': currentMonth.begin,
          ':rkey_end': currentMonth.end
        },
        ExpressionAttributeNames: {
          '#hkey': 'playername',
          '#rkey': 'timestamp'
        },
        ProjectionExpression: 'assists, goals, passattempts, passesmade, shots'
      };      
    });
    paramsList = paramsList.concat(params);

  });

  let promiseList = paramsList.map(params => {
    return new Promise((resolve, reject) => {

      docClient.query(params, async (err, data) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          let aggregated;

          if (data.Count == 0) {
            aggregated = {
              assists: 0,
              goals: 0,
              passattempts: 0,
              passesmade: 0,
              shots: 0,
            }
          } else {
            aggregated = data.Items.reduce((accumulator, currentValue) => {
              accumulator.assists = parseInt(accumulator.assists) + parseInt(currentValue.assists);
              accumulator.goals = parseInt(accumulator.goals) +  parseInt(currentValue.goals);
              accumulator.passattempts = parseInt(accumulator.passattempts) + parseInt(currentValue.passattempts);
              accumulator.passesmade = parseInt(accumulator.passesmade) + parseInt(currentValue.passesmade);
              accumulator.shots = parseInt(accumulator.shots) + parseInt(currentValue.shots);
              return accumulator;
            });            
          }

          // console.log('***aggregated***', aggregated);

          let matchDate = new Date(parseInt(params.ExpressionAttributeValues[':rkey_begin']));

          let resolved = `{
            "playername": "${params.ExpressionAttributeValues[':hkey']}",
            "yyyymm": "${matchDate.yyyymm()}",
            "gamesplayed":  ${data.Count},
            "shots": ${aggregated.shots},
            "goals": ${aggregated.goals},
            "assists": ${aggregated.assists},
            "passattempts": ${aggregated.passattempts},
            "passesmade": ${aggregated.passesmade}
          }`;

          resolve(JSON.parse(resolved));
        }
      });
    });
  });

  return await Promise.all(promiseList);

  // let queryResult = await Promise.all(promiseList);
  
  // let result = {};

  // queryResult.map(record => {
  //   result[record.playername] = record.Count;
  // });
  
  // return await result;
};

const calcClubPlayedGames = async (clubId, monthList) => {
  let paramsList = monthList.map(currentMonth => {
    return {
      TableName: helper.MATCH_TABLE,
      KeyConditionExpression: '#hkey = :hkey and #rkey BETWEEN :rkey_begin AND :rkey_end',
      ExpressionAttributeValues: {
        ':hkey': clubId,
        ':rkey_begin': currentMonth.begin,
        ':rkey_end': currentMonth.end
      },
      ExpressionAttributeNames: {
        '#hkey': 'clubId',
        '#rkey': 'timestamp'
      },
      ProjectionExpression: "clubId"
    };
  });

  let promiseList = paramsList.map(params => {
    return new Promise((resolve, reject) => {

      docClient.query(params, async (err, data) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          let matchDate = new Date(parseInt(params.ExpressionAttributeValues[':rkey_begin']));

          let resolved = `{
            "clubId": "${params.ExpressionAttributeValues[':hkey']}",
            "yyyymm": "${matchDate.yyyymm()}",
            "gamesplayed":  ${data.Count}
          }`;

          resolve(JSON.parse(resolved));
        }
      });
    });
  });

  return await Promise.all(promiseList);
};


const generateMonthParams = function(monthList) {
  return monthList.map(yyyymm => {
    let begin = new Date(yyyymm + 'T00:00:00');

    // console.log(`${yyyymm}, begin: ${begin.toLocaleString()}, end: ${begin.nextMonth().toLocaleString()}`);
    return {
      month: yyyymm,
      begin: begin.getTime(),
      end: begin.nextMonth().getTime()
    };
  });
};

const generateBatchGetParams = function(playerList) {

  // generate query params
  let keyList = playerList.map((playername) => {
    return {
      playername: playername
    };
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.MEMBER_TABLE}":{"Keys": []}}}`);
  params['RequestItems'][`${helper.MEMBER_TABLE}`]['Keys'] = keyList;

  return params;
}

const batchGet = async (params) => {
  return await new Promise((resolve, reject) => {
    docClient.batchGet(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        // console.log(JSON.stringify(data));
        resolve(data);
      }
    });
  });
}

module.exports.saveStats = async (event, context, callback) => {

  let error;
  let result;

  try {

    const payload = parseEvent(event);

    clubId = payload.clubId || helper.CLUB_ID;

    console.log(clubId);

    // let apiResult = await helper.proclubApi.club.getClubMemberStats(clubId);

    // result = await getMemberPlayedGames(payload.playerNameList, 1000628044000, 1550628044000);
    // console.log("***result***", JSON.stringify(result));

    // result = await getClubPlayedGames(clubId, 1000628044000, 1550628044000);
    // console.log("***result2***", JSON.stringify(result));


    // let batchWriteStatsParams = generateBatchWriteStatsParams(apiResult, payload.blazeIdList);
    // blazeIdList = batchWriteStatsParams.blazeIdList;

    // await batchWrite(batchWriteStatsParams.params);

  } catch (err) {
    error = err.stack;
    // console.log("***err***", err);
  }

  done(error, { type: 'result', result }, callback);
};
