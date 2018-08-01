'use strict';
const helper = require('../helper/');
const docClient = helper.DOC_CLIENT;

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

const batchGetMatch = async (clubId) => {

  let params = {
    TableName: 'Match_001',
    KeyConditionExpression: '#hkey = :hkey and #rkey > :rkey',
    ExpressionAttributeValues: {
      ':hkey': clubId,
      ':rkey': 1332179592000
    },
    ExpressionAttributeNames: {
      '#hkey': 'clubId',
      '#rkey': 'timestamp'
    }
  };

  return new Promise((resolve, reject) => {
    docClient.query(params, async (err, data) => {
       if (err) {
        console.log(err);
        reject(err);
      } else {
        // console.log(JSON.stringify(data));
        data.Items.map(record => {
          let dateObj = new Date(record.timestamp);

          const localISOTime = (new Date(record.timestamp - helper.TIMEZONE_OFFSET)).toISOString().slice(0, -1);

          record['date'] = localISOTime;
        });

        resolve(data.Items);
      }
    });    
  });
};

const generateBatchPutParams = function(items) {
  return items.map((item) => {
    return {
      TableName : 'Match_001',
      Item: item
    }
  })
};

const batchPutMatch = async (paramsList) => {

  let promiseList = paramsList.map(params => {
    return new Promise((resolve, reject) => {
      docClient.put(params, async (err, data) => {
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

module.exports.patch = async (event, context, callback) => {
  let error;
  let memberStatsList = [];

  try {
    const payload = parseEvent(event);

    let items = await batchGetMatch(payload.clubId);
    // console.log(JSON.stringify(items));

    let paramsList = generateBatchPutParams(items);
    console.log(JSON.stringify(paramsList));

    await batchPutMatch(paramsList);

  } catch (err) {
    error = err.stack;
  }

  done(error, {memberStatsList}, callback);
};