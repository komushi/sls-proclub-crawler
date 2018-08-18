const AWS = require('aws-sdk');
// const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-1' });
// const docClient = new AWS.DynamoDB.DocumentClient({service: dynamodb});
const docClient = new AWS.DynamoDB.DocumentClient();
const proclubApi = require('./proclubApi');

let TblClubStats = process.env.TBL_CLUB_STATS;
let TblClubHistory = process.env.TBL_CLUB_HISTORY;
let TblMemberHistory = process.env.TBL_MEMBER_HISTORY;
let TblMemberStats = process.env.TBL_MEMBER_STATS;
// let tzoffset = -480 * 60000;
let tzoffset = process.env.TIMEZONE_OFFSET_HOURS * 60 * 60000;

module.exports = {
	PRO_CLUB_API: proclubApi, 
	DOC_CLIENT: docClient, 
	TBL_CLUB_STATS: TblClubStats,
	TBL_CLUB_HISTORY: TblClubHistory,
	TBL_MEMBER_HISTORY: TblMemberHistory,
	TBL_MEMBER_STATS: TblMemberStats,
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