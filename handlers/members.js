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
          (mm>9 ? '' : '0') + mm
         ].join('');
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
  let blazeIdList = {};

  let itemList = memberHistoryList.map(record => {
    blazeIdList[record.blazeId] = record.blazeId;

    return { 
      PutRequest: {
        Item: record
      }
    };
  });

  let params = JSON.parse(`{"RequestItems": {"${helper.MEMBER_HISTORY_TABLE}": []}}`);
  params['RequestItems'][`${helper.MEMBER_HISTORY_TABLE}`] = itemList;

  console.log('params', JSON.stringify(params));
  return { params, blazeIdList: Object.keys(blazeIdList) };
}

const batchWrite = function(params) {
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
}

module.exports.save = async (event, context, callback) => {

  let error;
  let blazeIdList;

  try {

    const payload = parseEvent(event);

    let batchWriteParams = generateBatchWriteParams(payload.memberHistoryList);
    blazeIdList = batchWriteParams.blazeIdList;

    await batchWrite(batchWriteParams.params);

  } catch (err) {
    error = err.stack;
    // console.log("***err***", err);
  }

  done(error, { type: 'blazeIdList', blazeIdList }, callback);
};
