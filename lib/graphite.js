var graphite = require('graphite-promise'),
  validator = require('./validator');

/*
 Anatomy of a sensorInfo:
 {
 "id":"2813567",
 "clientName":"Hemma",
 "name":"temperature.firstfloor",
 "lastUpdated":1423447479,
 "ignored":0,
 "editable":1,
 "data":[
 {
 "name":"temp",
 "value":"20.8",
 "scale":"0"
 }],
 "protocol":"fineoffset",
 "sensorId":"66",
 "timezoneoffset":3600,
 "battery":"254"}
 */

module.exports = function(config) {
  var logger = require('./logger')(config).getLogger(__filename),
    metric = require('./metric')(config.format),
    client = graphite.createClient(config.graphiteUrl);

  function logMetric(metric, timestamp) {
    return client.write(metric, timestamp);
  }

  function _logSensorInfo(sensorInfo) {
    return new Promise(function(resolve, reject) {
      if (!sensorInfo) {
        return reject(new Error('sensorInfo must not be empty'));
      }
      if (!sensorInfo.name) {
        return reject(new Error('sensorInfo must have a name'));
      }
      if (!validator.isTimestamp(sensorInfo.lastUpdated)) {
        return reject(new Error('lastUpdated is not a timestamp'));
      }
      var promises = sensorInfo.data.map(function(data) {
        if (!data.name) {
          return reject(new Error('data must have a name'));
        }
        if (!validator.isNumber(data.value)) {
          return reject(new Error('data must have a numeric value'));
        }
        var m = metric.create(sensorInfo, data),
          ts = (sensorInfo.lastUpdated * 1000) + sensorInfo.timezoneoffset || 0;
        return logMetric(m, ts);
      });
      return Promise.all(promises).then(function(metric) {
        logger.info(metric);
        resolve(metric);
      }, function(error) {
        logger.error(error); // typically network problem
        reject(error);
      });
    });
  }

  /**
   * Log all sensor infos
   * @param sensorInfos list of sensor infos
   */
  function logAll(sensorInfos) {
    return Promise.all(sensorInfos.map(_logSensorInfo)).then(function(results) {
      results.map(function(sensorInfo) {
        logger.info('Logged:', JSON.stringify(sensorInfo));
      });
    }, function(error) {
      logger.error('Logging failed:', error);
    }).then(function() {
      return client.end();
    });
  }

  return {
    logAll: logAll,
    _logSensorInfo: _logSensorInfo
  };
};
