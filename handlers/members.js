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
};

const batchWriteMemberHistory = async (memberHistoryList) => {
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

  let promiseList = paramsList.map(params => {
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

  return await Promise.all(promiseList);
};

const sumMemberHistory = async (playerList, monthList) => {
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
            "duration": "${matchDate.yyyymm()}",
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
};

const getMemberStats = async (playerList, monthList) => {
  // generate query params
  let keyList = [];

  playerList.map(playername => {
    let tmpList = monthList.map(currentMonth => {
      return {
        playername: playername,
        duration: currentMonth.month
      };
    });

    keyList = keyList.concat(tmpList);
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.MEMBER_STATS_TABLE}":{"Keys": []}}}`);
  params['RequestItems'][`${helper.MEMBER_STATS_TABLE}`]['Keys'] = keyList;


  return await new Promise((resolve, reject) => {
    docClient.batchGet(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        // console.log(JSON.stringify(data));
        resolve(data.Responses[`${helper.MEMBER_STATS_TABLE}`]);
      }
    });
  });
};

const batchWriteMemberStats = async (memberHistorySummary) => {
  let paramsList = [];
  let itemList = [];

  memberHistorySummary.map((record, index) => {

    itemList.push({ 
      PutRequest: {
        Item: record
      }
    });

    if (itemList.length == 25 || index + 1 == memberHistorySummary.length) {
      let params = JSON.parse(`{"RequestItems": {"${helper.MEMBER_STATS_TABLE}": []}}`);
      params['RequestItems'][`${helper.MEMBER_STATS_TABLE}`] = Array.from(itemList);

      paramsList.push(params);
      itemList = [];
    }
  });

  let promiseList = paramsList.map(params => {
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

  return await Promise.all(promiseList);
};


module.exports.saveHistory = async (event, context, callback) => {

  let error;

  try {

    const payload = parseEvent(event);

    clubId = payload.clubId || helper.CLUB_ID;

    await batchWriteMemberHistory(payload.memberHistoryList);
    
    let memberHistorySummary = await sumMemberHistory(payload.playerList, payload.monthList);
    console.log('***memberHistorySummary***', JSON.stringify(memberHistorySummary));

    await batchWriteMemberStats(memberHistorySummary);

    let memberStatsList = await getMemberStats(payload.playerList, payload.monthList);
    console.log('***memberStatsList***', JSON.stringify(memberStatsList));

  } catch (err) {
    error = err.stack;
  }

  done(error, { clubId }, callback);
};