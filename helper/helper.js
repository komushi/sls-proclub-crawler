const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-1' });
const docClient = new AWS.DynamoDB.DocumentClient({service: dynamodb});
// const docClient = new AWS.DynamoDB.DocumentClient();
const proclubApi = require('./proclubApi');

const ENV_ID = process.env.ENV_ID;
const CLUB_ID = process.env.CLUB_ID;
const API_PLATFORM = process.env.API_PLATFORM;
const CLUB_TABLE = `Club_${ENV_ID}`;
const MATCH_TABLE = `Match_${ENV_ID}`;
const MEMBER_TABLE = `Member_${ENV_ID}`;
const MEMBER_HISTORY_TABLE = `MemberHistory_${ENV_ID}`;

module.exports = {
	proclubApi, 
	docClient, 
	CLUB_ID, 
	API_PLATFORM,
	CLUB_TABLE,
	MATCH_TABLE,
	MEMBER_TABLE,
	MEMBER_HISTORY_TABLE
};