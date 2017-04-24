# 101atron

101atron is a general purpose bot that listens for authorized users to "invoke" its knowledge base. It's meant to save activists time so you don't have to dig up the same old 101-level articles whenever well-meaning people on Twitter ask you to explain basic concepts to them. Instead you say, "@101atron, tell @thisRandomPerson about human rights" and it'll reply with a link that you've previously associated with the key phrase "human rights".

The key phrases, the authorized users, and even the language it uses to respond are configured via a Google Spreadsheet. While you need a technical person to **run** the bot, you don't need to be technical to **edit** the bot and give it more vocabulary, concepts, etc. You just need to be able to run a Google Spreadsheet.

For a general overview of its use, [check out this article](http://feeltrain.com/blog/stay-woke/).

## Installation prerequisites

To install and run 101atron you need the following software:

* [Node.js](https://nodejs.org/) v0.10+.
* [redis](https://redis.io/topics/quickstart). This is the database software used to track state.

This has only been tested on OSX and Ubuntu 14.04 LTS. It might work on Windows but I haven't checked.

## Installation

Clone this repository locally:

`$ git clone git@github.com:dariusk/101atron.git`

or just [download the zip](https://github.com/dariusk/101atron/archive/master.zip) and extract it.

Next enter the project directory and install the dependencies using `npm`, which comes with Node.js:

```bash
$ cd 101atron/
$ npm install
```

## Overview

Before you run the bot, it's useful to understand how it's architected. The bot consists of two executable files: `index.js` and `watcher.js`.

`watcher.js` is designed to be always running in the background. This is the process that watches for users "invoking" the bot and for users following the bot. It's always listening to Twitter. When a user tweets something like "hey @101atron tell @tinysubversions about cats", this file registers the event and then composes a tweet that is pushed to our Redis database. *Importantly, this file does not ever tweet: it just queues tweets up in a database.*

`index.js` is where the tweeting happens, and is a much simpler piece of code. This file is meant to be executed via a cron job or other scheduler. If you set it to run every five minutes, then every five minutes the code will look at the database, see if there's a tweet it's supposed to tweet, and then posts it to Twitter.

## Set up your bot's Twitter account

At this point you need to register a Twitter account and also get its "app info".

So create a Twitter account for your bot. Twitter doesn't allow you to register multiple twitter accounts on the same email address. I recommend you create a brand new email address (try using Gmail) for the Twitter account. Once you register the account to that email address, wait for the confirmation email.

Next, open the Twitter profile for the bot and *associate a mobile phone number with it*. You have to do this in order to register an application. If you only have one mobile phone number and it's already used on a different account, don't sweat it: just disconnect the phone from the other account and connect it to the bot for now. Once you're done registering the app, you can disconnect again and reconnect the phone to the previous account.

Once you've connected a phone number, go here and log in as the Twitter account for your bot:

https://apps.twitter.com/apps/new

Once you're there, fill in the required fields: name, description, website. None of it really matters at all to your actual app, it's just for Twitter's information. Do the CAPTCHA and submit.

Next you'll see a screen with a "Details" tab. Click on the "Settings" tab and under "Application Type" choose "Read and Write", then hit the update button at the bottom.

Then go back to the Details tab, and at the bottom click "create my access token". Nothing might happen immediately. Wait a minute and reload the page. Then there should be "access token" and "access token secret", which are both long strings of letters and numbers.

Now use a text editor to open up the `config.js` file. It should look like this:

```javascript
module.exports = {
  consumer_key:         'blah',
  consumer_secret:      'blah',
  access_token:         'blah',
  access_token_secret:  'blah',
  redisPort:            6379,
  botName:              '@AccountNameOfYourBotGoesHere',
  spreadsheetKey:       '1kTohpjjl8i0GFUdvIUc1HLv0hV_JbOaMav7nKVWc7AY'
}
```

In between those quotes, instead of `'blah'`, paste the appropriate info from the Details page. This is essentially the login information for the app that runs your bot.

## Run the database and configure the bot

So the first thing we need to make this run is our database. Run a Redis server as a background process if you're not already running one:

`$ redis-server &`

This code assumes that Redis is running on its default port of 6379. If you're running it on a different port, just edit `config.js` and change the value of `redisPort` to the right port.

Next, update the `botName` field in `config.js` to the username of your actual Twitter account for the bot, along with the '@' symbol. If the account name is '@myFirstBot' then set `botName` to exactly that.

## Set up the spreadsheet

Take a look at the [default 101atron spreadsheet](https://docs.google.com/spreadsheets/d/1kTohpjjl8i0GFUdvIUc1HLv0hV_JbOaMav7nKVWc7AY/edit?usp=sharing). It consists of four tabs: Links, Users, Responses, and Follow Rewards. The spreadsheet itself is pretty well documented -- just open up each tab and read the description of what it does to familiarize yourself with it.

Right now the bot is set up to use this exact spreadsheet. You can see in the URL that there is a long string of characters -- this is the "spreadsheet key", and it matches what's currently set in `config.js` for `spreadsheetKey`.

You can use this existing spreadsheet to test things out, but eventually you'll want to make a copy of the spreadsheet and enter the new spreadsheet key into `config.js`, then go to "File --> Publish to the web..." and publish the entire spreadsheet to the web. This allows the bot to view the spreadsheet and read the data you put in there.

## Your first test run

Once you have a spreadsheet set up and published (or you're just using the default one), run:

`$ node watcher.js`

This will make the bot start "watching" for input.

Next, use a Twitter account that you've authorized to invoke the bot in the "Users" tab of the spreadsheet and tweet at the bot with a phrase that includes "about" followed by one of the keywords, along with another user's name.

"@myBotName, tell @twitter about cats"

This should almost immediately cause the terminal window running `watcher.js` to write some text to the screen confirming that it saw you talk to it and that it put a tweet in the Redis DB.

In another terminal window, manually run `index.js` to pull that tweet from the DB and tweet it.

`$ node index.js`

## Permanent setup

If you want this to run reliably and permanently, I recommend the following setup:

* run the bot on a remote server of some kind so it can run 24/7.
* use a process monitoring program like [forever](https://www.npmjs.com/package/forever) to run `watcher.js`. This will automatically restart `watcher.js` if it crashes for some reason.
* run your redis DB and `watcher.js` (via `forever` or similar) on reboot.
* run `index.js` via `cron` or a similar scheduler, and don't have it run more than once a minute (otherwise you'll run into Twitter rate limits).

## Questions

This is pretty complex, so feel free to post any questions you might have in our [issues page](https://github.com/dariusk/101atron/issues).

## License
Copyright (c) 2015 Kazemi, Darius
Licensed under the MIT license.
