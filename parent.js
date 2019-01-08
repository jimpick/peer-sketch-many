require('events').EventEmitter.prototype._maxListeners = 100

const { fork, spawn } = require('child_process')
const diffy = require('diffy')
const trim = require('diffy/trim')
const diffyInput = require('diffy/input')

const { Machine, actions } = require('xstate')
const { interpret } = require('xstate/lib/interpreter')
const { assign } = actions

const getPort = require('get-port')

const numPeers = 26
const peers = []

const peerStates = {}

const aCharCode = 'a'.charCodeAt(0) // 97
for (let i = 0; i < numPeers; i++) {
  const peerLabel = String.fromCharCode(aCharCode + i)
  const peerLabelUpper = peerLabel.toUpperCase()
  const prevPeerLabel = String.fromCharCode(aCharCode + i - 1)
  const prevPeerLabelUpper = prevPeerLabel.toUpperCase()
  const lastPeerLabel = String.fromCharCode(aCharCode + numPeers - 1)
  const lastPeerLabelUpper = lastPeerLabel.toUpperCase()
  const waitingState = (i !== numPeers - 1)
    ? 'waiting for last'
    : 'last peer ready'
  peerStates[`peer${peerLabelUpper}`] = {
    initial: 'not started',
    states: {
      'not started': {
        on: {
          NEXT: {
            target: 'starting',
            cond: ctx => !i || ctx[`ready${prevPeerLabelUpper}`]
          }
        }  
      },
      starting: {
        onEntry: () => { peers[i] = startPeer(peerLabel) },
        on: {
          NEXT: { actions: () => { peers[i].send('NEXT') } },
          [`PEER ${peerLabelUpper}:COLLABORATION CREATED`]: waitingState
        }
      },
      'waiting for last': {
        onEntry: assign({[`ready${peerLabelUpper}`]: true}),
        on: {
          [`PEER ${lastPeerLabelUpper}:COLLABORATION CREATED`]: 'paused'
        }
      },
      'last peer ready': {
        onEntry: assign({[`ready${peerLabelUpper}`]: true}),
        on: {
          '': 'paused'
        }
      },
      paused: {
        on: {
          NEXT: {
            target: 'editing',
            cond: ctx => !i || ctx[`edited${prevPeerLabelUpper}`]
          }
        }
      },
      editing: {
        onEntry: () => { peers[i].send('NEXT') },
        on: {
          [`PEER ${peerLabelUpper}:DONE`]: 'done'
        }
      },
      done: {
        onEntry: assign({[`edited${peerLabelUpper}`]: true}),
        type: 'final'
      }
    }
  }
}

const machine = Machine({
  id: 'top',
  initial: 'initial',
  context: {},
  states: {
    initial: {
      on: {
        NEXT: 'starting rendezvous'
      }
    },
    'starting rendezvous': {
      invoke: {
        id: 'startRendezvous',
        src: startRendezvous,
        onDone: 'rendezvous started',
        onError: 'failed'
      }
    },
    'rendezvous started': {
      on: {
        NEXT: 'peers'
      }
    },
    'peers': {
      id: 'peers',
      type: 'parallel',
      states: peerStates
    },
    done: {
      type: 'final'
    },
    failed: {
      type: 'final'
    }
  }
})

let state = ''
const log = []
const uiPeerStates = {}
for (let i = 0; i < numPeers; i++) {
  const peerLabel = String.fromCharCode(aCharCode + i)
  uiPeerStates[peerLabel] = { step: '', crdtValue: '' }
}

const d = diffy({fullscreen: true})

d.render(
  () => {
    let text = `State: ${state.slice(0, d.width - 8)}\n\n`

    for (let i = 0; i < numPeers; i++) {
      const peerLabel = String.fromCharCode(aCharCode + i)
      const peerLabelUpper = peerLabel.toUpperCase()
      text += `  ${peerLabelUpper}: ` +
        `Step: ${uiPeerStates[peerLabel].step.slice(0, 22).padEnd(22)}  ` +
        `Value: ${uiPeerStates[peerLabel].crdtValue}\n`
    }

    text += `\nLogs:\n` + log.slice(-(d.height - 5 - numPeers)).join('\n')
    return text
  }
)

const input = diffyInput({showCursor: false})

const service = interpret(machine)
  .onTransition(nextState => {
    state = JSON.stringify(nextState.value)
    d.render()
  })
service.start()

input.on('keypress', (ch, key) => {
  switch (key.sequence) {
    case ' ':
      service.send('NEXT')
      break
    case 'q':
      process.exit(0)
      break
  }
})

async function startRendezvous () {
  const port = await getPort()
  log.push(`RV: Starting rendezvous server on port ${port}`)
  process.env['RENDEZVOUS_PORT'] = port
  const child = spawn('npx', ['rendezvous', '-p', `${port}`])
  child.stdout.on('data', appendToLog)
  child.stderr.on('data', appendToLog)
  process.on('exit', () => child.kill())

  function appendToLog (chunk) {
    log.push(`RV: ` + chunk.toString().replace(/\s+$/, ''))
    d.render()
  }
}

function startPeer (peerLabel) {
  const peerLabelUpper = peerLabel.toUpperCase()
  const child = fork(`${__dirname}/child.js`, {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, PEER_LABEL: peerLabel }
  })

  child.on('message', message => {
    if (message.stateMachine) {
      uiPeerStates[peerLabel].step = message.stateMachine
      service.send(
        `PEER ${peerLabelUpper}:` +
        `${message.stateMachine.toUpperCase()}`
      )
    }
    if (message.crdtValue) {
      uiPeerStates[peerLabel].crdtValue = message.crdtValue
    }
    d.render()
  })

  function appendToLog (chunk) {
    log.push(`${peerLabelUpper}: ` + chunk.toString().replace(/\s+$/, ''))
    d.render()
  }
  child.stdout.on('data', appendToLog)
  child.stderr.on('data', appendToLog)

  process.on('exit', () => child.kill())
  return child
}

function appendToLog (msg) {
  log.push(msg)
  d.render()
}
