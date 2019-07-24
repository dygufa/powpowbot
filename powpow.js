/**
 * Telegram Bot to play a Text-based FPS
 * Developed by Rodrigo Araujo based on Guilherme Henrique Sehn's project
 * Original game by Eigen Lenk
 */
var fs = require('fs'),
    events = require('events'),
    telegramBotAPI = require('node-telegram-bot-api');

var powpowbot = new telegramBotAPI(process.env.POWPOWBOT_TOKEN, {
    polling: true
});

/**
 * Game settings
 */
var Settings = {
    gun_max_available_ammo: 8,
    gun_max_ammo: 24,
    renaming_interval_limit: 10,
    symbols: {
        N: '▲',
        S: '▼',
        E: '►',
        W: '◄',
        IH: '+',
        IA: '¶'
    }
}

/**
 * Server properties
 */
var Server = {
    map: null,
    respawn_places: [],
    page: null,
    started_at: null,
    events: new (events.EventEmitter),
    players: {},
    rooms: {},
}

/**
 * Utility functions
 */
var Util = {
    generate_id: function () {
        var random = Math.random().toString(36).substring(7),
            id = ''

        for (var i = 0, j = random.length; i < j; i++) {
            if ((Math.floor(Math.random() * 2) + 1) == 2)
                id += random[i].toUpperCase()
            else
                id += random[i]
        }

        return id + Util.current_timestamp()
    },

    player_name_exists: function (name) {
        var exists = false

        for (var sid in Server.players) {
            if (Server.players[sid].name == name) {
                exists = true
                break
            }
        }

        return exists
    },

    remove_inactive_players: function () {
        var remove = [],
            count = 0,
            now = Util.current_timestamp()

        for (var sid in Server.players) {
            if (Server.players.hasOwnProperty(sid) && Server.players[sid].updated + 60 * 5 < now) {
                remove.push(sid)
                ++count
            }
        }

        for (var i = 0; i < count; i++) {
            Server.players[remove[i]].quit()
            delete Server.players[remove[i]]
        }

        return count
    },

    current_timestamp: function () {
        return Math.floor(new Date().getTime() / 1000)
    },

    generate_hit_message: function (who, killed) {
        var msg

        if (killed)
            msg = who + ' killed you! Type \'respawn\' to back to the game'
        else
            msg = 'uh oh! ' + who + ' shot you!'

        return msg
    },

    /*
    generate_rename_message: function(old_name, new_name) {
        return old_name + ' changed his name to ' + new_name)
    },

    colorize: function(color, text) {
        return text
        //return '<span style="color:' + color + '">' + text + '</span>'
    }*/
}

/**
 * Player class
 */
function Player(telegram_user_id, telegram_user_name) {
    // Fixed session properties
    this.sid = telegram_user_id
    this.name = telegram_user_name
    this.room = null
    this.updated = Util.current_timestamp()
    //this.renamed_at = 0

    // Game properties
    this.x = null
    this.y = null
    this.direction = null
    this.health = null
    this.total_ammo = null
    this.available_ammo = null
    this.kills = 0
    this.killed = 0
}

Player.prototype.join_room = function (room_name) {
    this.room = null

    if (typeof (Server.rooms[room_name]) !== 'object') {
        this.room = Server.rooms[room_name] = new Room(room_name)
    } else {
        this.room = Server.rooms[room_name]

        if (Object.keys(this.room.players).length >= 5) {
            return false
        }
    }

    this.room.add_player(this)
    //return this.room.messages.length
    return true
}

/*
Player.prototype.rename = function(new_name) {
    var now = Util.current_timestamp()

    if (Util.player_name_exists(new_name)) {
        return [false, 'exists']
    } else if (now - this.renamed_at < Settings.renaming_interval_limit) {
        return [false, 'flood']
    }

    var old_name = this.name

    this.name = new_name
    this.renamed_at = now

    if (this.room !== null) {
        this.send_message({
            'text': Util.generate_rename_message(old_name, new_name),
            'sender': this.sid
        })
    }

    return [true, new_name]
}
*/

Player.prototype.touch = function () {
    this.updated = Util.current_timestamp()
}

Player.prototype.is_playing = function () {
    return this.room !== null
}

