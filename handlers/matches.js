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
          (mm>9 ? '' : '0') + '-' + mm
         ].join('');
};

const done = function(error, result, callback) {
  return error ? callback(new Error(error)) : callback(null, result);
};

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

const generateMonthParams = function(monthList) {
  return monthList.map(yyyymm => {
    let begin = new Date(yyyymm + 'T00:00:00');

    return {
      month: yyyymm,
      begin: begin.getTime(),
      end: begin.nextMonth().getTime()
    };
  });
};

const generateBatchWriteMemberHistoryParams = function(apiResult, matchIdToSaveList) {
  let paramsList = [];
  let itemList = [];
  let memberHistoryList = [];
  let months = {};
  let keys = Object.keys(apiResult);
  let players = {};

  keys.map((matchId, index) => {
    if (matchIdToSaveList.includes(matchId)) {
      // generate memberHistoryList
      let timestamp = parseInt(apiResult[matchId]['timestamp']) * 1000;
      let playersObj = apiResult[matchId]['players'][clubId];
      
      Object.keys(playersObj).map((k, i) => {
        let playerStatsObj = playersObj[k];

        delete playerStatsObj['vproattr'];
        delete playerStatsObj['vprohackreason'];

        playerStatsObj['timestamp'] = timestamp;
        memberHistoryList.push(playerStatsObj);

        players[playerStatsObj['playername']] = '';
      });

      // generate monthList
      let matchDate = new Date(timestamp);
      months[matchDate.yyyymm()] = '';

      // generate paramsList with multiple itemLists which has up to 25 items
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
            timestamp: timestamp,
            duration: matchDate.yyyymm(),
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
            opponentTacklesMade: parseInt(apiResult[matchId]['aggregate'][opponentId]['tacklesmade'])
          }
        }
      });


      if (itemList.length == 25 || index + 1 == keys.length) {
        let params = JSON.parse(`{"RequestItems": {"${helper.MATCH_TABLE}": []}}`);
        params['RequestItems'][`${helper.MATCH_TABLE}`] = Array.from(itemList);

        paramsList.push(params);

        itemList = [];
      }


    }
  });

  return { paramsList, playerList: Object.keys(players), memberHistoryList, monthList: generateMonthParams(Object.keys(months)) } ;
}

const batchWriteMemberHistory = async (paramsList) => {
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
}

const generateBatchGetMatchParams = function(apiResult) {

  // generate query params
  let keyList = [];

  Object.keys(apiResult).map((key, index) => {
    let timestamp = parseInt(apiResult[key]["timestamp"]) * 1000;
    keyList.push({
      clubId: clubId,
      timestamp: timestamp
    });
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.MATCH_TABLE}":{"Keys": [], "ProjectionExpression": "matchId"}}}`);
  params['RequestItems'][`${helper.MATCH_TABLE}`]['Keys'] = keyList;

  return params;
};

const batchGetMatch = function(params) {
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
};

const putClubStats = async (clubStats, clubPlayedMatches) => {
  let incremental = 0;

  Object.keys(clubPlayedMatches).map((key, index) => {
    if (clubStats[key]) {
      incremental += clubPlayedMatches[key].gamesPlayed - clubStats[key].gamesPlayed;
      clubStats[key].gamesPlayed = clubPlayedMatches[key].gamesPlayed;
    } else {
      incremental += clubPlayedMatches[key].gamesPlayed;
      clubStats[key] = clubPlayedMatches[key];
    }
  });

  clubStats.overall.gamesPlayed += incremental;

  let itemList = [];

  Object.keys(clubStats).map((key, index) => {
    itemList.push({
      PutRequest: {
        Item: {
          clubId: clubStats[key].clubId,
          gamesPlayed: clubStats[key].gamesPlayed,
          duration: key          
        }
      }
    })
  });
  
  let params = JSON.parse(`{"RequestItems": {"${helper.CLUB_STATS_TABLE}": []}}`);
  params['RequestItems'][`${helper.CLUB_STATS_TABLE}`] = itemList;

  return await new Promise((resolve, reject) => {
    docClient.batchWrite(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

const getClubStats = async (clubId, monthList) => {

  let keyList = monthList.map(currentMonth => {
    return {
      clubId: clubId,
      duration: currentMonth.month
    };
  });

  keyList.push({
    clubId: clubId,
    duration: 'overall'
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.CLUB_STATS_TABLE}":{"Keys": []}}}`);
  params['RequestItems'][`${helper.CLUB_STATS_TABLE}`]['Keys'] = keyList;

  let clubStatsList = await new Promise((resolve, reject) => {
    docClient.batchGet(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data.Responses[`${helper.CLUB_STATS_TABLE}`]);
      }
    });
  });

  let clubStats = {};

  clubStatsList.map(currentValue => {
    clubStats[currentValue.duration] = {clubId: currentValue.clubId, gamesPlayed: currentValue.gamesPlayed};
  });

  if (!clubStats.overall) {
    clubStats.overall = {clubId: clubId, gamesPlayed: 0};
  }

  return await clubStats;
};

const calcClubPlayedMatches = async (clubId, monthList) => {
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
            "duration": "${matchDate.yyyymm()}",
            "gamesPlayed":  ${data.Count}
          }`;

          resolve(JSON.parse(resolved));
        }
      });
    });
  });

  // return await Promise.all(promiseList);

  let clubPlayedMatchesList = await Promise.all(promiseList);

  let clubPlayedMatches = {};

  clubPlayedMatchesList.map(currentValue => {
    clubPlayedMatches[currentValue.duration] = {clubId: currentValue.clubId, gamesPlayed: currentValue.gamesPlayed};
  });

  return await clubPlayedMatches;
};


module.exports.crawl = async (event, context, callback) => {

  let matchIdToSaveList;
  let monthList;
  let playerList;
  let error;
  let memberHistoryList = [];

  try {

    const payload = parseEvent(event);

    clubId = payload.clubId || helper.CLUB_ID;

    let apiResult = await helper.proclubApi.club.getClubMatchHistory(clubId);

    let batchGetMatchParams = generateBatchGetMatchParams(apiResult);

    let matchIdList = await batchGetMatch(batchGetMatchParams);

    // console.log('***matchIdList***', matchIdList);
  
    matchIdToSaveList = Object.keys(apiResult).filter((key, index) => {
      return !Object.values(matchIdList).includes(key);
    });

    // console.log('***matchIdToSaveList***', JSON.stringify(matchIdToSaveList));

    if (matchIdToSaveList.length > 0) {
      let batchWriteMemberHistoryParams = generateBatchWriteMemberHistoryParams(apiResult, matchIdToSaveList);

      memberHistoryList = batchWriteMemberHistoryParams.memberHistoryList;
      monthList = batchWriteMemberHistoryParams.monthList;
      playerList = batchWriteMemberHistoryParams.playerList;

      await batchWriteMemberHistory(batchWriteMemberHistoryParams.paramsList);

      let clubPlayedMatches = await calcClubPlayedMatches(clubId, monthList);
      console.log('***clubPlayedMatches***', JSON.stringify(clubPlayedMatches));

      let clubStats = await getClubStats(clubId, monthList);
      console.log('***clubStats***', JSON.stringify(clubStats));

      await putClubStats(clubStats, clubPlayedMatches);
    }

  } catch (err) {
    error = err.stack;
    // console.log("***err***", err);
  }

  done(error, {type: 'memberHistoryList', playerList, memberHistoryList, clubId, monthList: monthList}, callback);
};
