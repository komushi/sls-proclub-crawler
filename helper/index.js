const AWS = require('aws-sdk');
// const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-1' });
// const docClient = new AWS.DynamoDB.DocumentClient({service: dynamodb});
const docClient = new AWS.DynamoDB.DocumentClient();
const proclubApi = require('./proclubApi');

let envId = process.env.ENV_ID;
let clubStatsTable = `ClubStats_${envId}`;
let matchTable = `Match_${envId}`;
let memberStatsTable = `MemberStats_${envId}`;
let memberHistoryTable = `MemberHistory_${envId}`;
let tzoffset = -480 * 60000;

module.exports = {
	PRO_CLUB_API: proclubApi, 
	DOC_CLIENT: docClient, 
	CLUB_STATS_TABLE: clubStatsTable,
	MATCH_TABLE: matchTable,
	MEMBER_STATS_TABLE: memberStatsTable,
	MEMBER_HISTORY_TABLE: memberHistoryTable,
	TIMEZONE_OFFSET: tzoffset
};

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