Player.prototype.fire = function () {
    var hit = this.visible_to_me(true),
        result = {
            killed: [],
            hit: []
        },
        ammo_power = 30

    if (this.available_ammo <= 0) {
        result.ammo = (this.total_ammo <= 0) ? 'out' : 'reload'
        return result
    }

    this.available_ammo--

    for (var i = 0, j = hit.length; i < j; i++ , ammo_power--) {
        this.room.players[hit[i].sid].health -= ammo_power

        var killed = false
        /*var msg_data = {
            receiver: hit[i].sid,
            text: null
        }*/

        if (this.room.players[hit[i].sid].health <= 0) {
            killed = true

            this.room.players[hit[i].sid].killed++
            this.room.players[hit[i].sid].x = null
            this.room.players[hit[i].sid].y = null

            this.kills++

            this.room.coordinates[hit[i].y][hit[i].x] = ['h', 'a'][Math.floor(Math.random() * 2)]

            result.killed.push(Server.players[hit[i].sid].name)
        } else {
            result.hit.push(Server.players[hit[i].sid].name)
        }

        //msg_data.text = Util.generate_hit_message(this.name, killed)
        // this.send_message(msg_data, hit[i].sid)
        powpowbot.sendMessage(hit[i].sid, Util.generate_hit_message(this.name, killed));
    }

    return result
}

Player.prototype.turn = function (direction) {
    direction = direction.toUpperCase()

    if (['N', 'S', 'E', 'W'].indexOf(direction) != -1) {
        this.direction = direction
        return true
    }

    return false
}

Player.prototype.turn_around = function () {
    var opposite = {
        N: 'S',
        S: 'N',
        E: 'W',
        W: 'E'
    }
    this.turn(opposite[this.direction])
}

Player.prototype.move = function (direction) {
    var success = true,
        x = this.x,
        y = this.y,
        old_x = this.x,
        old_y = this.y

    direction = direction.toUpperCase()

    switch (direction) {
        case 'N':
            y--;
            break;
        case 'S':
            y++;
            break;
        case 'E':
            x++;
            break;
        case 'W':
            x--;
            break;
        default:
            success = false;
    }

    if (success) {
        if (Server.map[y][x] != '#' && !this.room.has_item(x, y, true)) {
            var msg = ''

            if (this.room.coordinates[y][x] == 'h') {
                this.health += 10
                if (this.health > 100) this.health = 100
                msg = 'You\'ve picked a health pack'
            } else if (this.room.coordinates[y][x] == 'a') {
                this.total_ammo += Settings.gun_max_ammo
                msg = 'You\'ve found ammo'
            }

            this.room.coordinates[old_y][old_x] = null
            this.room.coordinates[y][x] = this
            this.x = x
            this.y = y

            return msg
        } else {
            return 'You can\'t go in that direction'
        }
    }

    return ''
}

Player.prototype.reload_gun = function (sid) {
    if (this.available_ammo <= 0 && this.total_ammo <= 0)
        return false

    if (this.available_ammo >= Settings.gun_max_available_ammo)
        return [this.available_ammo, this.total_ammo]

    var diff = Settings.gun_max_available_ammo - this.available_ammo

    if (diff > this.total_ammo)
        diff = this.total_ammo

    this.available_ammo += diff
    this.total_ammo -= diff

    return [this.available_ammo, this.total_ammo]
}

Player.prototype.respawn = function () {
    if (this.health > 0)
        return false

    var respawn_place = this.room.find_respawn_position()

    this.health = 100
    this.available_ammo = Settings.gun_max_available_ammo
    this.total_ammo = Settings.gun_max_ammo
    this.x = respawn_place.x
    this.y = respawn_place.y
    this.direction = respawn_place.direction

    this.room.coordinates[respawn_place.y][respawn_place.x] = this

    return true
}

Player.prototype.look_map = function () {
    var y_len = Server.map.length,
        x_len = Server.map[0].length,
        visible = this.visible_to_me(),
        txt = ''

    visible.push({
        'x': this.x,
        'y': this.y,
        'direction': this.direction,
        'me': true
    })

    txt += 'Players on this room: ' + Object.keys(this.room.players).length
    txt += '\n'

    txt += '<pre>'

    for (var y = 0; y < y_len; y++) {
        for (var x = 0; x < x_len; x++) {
            var found = false

            for (var i = 0, j = visible.length; i < j; i++) {
                if (x == visible[i].x && y == visible[i].y) {
                    if (visible[i].item) {
                        txt += /*'<span class="item">' + */Settings.symbols['I' + visible[i].item.toUpperCase()]
                    } else {
                        //txt += visible[i].me ? '<span class="me">' : '<span class="enemy">'
                        txt += Settings.symbols[visible[i].direction]
                    }

                    //txt += '</span>'

                    found = true
                    break
                }
            }

            if (!found)
                txt += (Server.map[y][x] == '#') ? '#' : ' '

            txt += ' '
        }

        txt += '\n'
    }

    txt += '</pre>'

    return txt
}

