(function() {
  var dashboards_types, db, db_host, db_name, db_port, dgram, getDomain, getHitMiss, logger, mongo, mongoose, net, parseLog, recordDashboard, recordRequest, recordRequests, server, server_address, server_port, squidParser, url_object;
  dgram = require('dgram');
  url_object = require('url');
  mongoose = require('mongoose');
  mongo = require('mongodb');
  net = require('net');
  server_address = '127.0.0.1';
  server_port = 514;
  db_host = '127.0.0.1';
  db_port = mongo.Connection.DEFAULT_PORT;
  db_name = 'squid';
  dashboards_types = ["domain", "host", "user", "mime"];
  db = new mongo.Db(db_name, new mongo.Server(db_host, db_port, {}), {
    native_parser: true
  });
  db.open(function(err) {
    return logger(err);
  });
  server = dgram.createSocket("udp4");
  server.on("message", function(msg, rinfo) {
    var request;
    request = parseLog("" + msg);
    if (request.domain != null) {
      return recordRequest(request);
    }
  });
  server.on("listening", function() {
    var address;
    address = server.address();
    return console.log("server listening " + address.address + ":" + address.port);
  });
  server.bind(server_port);
  recordRequest = function(request) {
    recordDashboard(request);
    return recordRequests(request);
  };
  parseLog = function(msg) {
    var new_msg;
    new_msg = msg.replace(/^<.*>/g, "");
    return squidParser(new_msg.replace(/(\n|\r)+$/, ''));
  };
  squidParser = function(log) {
    var access, bytes, day, duration, epoch, host, mime, month, pid, request, result, time, url, urlStr, user, verb, year, _ref;
    _ref = log.split(/\s+/g), month = _ref[0], day = _ref[1], time = _ref[2], server = _ref[3], pid = _ref[4], epoch = _ref[5], duration = _ref[6], host = _ref[7], result = _ref[8], bytes = _ref[9], verb = _ref[10], url = _ref[11], user = _ref[12], access = _ref[13], mime = _ref[14];
    year = new Date().getFullYear();
    try {
      urlStr = url_object.parse(url);
      return request = {
        year: year,
        date: new Date("" + month + " " + day + " " + year + " " + time),
        proxy_server: server,
        pid: pid,
        epoch: epoch,
        bytes: bytes,
        host: host,
        hit: getHitMiss(result),
        http_verb: verb,
        url: url,
        domain: getDomain(urlStr.hostname),
        user: user,
        access: access,
        mime: mime
      };
    } catch (error) {
      return false;
    }
  };
  getDomain = function(hostname) {
    var array, domain;
    array = hostname.split(/\./g);
    if (!net.isIP(hostname)) {
      return domain = "" + array[array.length - 2] + "." + array[array.length - 1];
    } else {
      return hostname;
    }
  };
  getHitMiss = function(result) {
    if (result.match(/HIT/ig)) {
      return 1;
    } else {
      return 0;
    }
  };
  recordDashboard = function(request) {
    return db.collection('dashboardstats', function(err, collection) {
      var dashboard_type, name_value, _i, _len, _results;
      if (err) {
        console.warn("" + err.message);
      }
      _results = [];
      for (_i = 0, _len = dashboards_types.length; _i < _len; _i++) {
        dashboard_type = dashboards_types[_i];
        name_value = Object.getOwnPropertyDescriptor(request, "" + dashboard_type).value;
        _results.push(collection.update({
          type: dashboard_type,
          name: name_value
        }, {
          $inc: {
            requests: 1,
            bytes: parseInt(request.bytes),
            hit: parseInt(request.hit)
          }
        }, {
          upsert: true
        }, function(err) {
          return logger(err);
        }));
      }
      return _results;
    });
  };
  recordRequests = function(request) {
    return db.collection('requests', function(err, collection) {
      if (err) {
        console.warn("" + err.message);
      }
      return collection.insert({
        'proxy_server': request.proxy_server,
        'date': request.date,
        'epoch': parseFloat(request.epoch),
        'bytes': parseInt(request.bytes),
        'src_host': request.host,
        'hit': parseInt(request.hit),
        'request_method': request.http_verb,
        'url': request.url,
        'domain': request.domain,
        'access': request.access,
        'mime': request.mime
      }, function(err) {
        return logger(err);
      });
    });
  };
  logger = function(err) {
    if (err) {
      return console.warn("El error es " + err.message);
    }
  };
}).call(this);
