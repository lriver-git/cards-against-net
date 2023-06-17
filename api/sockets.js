const decks = require('./model/decks')

module.exports = function (socket, io, db) {
  function handleMessage (key, listener) {
    socket.on(key, async (data) => {
      try {
        await listener(data)
      } catch (err) {
        const msg = `error on "${key}" listener: ${err.message}`
        console.error(`[sockets.js] ${msg}`)
        io.to(socket.id).emit('error', msg)
      }
    })
  }

  handleMessage('game:new', async (data) => {
    const game = await db.createGame(data)
    io.to(socket.id).emit('game:new', game)
  })

  // handleMessage('game:edit', ({ id, ...data }) => {
  //   const room = `game-${id}`
  //   const game = db.getGame(id).edit(data)
  //   io.to(room).emit('game:edit', game)
  // })

  handleMessage('game:join', async ({ gameId, name, playerId }) => {
    const room = `game-${gameId}`
    socket.join(room)
    const game = (await db.getGame(gameId)).addPlayer({ id: playerId, name })
    io.to(room).emit('game:edit', game)
  })

  handleMessage('game:leave', async ({ gameId, playerId }) => {
    const room = `game-${gameId}`
    const game = (await db.getGame(gameId)).removePlayer(playerId)
    io.to(room).emit('game:edit', game)
    io.to(room).emit('game:kick', playerId)
    if (game.players.length === 0) {
      await db.removeGame(game)
    }
  })

  handleMessage('game:start', async (gameId) => {
    const room = `game-${gameId}`
    const game = (await db.getGame(gameId)).start()
    io.to(room).emit('game:edit', game)
  })

  handleMessage('game:play-white-cards', async ({ gameId, cards, playerId }) => {
    const room = `game-${gameId}`
    const game = (await db.getGame(gameId)).playWhiteCards(cards, playerId)
    io.to(room).emit('game:edit', game)
    io.to(room).emit('game:cards-played', cards)
  })

  handleMessage('game:discard-white-card', async ({ gameId, cards, playerId }) => {
    const room = `game-${gameId}`
    const game = (await db.getGame(gameId)).discardWhiteCard(cards, playerId)
    io.to(room).emit('game:edit', game)
  })

  handleMessage('game:reveal-card', async ({ gameId, playerId }) => {
    const room = `game-${gameId}`
    const game = (await db.getGame(gameId)).revealCard(playerId)
    io.to(room).emit('game:edit', game)
  })

  handleMessage('game:finish-round', async ({ gameId, winnerPlayerId }) => {
    const room = `game-${gameId}`
    const game = await db.getGame(gameId)
    io.to(room).emit('game:edit', game.finishRound(winnerPlayerId))
    setTimeout(() => {
      io.to(room).emit('game:round-winner', game.getLastFinishedRound())
    }, 500)
  })

  handleMessage('deck:request', (id) => {
    const deck = decks.get(id)
    io.to(socket.id).emit('deck:response', deck && deck.data)
  })

  handleMessage('deck:saved', (id) => {
    const deck = decks.get(id)
    if (deck) {
      io.to(deck.host).emit('deck:saved')
    }
  })

  handleMessage('deck:share', (deck) => {
    decks.set(deck.id, { host: socket.id, data: deck })
  })

  handleMessage('deck:unshare', (id) => {
    decks.delete(id)
  })
}