Player.prototype.visible_to_me = function (only_enemies) {
    var y_len = Server.map.length,
        x_len = Server.map[0].length,
        found = [],
        item = null,
        only_enemies = !!only_enemies

    if (this.direction == 'N') {
        for (var y = this.y - 1; y > 0 && Server.map[y][this.x] != '#'; --y)
            if (item = this.room.find_item(this.x, y, only_enemies)) found.push(item)
    } else if (this.direction == 'S') {
        for (var y = this.y + 1; y < y_len && Server.map[y][this.x] != '#'; ++y)
            if (item = this.room.find_item(this.x, y, only_enemies)) found.push(item)
    } else if (this.direction == 'E') {
        for (var x = this.x + 1; x < x_len && Server.map[this.y][x] != '#'; ++x)
            if (item = this.room.find_item(x, this.y, only_enemies)) found.push(item)
    } else if (this.direction == 'W') {
        for (var x = this.x - 1; x > 0 && Server.map[this.y][x] != '#'; --x) {
            if (item = this.room.find_item(x, this.y, only_enemies)) found.push(item)
        }
    }

    return found
}

/*
Player.prototype.send_message = function(data, receiver) {
    this.room.messages.push(data)

    if (typeof(receiver) === 'string') {
        Server.events.emit(receiver, data)
    } else {
        for (var sid in this.room.players) {
            if (this.room.players[sid] != this.sid)
                Server.events.emit(sid, data)
        }
    }
}
*/

Player.prototype.quit = function () {
    if (this.room !== null) {
        this.room.kick(this.sid)
    }
}

/**
 * Room class
 */
function Room(name) {
    this.name = name
    this.players = {}
    this.coordinates = []
    this.messages = []

    // Populate coordinates array
    var y_len = Server.map.length
    var x_len = Server.map[0].length

    for (var y = 0; y < y_len; y++) {
        this.coordinates[y] = []

        for (var x = 0; x < x_len; x++)
            this.coordinates[y][x] = null
    }
}

Room.prototype.add_player = function (player) {
    var respawn_place = this.find_respawn_position()

    player.x = respawn_place.x
    player.y = respawn_place.y
    player.direction = respawn_place.direction
    player.health = 100
    player.total_ammo = Settings.gun_max_ammo
    player.available_ammo = Settings.gun_max_available_ammo

    this.players[player.sid] = player
    this.coordinates[respawn_place.y][respawn_place.x] = player
}

Room.prototype.has_player = function (sid) {
    return typeof (this.players[sid]) !== 'undefined';
}

Room.prototype.kick = function (sid) {
    if (!this.has_player(sid)) {
        return false
    }

    if (this.players[sid].x !== null && this.players[sid].y !== null) {
        this.coordinates[this.players[sid].y][this.players[sid].x] = null
    }

    this.players[sid].room = null
    this.players[sid].direction = null
    this.players[sid].health = null
    this.players[sid].total_ammo = null
    this.players[sid].available_ammo = null
    this.players[sid].kills = 0
    this.players[sid].killed = 0

    delete this.players[sid]
}

Room.prototype.has_item = function (x, y, only_enemies) {
    var cond = typeof (this.coordinates[y][x]) !== 'undefined' && this.coordinates[y][x] !== null

    if (only_enemies)
        cond = cond && this.coordinates[y][x].constructor.name == 'Player'

    return cond
}

Room.prototype.find_item = function (x, y, only_enemies) {
    only_enemies = !!only_enemies

    if (this.has_item(x, y, only_enemies)) {
        if (this.coordinates[y][x].constructor.name == 'Player') {
            return {
                'sid': this.coordinates[y][x].sid,
                'x': x,
                'y': y,
                'direction': this.coordinates[y][x].direction,
                'me': false,
                'item': false
            }
        } else if (!only_enemies) {
            return {
                'x': x,
                'y': y,
                'me': false,
                'item': this.coordinates[y][x]
            }
        }
    }

    return null
}

