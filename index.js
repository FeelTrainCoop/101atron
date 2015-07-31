var _ = require('underscore');
_.mixin( require('underscore.deferred') );
var config = require('./config.js');
var Twit = require('twit');
var twitConfig = _.pick(config, 'consumer_key', 'consumer_secret', 'access_token', 'access_token_secret');
var T = new Twit(twitConfig);
var request = require('request');

// configuration
var botName = config.botName;
var redisPort = config.redisPort || 6379;

function popFollowQueue() {
  var redis = require('redis'), client = redis.createClient(redisPort);
  // pop the queue
  client.lpop(botName + '-follow-queue', function(err, reply) {
    console.log('next follower is', reply);
    // if null, ignore
    if (reply !== null) {
      var data = JSON.parse(reply);
      console.log('THE TWEET:', data);
      // if there's no image URL, skip all the image stuff and just tweet the text
      if (!data.url) {
        T.post('statuses/update', { status: data.tweet}, function(err, reply) {
          if (err) {
            console.log('error:', err);
            // close connection and program
            client.end();
          }
          else {
            console.log('reply:', reply);
            // close connection and program
            client.end();
          }
        });
      }
      else {
        // get the base64 encoding of the URL
        var b64url = new Buffer(data.url).toString('base64');
        // see if the url exists in our DB
        client.hexists(botName + '-images',b64url, function(err, doesExist) {
          console.log('doesExist:',doesExist);
          // if the URL does exist, just tweet the data stored there
          if (doesExist) {
            client.hget(botName + '-images',b64url, function(err, theData) {
              // if we have a problem grabbing the image locally, log the error and quit
              if (err) {
                console.log('error:', err);
                // close connection and program
                client.end();
              } else {
                // otherwise we did get our local image and now we tweet it
                T.post('media/upload', { media: theData }, function (err, dataResp) {
                  //console.log(err, dataResp);
                  // now we can reference the media and post a tweet (media will attach to the tweet) 
                  var mediaIdStr = dataResp.media_id_string;
                  T.post('statuses/update', { status: data.tweet, media_ids: [mediaIdStr] }, function(err, reply) {
                    if (err) {
                      console.log('error:', err);
                      // close connection and program
                      client.end();
                    }
                    else {
                      console.log('reply:', reply);
                      // close connection and program
                      client.end();
                    }
                  });
                });
              }
            });
          }
          else {
            // if it doesn't exist, then download the image, convert the image data to base64,
            // then put that in the botName + '-images' hash, and then upload it as media
            var chunks = [];
            // download the image
            request
              .get(data.url)
              .on('error', function(response) {
                console.log('error:', response);
                // close connection and program
                client.end();
              })
              .on('data', function(chunk) {
                chunks.push(chunk);
              })
              .on('end', function() {
                console.log('GOT IT');
                // convert image to base64
                var b64content = Buffer.concat(chunks).toString('base64');
                // put the content in the DB
                client.hset(botName + '-images',b64url,b64content, function(err) {
                  // if we couldn't get an image due to an error, oops, log the error and quit
                  if (err) {
                    console.log('error:', err);
                    // close connection and program
                    client.end();
                  } else {
                    // post the media to Twitter 
                    T.post('media/upload', { media: b64content }, function (err, dataResp) {
                      // now we can reference the media and post a tweet (media will attach to the tweet) 
                      var mediaIdStr = dataResp.media_id_string;
                      T.post('statuses/update', { status: data.tweet, media_ids: [mediaIdStr] }, function(err, reply) {
                        if (err) {
                          console.log('error:', err);
                          // close connection and program
                          client.end();
                        }
                        else {
                          console.log('reply:', reply);
                          // close connection and program
                          client.end();
                        }
                      });
                    });
                  }
                });
              });
          }
        });
      }
    }
    else {
      // empty queue, close client
      client.end();
    }
  });
}

function popQueue() {
  var redis = require('redis'), client = redis.createClient(redisPort);
  // pop the queue
  client.lpop(botName + '-queue', function(err, reply) {
    console.log('next is', reply);
    // if null, ignore
    if (reply !== null) {
      var data = JSON.parse(reply);
      //console.log('THE TWEET:', data);
      T.post('statuses/update', { status: data.tweet, in_reply_to_status_id: data.tweetId }, function(err, reply) {
        if (err) {
          console.log('error:', err);
          // close connection and program
          client.end();
        }
        else {
          console.log('reply:', reply);
          // close connection and program
          client.end();
        }
      });
    }
    else {
      // empty queue, close client
      client.end();
      // pop the follow queue now instead
      popFollowQueue();
    }
  });
}

// we only pop the message queue. if there are no messages (we are not serving activists), THEN we pop the follow queue for some fun instead
popQueue();
