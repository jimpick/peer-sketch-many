const { Machine } = require('xstate')
const { interpret } = require('xstate/lib/interpreter')

const PeerBase = require('peer-base')
const IPFSRepo = require('ipfs-repo')
const { MemoryDatastore } = require('interface-datastore')
const delay = require('delay')

require('events').EventEmitter.prototype._maxListeners = 100

let app
let collaboration

const port = process.env['RENDEZVOUS_PORT']

const peerMachine = Machine({
  id: 'peerBase',
  initial: 'new',
  states: {
    new: {
      onEntry: () => {
        app = PeerBase('xstate-demo', {
          ipfs: {
            repo: new IPFSRepo('ipfs', {
              lock: 'memory',
              storageBackends: {
                root: MemoryDatastore,
                blocks: MemoryDatastore,
                keys: MemoryDatastore,
                datastore: MemoryDatastore
              }
            }),
            swarm: [`/ip4/0.0.0.0/tcp/${port}/ws/p2p-websocket-star`]
          }
        })
      },
      on: {
        // NEXT: 'starting'
        '': 'starting'
      }
    },
    starting: {
      invoke: {
        id: 'startPeerBase',
        src: () => app.start(),
        onDone: 'started',
        onError: 'failed'
      },
    },
    started: {
      on: {
        // NEXT: 'create collaboration'
        '': 'create collaboration'
      }
    },
    'create collaboration': {
      invoke: {
        id: 'startPeerBase',
        src: async () => {
          collaboration = await app.collaborate('collab1', 'rga')
          collaboration.on('state changed', () => {
            process.send({
              crdtValue: collaboration.shared.value().join('')
            })
          })
        },
        onDone: 'collaboration created',
        onError: 'failed'
      }
    },
    'collaboration created': {
      on: {
        NEXT: 'type some stuff'
      }
    },
    'type some stuff': {
      invoke: {
        id: 'typeSomeStuff',
        src: async () => {
          collaboration.shared.push(process.env['PEER_LABEL'])
          await delay(1000)
        },
        onDone: 'done',
        onError: 'failed'
      }
    },
    done: {
      type: 'final'
    },
    failed: {
      type: 'final'
    }
  }
})

const service = interpret(peerMachine)
  .onTransition(nextState => {
    process.send({
      stateMachine: nextState.value
    })
  })
service.start()

process.on('message', message => service.send(message))
