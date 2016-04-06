Text-based FPS Telegram Bot or PowPow for friends
==============
It's a Telegram bot for a text-based FPS game made by [Rodrigo Araujo](http://www.dygufa.com/) based on [Guilherme Sehn's](http://www.guisehn.com/) Text-based FPS [project](https://github.com/guisehn/text-based-fps). 

How to play
----------

First you need to start a conversation with [PowPow](http://telegram.me/powpowbot). After he will ask you to join a room by typing `/room Room Name` (e.g.: `/room powpow1`) and that's it! :)

### Commands:

* /room - Choose the room 
* look - Show the room map and the enemies on your front
* move north/south/west/east - Move to another place
* turn north/south/west/east/around - Turn to another direction so you can view and fire your enemies
* fire - Fire
* ammo - Show how much ammo you have
* health - Show how health you have
* reload - Reload your gun
* score - Show score table
* respawn - Respawn if you are dead
* /start and /help - Give instructions about how to use the bot
* /quit - Quit the room

How to run on your server
----------

First you will need to [create a Telegram bot](https://core.telegram.org/bots#3-how-do-i-create-a-bot), it will allow you to get the bot token.

You will also need to have [node.js](http://nodejs.org/) installed.

With both of them you can run `POWPOWBOT_TOKEN="YOUR_TOKEN_HERE" node fps.js `