Room.prototype.score = function () {
    var players_array = [],
        players_count = 0,
        larger_name_length = 0,
        text = ''

    for (var sid in this.players) {
        var length = this.players[sid].name.length

        if (length > larger_name_length)
            larger_name_length = length

        players_array.push({
            'name': this.players[sid].name,
            'data': this.players[sid]
        })
        ++players_count
    }

    players_array.sort(function (a, b) {
        return (b.data.kills - a.data.kills) + (a.data.killed - b.data.killed)
    })

    text += '<pre>'

    text += '+-----'

    var expand = larger_name_length - 3

    if (expand <= 0)
        expand = 1

    for (var i = 0; i < expand; i++) text += '-'
    text += '+-------+--------+\n'
    text += '| Name'
    for (var i = 0; i < expand; i++) text += ' '
    text += '| Score | Deaths |\n+-----'
    for (var i = 0; i < expand; i++) text += '-'
    text += '+-------+--------+\n'

    for (var i = 0; i < players_count; i++) {
        text += '| ' + players_array[i].name
        for (var j = 0, k = 4 + expand - players_array[i].name.length; j < k; j++) text += ' '
        text += '| ' + players_array[i].data.kills
        for (var j = 0, k = 6 - players_array[i].data.kills.toString().length; j < k; j++) text += ' '
        text += '| ' + players_array[i].data.killed
        for (var j = 0, k = 7 - players_array[i].data.killed.toString().length; j < k; j++) text += ' '
        text += '|\n'
    }

    text += '+-----'
    for (var i = 0; i < expand; i++) text += '-'
    text += '+-------+--------+\n'

    text += '</pre>'

    return text
}

Room.prototype.find_respawn_position = function () {
    var count = Server.respawn_places.length,
        index = Math.floor(Math.random() * count)

    for (var i = index; i < count; i++) {
        var place = Server.respawn_places[i]

        if (this.is_safe_place(place.x, place.y))
            return place
    }

    for (var i = 0; i < index; i++) {
        var place = Server.respawn_places[i]

        if (this.is_safe_place(place.x, place.y))
            return place
    }

    return place
}

Room.prototype.is_safe_place = function (x, y) {
    var y_len = Server.map.length,
        x_len = Server.map[0].length

    // North
    for (var _y = y; _y > 0; _y--) {
        if (Server.map[_y][x] == '#') break
        if (this.has_item(x, _y, true)) return false
    }

    // South
    for (var _y = y + 1; _y < y_len; _y++) {
        if (Server.map[_y][x] == '#') break
        if (this.has_item(x, _y, true)) return false
    }

    // East
    for (var _x = x + 1; _x < x_len; _x++) {
        if (Server.map[y][_x] == '#') break
        if (this.has_item(_x, y, true)) return false
    }

    // West
    for (var _x = x - 1; _x > 0; _x--) {
        if (Server.map[y][_x] == '#') break
        if (this.has_item(_x, y, true)) return false
    }

    return true
}

