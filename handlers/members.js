'use strict';
const helper = require('../helper/');
const docClient = helper.DOC_CLIENT;

const done = function(error, result, callback) {
  return error ? callback(new Error(error)) : callback(null, result);
}

const parseEvent = function(event) {
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

const sumMemberHistory = async (playerList, durationList, durationFlag) => {
  let paramsList = [];

  playerList.map(playerName => {
    let params = durationList.map(currentDuration => {
      return {
        TableName: helper.MEMBER_HISTORY_TABLE,
        KeyConditionExpression: '#hkey = :hkey and #rkey BETWEEN :rkey_begin AND :rkey_end',
        ExpressionAttributeValues: {
          ':hkey': playerName,
          ':rkey_begin': currentDuration.begin,
          ':rkey_end': currentDuration.end
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
          let duration;
          if (durationFlag === 'monthly') {
            duration = (new Date(parseInt(params.ExpressionAttributeValues[':rkey_begin']))).yyyymm();
          } else if (durationFlag === 'daily') {
            // let tmpString = (new Date(parseInt(params.ExpressionAttributeValues[':rkey_begin']) - helper.TIMEZONE_OFFSET)).toISOString();
            // console.log('tmpString', tmpString);
            // let tmp2String = (new Date(parseInt(params.ExpressionAttributeValues[':rkey_begin']))).toISOString();
            // console.log('tmp2String', tmp2String);
            duration = (new Date(parseInt(params.ExpressionAttributeValues[':rkey_begin']) - helper.TIMEZONE_OFFSET)).toISOString().slice(0, 10);
          }

          let resolved = `{
            "playername": "${params.ExpressionAttributeValues[':hkey']}",
            "duration": "${duration}",
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

module.exports.saveStats = async (event, context, callback) => {
  let error;
  let memberStatsList = [];

  try {

    const payload = parseEvent(event);

    if (payload.memberHistoryList && payload.memberHistoryList.length > 0) {
      await batchWriteMemberHistory(payload.memberHistoryList);
      
      let memberHistoryMonthlySummary = await sumMemberHistory(payload.playerList, payload.monthList, 'monthly');
      console.log('***memberHistoryMonthlySummary***', JSON.stringify(memberHistoryMonthlySummary));

      let memberHistoryDailySummary = await sumMemberHistory(payload.playerList, payload.dayList, 'daily');
      console.log('***memberHistoryDailySummary***', JSON.stringify(memberHistoryDailySummary));

      await batchWriteMemberStats(memberHistoryMonthlySummary);

      await batchWriteMemberStats(memberHistoryDailySummary);

      // memberStatsList = await getMemberStats(payload.playerList, payload.monthList);
      // console.log('***memberStatsList***', JSON.stringify(memberStatsList));      
    }

  } catch (err) {
    error = err.stack;
  }

  done(error, {memberStatsList}, callback);
};