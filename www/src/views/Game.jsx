import React, { Fragment, useEffect, useRef, useState } from 'react'
import { editGame, useGame } from '@/lib/gameUtils'
import { useSocket } from '@/lib/SocketProvider'
import { useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import GameMessage from '@/components/GameMessage'
import GameCard from '@/components/GameCard'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import PrimaryButton from '@/components/PrimaryButton'
import Button from '@/components/Button'
import { Dialog, Transition } from '@headlessui/react'

function getLastFinishedRound(game) {
  const round = game.finishedRounds[game.finishedRounds.length - 1]
  if (!round) {
    return null
  }

  const winner = game.players.find((p) => p.id === round.winner)
  return { ...round, winner }
}

export default function Game() {
  const navigate = useNavigate()
  const cache = useQueryClient()
  const socket = useSocket()
  const playerId = socket?.id
  const { id } = useParams()
  const { game, loading, error } = useGame(id)
  const playerData = game?.players.find((p) => p.id === playerId)
  const cardsToPick = game?.round.blackCard?.pick || 1
  const playerIsHost = playerId === game?.round.host
  const roundPlayed = game?.round.whiteCards.some((c) => c.player === playerId)
  const playersReady = game?.players.filter((p) => game.round.whiteCards.some((c) => c.player === p.id)).length
  const allCardsSent = playersReady === game?.players.length - 1
  const showHand = !playerIsHost && !roundPlayed
  const showCardCounter = !allCardsSent && (playerIsHost || roundPlayed)
  const cardCounterText = `${playersReady} / ${game?.players.length - 1}`
  const counterAnimation = useAnimation()
  const [winner, setWinner] = useState(null)
  const [showRoundModal, setShowRoundModal] = useState(false)

  useEffect(() => {
    if (socket && game) {
      socket.on('game:edit', (game) => editGame(cache, game))
      socket.on('game:cards-played', () => {
        counterAnimation.start({ x: [300, 0] })
      })
      socket.on('game:round-winner', () => {
        setShowRoundModal(true)
      })
      if (!playerData) {
        // TODO: 1. save name in local storage and use as second argument for prompt in other plays
        // TODO: 2. replace window.prompt with custom modal
        const name = window.prompt('Introduce un nombre de usuario')
        socket.emit('game:join', { gameId: game.id, name })
      }
    }

    return () => {
      if (socket) {
        socket.off('game:edit')
      }
    }
  })

  function playCards(cards) {
    socket.emit('game:play-white-cards', {
      gameId: game.id,
      cards
    })
  }

  function onRoundWhiteCardClick(card) {
    if (!playerIsHost) {
      return
    }

    if (card.hidden) {
      socket.emit('game:reveal-card', {
        gameId: game.id,
        playerId: card.player
      })
    } else {
      setWinner(card.player)
    }
  }

  function discardWhiteCards(card) {
    socket.emit('game:discard-white-card', {
      gameId: game.id,
      card
    })
  }

  function finishRound() {
    socket.emit('game:finish-round', {
      gameId: game.id,
      winnerPlayerId: winner
    })
    setWinner(null)
  }

  function closeModal() {
    setShowRoundModal(false)
  }

  function closeGameOverModal() {
    socket.emit('game:leave', game.id)
    navigate('/')
  }

  if (!socket || !game) {
    return <GameMessage error={error} loading={loading} />
  }

  return (
    <main className="px-4 pb-8">
      {playerData && (
        <PlayerData playerData={playerData} playerIsHost={playerIsHost} roundNum={game.finishedRounds.length + 1} />
      )}
      <GameOverModal closeModal={closeGameOverModal} game={game} />
      <RoundModal closeModal={closeModal} show={showRoundModal && !game.finished} game={game} />
      <Round
        playerIsHost={playerIsHost}
        cardCounterText={cardCounterText}
        showCardCounter={showCardCounter}
        counterAnimation={counterAnimation}
        winner={winner}
        allCardsSent={allCardsSent}
        round={game.round}
        onCardClick={onRoundWhiteCardClick}
        onWinnerSelect={finishRound}
      />
      {showHand ? (
        <CardPicker
          cardsToPick={cardsToPick}
          cards={playerData?.cards}
          onCardsPicked={playCards}
          onDiscard={discardWhiteCards}
        />
      ) : (
        <p className="text-center">
          {allCardsSent
            ? '... Esperando a que el juez elija la carta ganadora'
            : '... Esperando a que los jugadores envíen sus cartas'}
        </p>
      )}
    </main>
  )
}

// partly taken from https://headlessui.dev/react/dialog
function Modal({ show, title, children, onClose }) {
  const closeRef = useRef()

  useEffect(() => {
    if (closeRef.current) {
      closeRef.current.focus()
    }
  }, [])

  return (
    <Transition appear show={show} as={Fragment}>
      <Dialog as="div" initialFocus={closeRef} className="fixed inset-0 z-10 overflow-y-auto" onClose={onClose}>
        <div className="min-h-screen px-4 text-center">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100">
            <Dialog.Overlay className="fixed inset-0" />
          </Transition.Child>
          {/* This element is to trick the browser into centering the modal contents. */}
          <span className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </span>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
          >
            <div
              style={{ minWidth: 300 }}
              className="inline-block max-w-screen-xl p-4 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl"
            >
              <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                {title}
              </Dialog.Title>
              {children}
              <Button ref={closeRef} onClick={onClose} className="mt-4 block ml-auto">
                Cerrar
              </Button>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}

function GameOverModal({ closeModal, game }) {
  // TODO: include a gallery of rounds here using finishedRounds data
  const players = game.players.slice().sort((a, b) => b.points - a.points)
  return (
    <Modal show={game.finished} onClose={closeModal} title="Fin de la partida">
      <ul className="pt-4">
        {players.map((p) => (
          <li className="text-gray-700" key={p.id}>
            <strong className="font-bold">{p.name}:</strong> {p.points} puntos
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function RoundModal({ closeModal, show, game }) {
  const round = getLastFinishedRound(game)
  const title = `Ganador de la ronda: ${round?.winner?.name}`
  const whiteCards = round ? round.whiteCards : []
  const blackCard = round ? round.blackCard : { text: '' }
  return (
    <Modal show={show} onClose={closeModal} title={title}>
      <div className="py-6 flex flex-wrap items-center justify-center content-center">
        <GameCard className="m-2 ml-0" type="black" text={decodeHtml(blackCard.text)} badge={blackCard.pick} />
        {whiteCards.map((c) => (
          <GameCard className="shadow-lg m-2" text={decodeHtml(c.card)} type="white" key={c.card} />
        ))}
      </div>
    </Modal>
  )
}

function PlayerData({ playerData, playerIsHost, roundNum }) {
  return (
    <div className="pt-2 flex items-start justify-between">
      <div>
        <p>
          <span className="font-bold text-lg">{playerData && playerData.name} </span>
          <span className="font-medium bg-gray-900 px-2 ml-2 py-1 rounded-full">{playerData && playerData.points}</span>
        </p>
        <p className="text-sm mt-2">{playerIsHost ? 'Juez de las cartas' : 'Jugador'}</p>
      </div>
      <p className="text-lg font-bold">Ronda {roundNum}</p>
    </div>
  )
}

function decodeHtml(html) {
  var el = document.createElement('textarea')
  el.innerHTML = html
  return el.value
}

function groupCardsByPlayer(cards) {
  const players = {}
  for (const card of cards) {
    players[card.player] = players[card.player] || { player: card.player, cards: [] }
    players[card.player].cards.push(card)
  }
  return Object.values(players)
}

function Round({
  playerIsHost,
  cardCounterText,
  showCardCounter,
  counterAnimation,
  winner,
  allCardsSent,
  round,
  onCardClick,
  onWinnerSelect
}) {
  function getGroupClassName(group) {
    const selectedStyles = group.player === winner ? 'ring-4 ring-blue-500 ring-inset' : ''
    return `${selectedStyles} bg-gray-900 bg-opacity-20 rounded-xl m-1 flex flex-wrap flex-shrink-0 text-left items-center justify-center`
  }

  const cardCounter = showCardCounter && (
    <GameCard
      as={motion.div}
      animate={counterAnimation}
      type="white"
      className="justify-center items-center text-center m-2"
      text={
        <>
          <p className="text-4xl font-bold mb-2">{cardCounterText}</p>
          <p>cartas enviadas</p>
        </>
      }
    />
  )

  return (
    <div
      className="py-6 flex flex-col items-center justify-center content-center"
      style={{ minHeight: 'calc(100vh - 320px)' }}
    >
      {winner && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <PrimaryButton onClick={onWinnerSelect} className="my-2">
            Marcar como ganador
          </PrimaryButton>
        </motion.div>
      )}
      <div className="py-4 flex flex-wrap items-center justify-center">
        <GameCard className="m-2" type="black" text={decodeHtml(round.blackCard.text)} badge={round.blackCard.pick} />
        {cardCounter}
        <ul className="flex flex-wrap justify-center">
          {allCardsSent &&
            groupCardsByPlayer(round.whiteCards).map((group) => (
              <div key={group.player} className={getGroupClassName(group)}>
                {group.cards.map((c, i) =>
                  playerIsHost ? (
                    <GameCard
                      text={c.hidden ? '¿?' : decodeHtml(c.card)}
                      className="m-2 text-left focus:outline-none"
                      type="white"
                      key={i}
                      as={motion.button}
                      whileHover={{ scale: 1.05 }}
                      onClick={() => onCardClick(c)}
                    />
                  ) : (
                    <GameCard
                      text={c.hidden ? '¿?' : decodeHtml(c.card)}
                      className="m-2 text-left"
                      type="white"
                      key={i}
                    />
                  )
                )}
              </div>
            ))}
        </ul>
      </div>
    </div>
  )
}

function CardPicker({ cardsToPick, cards = [], onCardsPicked, onDiscard }) {
  const [selected, setSelected] = useState([])
  const selectCardMessage = cardsToPick === 1 ? 'Elije una carta' : `Elije ${cardsToPick} cartas`
  const readyToSend = selected.length >= cardsToPick

  function selectCard(card) {
    if (cardIsSelected(card)) {
      setSelected(selected.filter((c) => c !== card))
    } else {
      setSelected(selected.concat(card).slice(-cardsToPick))
    }
  }

  function cardIsSelected(card) {
    return selected.indexOf(card) !== -1
  }

  function getCardClassName(card) {
    const selectedStyles = cardIsSelected(card) ? 'ring-4 ring-blue-500 ring-inset' : ''
    return `mt-2 flex-shrink-0 text-left focus:outline-none ${selectedStyles}`
  }

  function sendCards() {
    onCardsPicked(selected)
    setSelected([])
  }

  function discard() {
    onDiscard(selected[0])
    setSelected([])
  }

  return (
    <div className="fixed w-full -bottom-2 left-0 overflow-x-auto">
      <div className="mx-auto px-5 md:px-8 max-w-6xl mb-1">
        {readyToSend && (
          <motion.div className="mb-2" animate={{ opacity: 1 }} initial={{ opacity: 0 }}>
            <PrimaryButton onClick={sendCards}>
              {cardsToPick === 1 ? 'Elegir esta carta' : 'Elegir estas cartas'}
            </PrimaryButton>
            {selected.length === 1 && (
              <Button onClick={discard} className="ml-2">
                Descartar
              </Button>
            )}
          </motion.div>
        )}
        <p className="font-medium text-xl">
          <span>Cartas en tu mano</span>
          <small className="text-gray-100 text-base"> · {selectCardMessage}</small>
        </p>
      </div>
      <div className="flex md:justify-center items-start space-x-4 px-4">
        <AnimatePresence>
          {cards.map((card) => (
            <GameCard
              key={card}
              type="white"
              text={decodeHtml(card)}
              className={getCardClassName(card)}
              as={motion.button}
              onClick={() => selectCard(card)}
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -200, opacity: 0 }}
              whileHover={{ y: -20 }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}