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

const generateParamsBatchWriteMemberHistory = function(memberHistoryList) {
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

const batchWriteMemberHistory = function(paramsList) {
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

    let monthList = generateMonthParams(payload.monthList);
    // console.log("***monthList***", JSON.stringify(monthList));

    let clubPlayedGames = await calcClubPlayedGames(clubId, monthList);
    console.log('***clubPlayedGames***', JSON.stringify(clubPlayedGames));

    let clubStats = await getClubStats(clubId);
    console.log('***clubStats***', JSON.stringify(clubStats));

    let putClubResult = await putClub(clubId, clubStats, clubPlayedGames);
    // console.log('putClubResult', JSON.stringify(putClubResult));

    let paramsList = generateParamsBatchWriteMemberHistory(payload.memberHistoryList);
    // console.log('paramsList', JSON.stringify(paramsList));

    let writeMemberHistoryResult = await Promise.all(batchWriteMemberHistory(paramsList));
    // console.log('writeMemberHistoryResult', JSON.stringify(writeMemberHistoryResult));    

    let memberPlayedGames = await calcMemberStats(payload.playerList, monthList);
    console.log('***memberPlayedGames***', JSON.stringify(memberPlayedGames));

    let params = generateParamsBatchGetMember(payload.playerList);
    console.log('params', JSON.stringify(params));

    let memberList = await batchGetMember(params);
    console.log('memberList', JSON.stringify(memberList));

    let paramsList = generateParamsBatchWriteMember(memberList);

  } catch (err) {
    error = err.stack;
  }

  done(error, { clubId }, callback);
};

const putClub = async (clubId, clubStats, clubPlayedGames) => {

  let item = {gamesPlayed: {}, clubId: clubId};

  if (clubStats.Count > 0) {
    item = clubStats.Items[0];
  }

  Object.keys(clubPlayedGames.gamesPlayed).map((key, index) => {
    if (item.gamesPlayed[key]) {
      item.gamesPlayed[key] += clubPlayedGames.gamesPlayed[key];
    } else {
      item.gamesPlayed[key] = clubPlayedGames.gamesPlayed[key];
    }
  });  

  let params = {
    TableName: helper.CLUB_TABLE,
    Item: {}
  };

  params.Item = item;
  console.log("item", JSON.stringify(item))
  
  return await new Promise((resolve, reject) => {
    docClient.put(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

const getClubStats = async (clubId) => {

  let params = {
    TableName: helper.CLUB_TABLE,
    KeyConditionExpression: '#hkey = :hkey',
    ExpressionAttributeValues: {
      ':hkey': clubId
    },
    ExpressionAttributeNames: {
      '#hkey': 'clubId'
    },
    // ProjectionExpression: 'clubId, gamesPlayed'
  };   

  return await new Promise((resolve, reject) => {
    docClient.query(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });

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
            "gamesPlayed":  ${data.Count}
          }`;

          resolve(JSON.parse(resolved));
        }
      });
    });
  });

  let clubPlayedGamesList = await Promise.all(promiseList);

  let result = {gamesPlayed: {}};

  clubPlayedGamesList.map(currentValue => {
    result.gamesPlayed[currentValue.yyyymm] = currentValue.gamesPlayed;
    result.gamesPlayed['overall'] = (result.gamesPlayed['overall'] || 0) + currentValue.gamesPlayed;
  });

  return await result;
};



const generateParamsBatchWriteHistory = function(apiResult, blazeIdList) {

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

const generateParamsBatchGetMember = function(playerList) {

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

const batchGetMember = async (params) => {
  return await new Promise((resolve, reject) => {
    docClient.batchGet(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        // console.log(JSON.stringify(data));
        resolve(data.Responses[`${helper.MEMBER_TABLE}`]);
      }
    });
  });
}