powpowbot.on('message', function (msg) {
    var cmd = msg.text.toLowerCase(),
        user_id = msg.from.id,
        user_first_name = msg.from.first_name,
        player,
        match;

    if (typeof Server.players[user_id] == "undefined") {
        player = new Player(user_id, user_first_name)
        Server.players[user_id] = player
    } else {
        player = Server.players[user_id]
        player.touch()
    }

    if (cmd.match(/^\/(start|help)$/)) {
        var instructions = "* /room - Choose the room \n"
        instructions += "* /quit - Quit the room \n"
        instructions += "* look - Show the room map and the enemies on your front \n"
        instructions += "* move north/south/west/east - Move to another place \n"
        instructions += "* turn north/south/west/east/around - Turn to another direction so you can view and fire your enemies  \n"
        instructions += "* fire - Fire (o rly?) \n"
        instructions += "* ammo - Show how much ammo you have \n"
        instructions += "* health - Show how health you have \n"
        instructions += "* reload - Reload your gun \n"
        instructions += "* score - Show score table \n"
        instructions += "* respawn - Respawn if you are dead \n\n"
        instructions += "Please choose a room by typing '/room <room name>' (e.g.: /room mygrouproom) to start playing!"

        powpowbot.sendMessage(user_id, instructions)

        return
    }

    if (match = cmd.match(/^\/room (.*)$/)) {
        var room_name = match[1];

        if (room_name.length > 0 && room_name.length < 40) {
            var enter = player.join_room(room_name)

            if (enter !== false) {
                powpowbot.sendMessage(user_id, 'You are now in the game. Use the commands to play. :-)')
            } else {
                powpowbot.sendMessage(user_id, 'This room is full.\nType another room name')
            }
        } else {
            powpowbot.sendMessage(user_id, 'Type the room name again, the one that you tried is invalid. :(')
        }

        return
    }

    if (cmd == 'exit' || cmd == '/quit') {
        player.quit()
        powpowbot.sendMessage(user_id, 'You\'re now out of the room.\nType the name of the room you want to enter')
        return
    }

    if (player.room == null) {
        powpowbot.sendMessage(user_id, 'Right now you\'re not in any room.\nType \'/room <room name>\' (e.g.: /room mygrouproom) to start playing!')
        return
    }

    // Commands that the player can use even if it's dead
    /*if (cmd.match(/^rename .{1,39}$/)) {
        var change = player.rename(cmd.trim().split(' ').slice(1).join(' '))

        if (change[0]) {
            powpowbot.sendMessage(user_id, 'Name changed to ' + change[1])
        } else {
            powpowbot.sendMessage(user_id, change[1] == 'flood' ? Util.colorize('red', 'Don\'t spam me, bro!') : 'There is another user with that name currently playing')
        }

        return
    }*/

    if (cmd == 'respawn') {
        powpowbot.sendMessage(user_id, player.respawn() ? 'Ok, you\'re back in the game' : 'You are already alive')
        return
    }

    if (cmd == 'score') {
        powpowbot.sendMessage(user_id, player.room.score(), {
            parse_mode: 'HTML'
        })
        return
    }

    // Check if the player is dead
    if (player.health <= 0) {
        powpowbot.sendMessage(user_id, 'You are dead. Type \'respawn\' to back to the game.')
        return
    }

    // Commands that the player only can use if it's alive
    if (cmd == 'ammo') {
        powpowbot.sendMessage(user_id, 'Ammo: ' + player.available_ammo + '/' + player.total_ammo)
        return
    }

    if (cmd == 'health') {
        powpowbot.sendMessage(user_id, 'Health: ' + player.health + '%')
        return
    }

    if (cmd == 'reload') {
        var info = player.reload_gun()

        if (typeof (info) === 'object') {
            powpowbot.sendMessage(user_id, 'You\'ve reloaded. Ammo: ' + info[0] + '/' + info[1])
        } else {
            powpowbot.sendMessage(user_id, 'You\'re out of ammo')
        }

        return
    }

    if (cmd == 'fire') {
        var info = player.fire()

        if (info.ammo) {
            powpowbot.sendMessage(user_id, info.ammo == 'reload' ? 'Reload your gun by typing \'reload\'' : 'You\'re out of ammo')
        } else {
            if (!info.hit.length && !info.killed.length) {
                powpowbot.sendMessage(user_id, 'You\'ve shot the wall')
            } else {
                var msg = 'You\'ve'

                if (info.hit.length) {
                    msg += ' hit ' + info.hit.join(', ')
                    if (info.killed.length) msg += ' and'
                }

                if (info.killed.length)
                    msg += ' killed ' + info.killed.join(',')

                powpowbot.sendMessage(user_id, msg)
            }
        }

        return
    }

    if (cmd.match(/^turn (north|south|east|west)$/)) {
        player.turn(cmd.split(' ')[1][0])
        powpowbot.sendMessage(user_id, player.look_map(), {
            parse_mode: 'HTML'
        })
        return
    }

    if (cmd == 'turn around') {
        player.turn_around()
        powpowbot.sendMessage(user_id, player.look_map(), {
            parse_mode: 'HTML'
        })
        return
    }

    if (cmd.match(/^move (north|south|east|west)$/)) {
        var direction = cmd.split(' ')[1][0]
        player.move(direction)
        player.turn(direction)
        powpowbot.sendMessage(user_id, player.look_map(), {
            parse_mode: 'HTML'
        })
        return
    }

    if (cmd == 'look') {
        powpowbot.sendMessage(user_id, player.look_map(), {
            parse_mode: 'HTML'
        })
        return
    }

    if (cmd == 'easter egg') {
        powpowbot.sendMessage(user_id, ' ,--^----------,--------,-----,-------^--,\n | |||||||||   `--------\'     |          O\n `+---------------------------^----------|\n   `\_,-------, _________________________|\n     / XXXXXX /`|     /\n    / XXXXXX /  `\   /\n   / XXXXXX /\______(\n  / XXXXXX /\n / XXXXXX /\n(________(\n `------\'')
    }

    powpowbot.sendMessage(user_id, cmd == '' ? 'You\'re in the game! Use the commands to play.' : 'Unknown action')
});

// Transfer text-based map to array
Server.map = fs.readFileSync('map.txt').toString().trim().split('\n')
Server.respawn_places = []

for (var y = 0; y < Server.map.length; y++) {
    Server.map[y] = Server.map[y].trim().split('')

    for (var x = 0; x < Server.map[y].length; x++) {
        if (Server.map[y][x] != '#' && Server.map[y][x] != ' ') {
            Server.respawn_places.push({
                'x': x,
                'y': y,
                'direction': Server.map[y][x]
            })
        }
    }
}
setInterval(Util.remove_inactive_players, 60 * 1000)
Server.started_at = Util.current_timestamp()