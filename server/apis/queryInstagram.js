/**
* @module queryInstagram
*/
var request = require('request');
var util = require('util');
var _ = require('lodash');
var instaKeys = require('../instaKeys');

/**
* instaSettings contains the various API endpoint URLs
* Currently using mediaGET for user requests that include latitude and longitude
* Requests with a place descriptor and no latitude longitude will use locationGET and photoGET
* @object
*/
var instaSettings = {
  headers: instaKeys.keys,
  queryGET: 'https://api.instagram.com/v1/tags/',
  queryGET2: '/media/recent',
  mediaGET: 'https://api.instagram.com/v1/media/search',
  locationGET: 'https://api.instagram.com/v1/locations/search',
  photoGET: 'https://api.instagram.com/v1/locations/',
  photoGET2: '/media/recent'
};

// amount of milliseconds in a day
var dayInMilliSeconds = 24 * 60 * 60 * 1000;
var inputParams = {};

/**
* Direct query of instagram media using lat, lng co-ordinates and date/time range OR query string
* @function
* @memberof module:queryInstagram
* @param {object} allParameters Object of parameters passed in via query string.  May contain the following parameters (lat, lng, minDate, maxDate, query, distance, and callType)
* @param {function} callback Callback function invoked on response results
*/

module.exports = function(allParameters, callback) {

// module.exports = function(lat, lng, minDate, maxDate, distance, query, callback) {
  inputParams.minDate = Math.floor(allParameters.minDate/1000) || null;
  inputParams.maxDate = Math.floor(allParameters.maxDate/1000) || null;
  inputParams.lat = parseFloat(allParameters.lat) || null;
  inputParams.lng = parseFloat(allParameters.lng) || null;
  inputParams.query = allParameters.query || 'null';
  inputParams.query = inputParams.query.split(' ').join('').toLowerCase();
  inputParams.distance = allParameters.distance || 1000;

  var requestURL;
  var sortParams=['tagMatch','distance'];

  if(allParameters.callType === 'query') {
    requestURL = instaSettings.queryGET + '%s' + instaSettings.queryGET2 + '?access_token=%s';
    requestURL = util.format(requestURL, inputParams.query, instaSettings.headers.instaToken);
    sortParams = ['distance'];
  } else {
    requestURL = instaSettings.mediaGET + '?access_token=%s&lat=%s&lng=%s&max_timestamp=%s&min_timestamp=%s&distance=%s';
    requestURL = util.format(requestURL, instaSettings.headers.instaToken, inputParams.lat, inputParams.lng, inputParams.maxDate, inputParams.minDate, inputParams.distance);
  }


  request(requestURL,function(error, res, body) {
    var results = JSON.parse(body);
    callback(error, sortResults(resultsDecorator(results.data,[trimResponse,applyTagFilter,calculateDistance]),sortParams));
  });
};

/**
* Add new attributes to an object of photos
* @function
* @param {object} results Object containing data from Instagram response call
* @param {array} Array of functions that will add attributes to photoObj
* @returns {object} results Object containing data from Instagram response call and additional attributes appended
*/
var resultsDecorator = function(results, funcArray) {
  _(results).forEach(function(item) {
    _(funcArray).forEach(function(func) {
      func(item);
    });
  });
  return results;
};

/**
* trimResponse cleans up the response from Instagram's API and removes extraneous data
* @function
* @param {object} photoObj Object containing response (after invoking JSON.parse) from Instagram API call
* @returns {object} photoObj Object with attributes removed
*/
var trimResponse = function(photoObj) {
  delete photoObj.attribution;
  delete photoObj.comments;
  delete photoObj.filter;
  delete photoObj.likes.data;
  delete photoObj.likes.users_in_photo;
  delete photoObj.likes.user_has_liked;
  delete photoObj.likes.user;
  delete photoObj.users_in_photo;
  delete photoObj.user_has_liked;

  if (photoObj.caption) {
    delete photoObj.caption.created_time;
    delete photoObj.caption.from;
    delete photoObj.caption.id;
  }
  return photoObj;
};

/**
* Flag all results that have instagram hash tags that match (or partially match) the user's query string
* @function
* @param {object} results Object containing photo data from Instagram API call
* @param {string} tag String entered in query field of service
* @returns {object} Object containing photo data with tagMatch attribute appended
*/
var applyTagFilter = function(photoObj) {
  var tagFound = 1;
  for(var i=0;i<photoObj.tags.length;i++) {
    if(photoObj.tags[i].indexOf(inputParams.query) > -1) {
      tagFound = 0;
    }
  }
   _.extend(photoObj, {tagMatch: tagFound});
  return photoObj;
};

/**
* Calculate distance from lat/lng inputs in instaLocations
* @function
* @param {object} photoObj Object containing photo data from Instagram API call
* @returns {object} photoObj Object containing photo data with distance attribute appended - if photoObj.location is set to null, return value of 100,000 in order to sort it last
*/
var calculateDistance = function(photoObj) {

  if(photoObj.location === null || inputParams.lat === undefined ||  inputParams.lng === undefined) {
    _.extend(photoObj, { distance: 10000000 });
  } else {
    var firstLocation = {
      lat: inputParams.lat,
      lng: inputParams.lng
    };
    var secondLocation = {
      lat: photoObj.location.latitude,
      lng: photoObj.location.longitude
    };
    console.log('firstLocation: ',firstLocation);
    console.log('secondLocation: ',secondLocation);
    _.extend(photoObj, { distance: distance(firstLocation, secondLocation) });
  }

  return photoObj;
};

/**
* Calculate distance from lat/lng inputs in instaLocations
* @function
* @param {object} results Object containing response from Instagram API call with additional appended attributes (ex. tagMatch, distance)
* @param {parameters} parameters Array of sorting parameters in order of priority
* @returns {array} Array of results sorted by parameters
*/
var sortResults = function(results, parameters) {
  return _(results).sortBy(parameters).valueOf();
};

/**
* Derived from: http://stackoverflow.com/questions/27928/how-do-i-calculate-distance-between-two-latitude-longitude-points
* Helper function that calculates distance between two sets of lat/lng co-ordinates
* @function
* @param {object} loc1 Object containing lattitude, longitude of first location (lat, lng)
* @param {object} loc2 Object containing lattitude, longitude of second location (lat, lng)
* @returns {number} The distance between the first and second location
*/
var distance = function(loc1, loc2) {
  var RADIUS = 6371;
  var lngDiff = degreeToRadian(loc1.lng - loc2.lng);
  var latDiff = degreeToRadian(loc1.lat - loc2.lat);
  var dist = Math.pow(Math.sin(latDiff/2),2) + (Math.cos(degreeToRadian(loc1.lat)) * Math.cos(degreeToRadian(loc2.lat))) * Math.pow(Math.sin(lngDiff/2),2);

  var distance = Math.atan(Math.sqrt(dist), Math.sqrt(1-dist)) * 2 * RADIUS;

  return distance;
};

/**
* Calculations from: https://github.com/kvz/phpjs/blob/master/functions/math/deg2rad.js
* Helper function for distance function that converts degrees to randians
* @function
* @param {number} number
*/
var degreeToRadian = function(number) {
  return (number / 180) * Math.PI;
};
