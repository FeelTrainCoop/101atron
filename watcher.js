var _ = require('underscore');
_.mixin( require('underscore.deferred') );
var config = require('./config.js');
var Twit = require('twit');
var T = new Twit(config);
var GoogleSpreadsheet = require('google-spreadsheet');
var gs = new GoogleSpreadsheet(config.spreadsheetKey);

var botName = config.botName;
var redisPort = config.redisPort || 6379;
var redis = require('redis'), client = redis.createClient(redisPort);

var users = [],
    keywords = [],
    replies = [],
    rewards = [],
    lookup = {};

function updateData() {
  // get the first sheet, for keywords
  gs.getRows(1, function(err, data){
    var newLookup = {};
    // clear out the keywords list before we put in new ones
    keywords = [];
    _.each(data, function(el) {
      keywords.push(el.keyword.toLowerCase());
      newLookup[el.keyword.toLowerCase()] = el.url;
    });
    lookup = newLookup;
    console.log('Keywords:', keywords);
  });

  // get the second sheet, for users
  gs.getRows(2, function(err, data){
    // clear out the users list before we put in new ones
    users = [];
    _.each(data, function(el) {
      users.push(el.user.toLowerCase());
    });
    console.log('Authorized users:', users);
  });

  // get the third sheet, for replies
  gs.getRows(3, function(err, data){
    // clear out the replies list before we put in new ones
    replies = [];
    // remove empty data from the data array
    data = _.reject(data, function(el) {
      return el.text === '';
    });
    _.each(data, function(el) {
      replies.push(el.text);
    });
    console.log('Replies:', replies);
  });

  // get the fourth sheet, for follow rewards
  gs.getRows(4, function(err, data){
    // clear out the replies list before we put in new ones
    rewards = [];
    // remove empty data from the data array, also remove data that is over 140 chars
    data = _.reject(data, function(el) {
      return el.text === '' || el.length > 140;
    });
    _.each(data, function(el) {
      // only push if there's text, image, or text+image. link doesn't factor in
      if (el.text || el.image) {
        rewards.push({text: el.text, url: el.image, link: el.link});
      }
    });
    console.log('Rewards:', rewards);
  });
}

Array.prototype.pick = function() {
  return this[Math.floor(Math.random()*this.length)];
};

// start listening for mentions of our bot name
var stream = T.stream('statuses/filter', { track: [botName] });

stream.on('tweet', function (eventMsg) {
  var text = eventMsg.text.toLowerCase();
  // If this is a retweet, we'll just overwrite the text with junk to ignore it
  if (eventMsg.retweeted_status) {
    text = '***';
  }
  var user = eventMsg.user.screen_name.toLowerCase();
  console.log(user, 'tweeted at us');

  // check to see if the user is in our list of accepted users
  var isAuthorized = (users.indexOf(user) !== -1);
  console.log('Is authorized: ', isAuthorized);
  // if the user is authorized to use the bot...
  if (isAuthorized) {
    var postText;
    // parse out just the bit of the tweet after the word "about", this way you can use
    // keywords BEFORE you say "about"
    if (text.match(/\sabout\s(.*)$/)) {
      postText = text.match(/\sabout\s(.*)$/)[1];
    }
    // check to see if a valid keyword is in the text of the string, normalized for case
    // undefined if not found, per _.find()
    var wordFound = _.find(keywords, function(keyword) {
      // passes if the keyword is in our tweet text
      return postText.indexOf(keyword) !== -1;
    });
    console.log('wordFound',wordFound);

    // if we did find a word...
    if (wordFound !== undefined) {
      // extract every user from the tweet as an array of usernames (minus our own username)
      // match all usernames but remove the bot name itself (case insensitive)
      // so that we have a list of people we're tagging in the message
      var mentions = _.difference(text.match(/@\w*/g), [botName.toLowerCase()]);
      // get the tweet ID we're replying to so we can preserve the thread
      var tweetId = eventMsg.id_str;
      // look up the URL for the corresponding keyword
      var url = lookup[wordFound];
      // build our tweet, which is the user we're replying to, plus a list of mentions,
      // plus one of our replies with the link inserted instead of "LINK"
      var tweet = '@' + user + ' ' + mentions.join(' ') + ' ' + replies.pick().replace('LINK',url);
      var data = JSON.stringify({
        tweetId: tweetId,
        tweet: tweet
      });
      console.log(data);
      client.rpush(botName + '-queue', data, redis.print);    
    }
  }
  console.log(user + ': ' + text);
});

var userStream = T.stream('user');
// also track follows and add to a different queue
userStream.on('follow', function (eventMsg) {
  var name = eventMsg.source.name;
  var screenName = eventMsg.source.screen_name;
  console.log('followed by', name, screenName);
  // check if this person is in the followed Set
  client.sismember(botName + '-followed-set', screenName, function(err, isMember) {
    // if this person is NOT in the followed Set, push them to the queue
    if (!isMember) {
      var reward = rewards.pick();
      var data = JSON.stringify({
        tweet: '@' + screenName + ' ' + reward.text,
        url: reward.url
      });
      client.rpush(botName + '-follow-queue', data, redis.print);
      // add this person to the followed Set
      client.sadd(botName + '-followed-set', screenName);
    }
    // if the person is in the follow set, well then...
    else {
      // do nothing
    }
  });
});

// on launch, and every five minutes, update the spreadsheet
updateData();
setInterval(updateData, 2*60*1000);
