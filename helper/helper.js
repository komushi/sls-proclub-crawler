const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB({ region: 'ap-northeast-1' });
const docClient = new AWS.DynamoDB.DocumentClient({service: dynamodb});
// const docClient = new AWS.DynamoDB.DocumentClient();
const proclubApi = require('./proclubApi');

const ENV_ID = process.env.ENV_ID;
const CLUB_ID = process.env.CLUB_ID;
const API_PLATFORM = process.env.API_PLATFORM;
const MATCH_TABLE = `Match_${ENV_ID}`;
const MEMBER_HISTORY_TABLE = `MemberHistory_${ENV_ID}`;

module.exports = {
	proclubApi, 
	docClient, 
	CLUB_ID, 
	API_PLATFORM, 
	MATCH_TABLE,
	MEMBER_HISTORY_TABLE
};