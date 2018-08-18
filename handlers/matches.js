'use strict';
const helper = require('../helper/');
const docClient = helper.DOC_CLIENT;

const done = function(error, result, callback) {
  return error ? callback(new Error(error)) : callback(null, result);
};

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

const generateMonthParams = function(monthList) {
  return monthList.map(yyyymm => {
    let begin = new Date(yyyymm + 'T00:00:00Z');

    return {
      month: yyyymm,
      begin: begin.getTime() + helper.TIMEZONE_OFFSET,
      end: begin.nextMonth().getTime() + helper.TIMEZONE_OFFSET
    };
  });
};

const generateDayParams = function(dayList) {
  return dayList.map(yyyymmdd => {
    let begin = new Date(yyyymmdd + 'T00:00:00Z');
    let end = new Date(begin);
    end.setDate(begin.getDate()+1);

    return {
      day: yyyymmdd,
      begin: begin.getTime() + helper.TIMEZONE_OFFSET,
      end: end.getTime() + helper.TIMEZONE_OFFSET
    };
  });
};

const generateBatchWriteMatchParams = function(clubId, apiResult, matchIdToSaveList) {
  let paramsList = [];
  let itemList = [];
  let memberHistoryList = [];
  let months = {};
  let days = {};
  let keys = Object.keys(apiResult);
  let players = {};

  keys.map((matchId, index) => {
    if (matchIdToSaveList.includes(matchId)) {
      // generate memberHistoryList
      let timestamp = parseInt(apiResult[matchId]['timestamp']) * 1000;
      let playersObj = apiResult[matchId]['players'][clubId];
      let gameDate = (new Date(timestamp - helper.TIMEZONE_OFFSET));
      // let gameDate = (new Date(timestamp - helper.TIMEZONE_OFFSET)).toISOString().slice(0, -1);

      // generate dayList
      days[gameDate.toISOString().slice(0, 10)] = '';

      // generate monthList
      months[gameDate.yyyymm()] = '';
      
      Object.keys(playersObj).map((k, i) => {
        let playerStatsObj = playersObj[k];

        delete playerStatsObj['vproattr'];
        delete playerStatsObj['vprohackreason'];

        playerStatsObj['timestamp'] = timestamp;
        playerStatsObj['date'] = gameDate.toISOString().slice(0, 10);
        playerStatsObj['clubId'] = clubId;
        memberHistoryList.push(playerStatsObj);

        players[playerStatsObj['playername']] = '';
      });




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
            duration: gameDate.yyyymm(),
            date: gameDate.toISOString().slice(0, 10),
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


      if (itemList.length == 25 || index + 1 == matchIdToSaveList.length) {
        let params = JSON.parse(`{"RequestItems": {"${helper.TBL_CLUB_HISTORY}": []}}`);
        params['RequestItems'][`${helper.TBL_CLUB_HISTORY}`] = Array.from(itemList);

        paramsList.push(params);

        itemList = [];
      }
    }
  });

  return { paramsList, playerList: Object.keys(players), memberHistoryList, monthList: generateMonthParams(Object.keys(months)), dayList: generateDayParams(Object.keys(days)) } ;
}

const batchWriteMatch = async (paramsList) => {
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

const generateBatchGetMatchParams = function(clubId, apiResult) {

  // generate query params
  let keyList = [];

  Object.keys(apiResult).map((key, index) => {
    let timestamp = parseInt(apiResult[key]["timestamp"]) * 1000;
    keyList.push({
      clubId: clubId,
      timestamp: timestamp
    });
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.TBL_CLUB_HISTORY}":{"Keys": [], "ProjectionExpression": "matchId"}}}`);
  params['RequestItems'][`${helper.TBL_CLUB_HISTORY}`]['Keys'] = keyList;

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

        let matchIdList = data['Responses'][`${helper.TBL_CLUB_HISTORY}`].map((matchIdObj) => {
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
  
  let params = JSON.parse(`{"RequestItems": {"${helper.TBL_CLUB_STATS}": []}}`);
  params['RequestItems'][`${helper.TBL_CLUB_STATS}`] = itemList;

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

  let params = JSON.parse(`{"RequestItems": {"${helper.TBL_CLUB_STATS}":{"Keys": []}}}`);
  params['RequestItems'][`${helper.TBL_CLUB_STATS}`]['Keys'] = keyList;

  let clubStatsList = await new Promise((resolve, reject) => {
    docClient.batchGet(params, async (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(data.Responses[`${helper.TBL_CLUB_STATS}`]);
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
      TableName: helper.TBL_CLUB_HISTORY,
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
          let resolved = `{
            "clubId": "${params.ExpressionAttributeValues[':hkey']}",
            "duration": "${(new Date(parseInt(params.ExpressionAttributeValues[':rkey_begin']) - helper.TIMEZONE_OFFSET)).yyyymm()}",
            "gamesPlayed":  ${data.Count}
          }`;

          resolve(JSON.parse(resolved));
        }
      });
    });
  });

  let clubPlayedMatchesList = await Promise.all(promiseList);

  let clubPlayedMatches = {};

  clubPlayedMatchesList.map(currentValue => {
    clubPlayedMatches[currentValue.duration] = {clubId: currentValue.clubId, gamesPlayed: currentValue.gamesPlayed};
  });

  return await clubPlayedMatches;
};


module.exports.crawlMatch = async (event, context, callback) => {
  let payload;
  let matchIdToSaveList;
  let monthList;
  let dayList;
  let playerList;
  let error;
  let memberHistoryList = [];

  try {

    payload = parseEvent(event);

    let apiResult = await helper.PRO_CLUB_API.club.getClubMatchHistory(payload.clubId);

    let batchGetMatchParams = generateBatchGetMatchParams(payload.clubId, apiResult);

    let matchIdList = await batchGetMatch(batchGetMatchParams);
  
    matchIdToSaveList = Object.keys(apiResult).filter((key, index) => {
      return !Object.values(matchIdList).includes(key);
    });

    if (matchIdToSaveList.length > 0) {
      let batchWriteMatchParams = generateBatchWriteMatchParams(payload.clubId, apiResult, matchIdToSaveList);

      memberHistoryList = batchWriteMatchParams.memberHistoryList;
      monthList = batchWriteMatchParams.monthList;
      dayList = batchWriteMatchParams.dayList;
      playerList = batchWriteMatchParams.playerList;
      console.log('***monthList***', JSON.stringify(monthList));
      console.log('***dayList***', JSON.stringify(dayList));

      await batchWriteMatch(batchWriteMatchParams.paramsList);

      let clubPlayedMatches = await calcClubPlayedMatches(payload.clubId, monthList);
      console.log('***clubPlayedMatches***', JSON.stringify(clubPlayedMatches));

      let clubStats = await getClubStats(payload.clubId, monthList);
      console.log('***clubStats***', JSON.stringify(clubStats));

      await putClubStats(clubStats, clubPlayedMatches);
    }

  } catch (err) {
    error = err.stack;
    // console.log("***err***", err);
  }

  done(error, {type: 'memberHistoryList', memberHistoryList, playerList, monthList, dayList}, callback);
};
