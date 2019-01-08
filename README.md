# peer-sketch-many

Scenario with 26 peers in a rga collaboration.

# Usage

```
npm start 2> /dev/null
```

# Demo

![Demo](https://gateway.ipfs.io/ipfs/QmZ3Reny3pV9FvESSVa5Bh97aemFmoUMgWQYYpvkEWYRAZ/peer-base-26-peers.gif)

The mini-screencast above shows a simulation with the following steps:

1. starts a [libp2p peer-star rendezvous server](https://github.com/libp2p/js-libp2p-websocket-star-rendezvous) on an unused port
2. starts 26 subprocesses, "Peer A" to "Peer Z", each of which creates a peer-base collaboration (using a replicatable grow array,
   as used in [PeerPad](https://peerpad.net/) 
3. "Peer A" types "a"
4. "Peer B" types "b" 
5. and so on...
6. "Peer Z" types "z"

# License

MIT
