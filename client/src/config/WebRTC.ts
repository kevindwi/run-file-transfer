import { io } from "socket.io-client";

const socket = io("ws://192.168.1.5:3001");
let peerConnection: RTCPeerConnection;
let dataChannel: RTCDataChannel;

// Peer connection
export const createPeerConnection = () => {
  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate); // signaling
    }
  };

  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel(dataChannel);
  };
};

const setupDataChannel = (channel: RTCDataChannel) => {
  dataChannel = channel;

  dataChannel.onopen = () => {
    console.log("Data channel open.");
  };

  dataChannel.onmessage = (event) => {
    console.log("Received: ", event.data);
  };
};
