import { Socket } from "socket.io-client";

let peerConnection: RTCPeerConnection;
export let dataChannel: RTCDataChannel;
let remoteDescriptionSet = false;
let pendingCandidates: RTCIceCandidateInit[] = [];

export const isPeerConnectionExists = () => !!peerConnection;

/**
 * Membuat P2P Connection
 *
 * @param socket Socket.io connection
 * @param roomId
 * @param isInitiator is this the initiator or not
 * @param onMessage handle message
 */
export const createPeerConnection = async (
  socket: Socket,
  roomId: string,
  isInitiator: boolean,
  onMessage: (data: string) => void,
) => {
  // agar tidak ada koneksi yang double
  if (peerConnection && peerConnection.connectionState !== "closed") {
    console.log("PeerConnection already exists, closing old one");
    peerConnection.close();
  }

  console.log(
    `Creating PeerConnection - Role: ${isInitiator ? "INITIATOR" : "RECEIVER"}`,
  );

  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  if (roomId === "") {
    console.error("roomId cannot be empty");
    return;
  }

  // Reset state
  remoteDescriptionSet = false;
  pendingCandidates = [];

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate");
      socket.emit("ice-candidate", {
        roomId,
        candidate: event.candidate,
      });
    } else {
      console.log("ICE gathering complete");
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE connection state:", peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === "failed") {
      console.error("ICE connection failed, attempting restart");
      peerConnection.restartIce();
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("Peer connection state:", peerConnection.connectionState);
    if (peerConnection.connectionState === "connected") {
      console.log("P2P Connection established successfully!");
    }
  };

  if (isInitiator) {
    console.log("Creating data channel as initiator");
    dataChannel = peerConnection.createDataChannel("fileChannel", {
      ordered: true,
    });
    setupDataChannel(onMessage);
  } else {
    console.log("Waiting for data channel as receiver");
    peerConnection.ondatachannel = (event) => {
      console.log("Received data channel");
      dataChannel = event.channel;
      setupDataChannel(onMessage);
    };
  }

  if (isInitiator) {
    try {
      console.log("Creating offer...");
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });

      await peerConnection.setLocalDescription(offer);
      console.log("Sending offer");

      socket.emit("offer", {
        roomId,
        sdp: peerConnection.localDescription,
      });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  }
};

const setupDataChannel = (onMessage: (data: string) => void) => {
  if (!dataChannel) {
    console.error("DataChannel is null");
    return;
  }

  dataChannel.onopen = () => {
    console.log("DataChannel opened");
  };

  dataChannel.onmessage = (event) => {
    console.log("DataChannel message received:", event.data);
    onMessage(event.data);
  };

  dataChannel.onerror = (error) => {
    console.error("DataChannel error:", error);
  };

  dataChannel.onclose = () => {
    console.log("DataChannel closed");
  };
};

export const handleOffer = async (
  socket: Socket,
  roomId: string,
  sdp: RTCSessionDescriptionInit,
  onMessage: (data: string) => void,
) => {
  try {
    console.log("Handling offer...");

    if (!sdp || !sdp.type || !sdp.sdp) {
      console.error("Invalid SDP received:", sdp);
      return;
    }

    if (!peerConnection) {
      console.error("PeerConnection not initialized");
      return;
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescriptionSet = true;
    console.log("Remote description set");

    // Flush pending candidates
    await flushPendingCandidates();

    console.log("Creating answer...");
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    console.log("Sending answer");
    socket.emit("answer", {
      roomId,
      sdp: peerConnection.localDescription,
    });
  } catch (error) {
    console.error("Error handling offer:", error);
  }
};

const flushPendingCandidates = async () => {
  if (pendingCandidates.length === 0) return;

  console.log(`Flushing ${pendingCandidates.length} pending ICE candidates`);

  for (const candidate of pendingCandidates) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("ICE candidate added");
    } catch (error) {
      console.error("Failed to add ICE candidate:", error);
    }
  }
  pendingCandidates = [];
};

export const handleAnswer = async (sdp: RTCSessionDescriptionInit) => {
  try {
    console.log("Handling answer...");

    if (!peerConnection) {
      console.error("PeerConnection not initialized");
      return;
    }

    console.log("PeerConnection state:", peerConnection.signalingState);

    if (peerConnection.signalingState !== "have-local-offer") {
      console.error(
        "Cannot set remote answer - wrong state:",
        peerConnection.signalingState,
      );
      console.error(
        "Expected: have-local-offer, Got:",
        peerConnection.signalingState,
      );
      return;
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescriptionSet = true;
    console.log("Remote description set from answer");

    // Flush any pending candidates
    await flushPendingCandidates();
  } catch (error) {
    console.error("Error handling answer:", error);
    console.error("PeerConnection state was:", peerConnection?.signalingState);
  }
};

export const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
  try {
    console.log("Handling ICE candidate...");

    if (!peerConnection) {
      console.error("PeerConnection not initialized");
      return;
    }

    if (remoteDescriptionSet) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("ICE candidate added immediately");
    } else {
      pendingCandidates.push(candidate);
      console.log("ICE candidate queued (remote description not ready)");
    }
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
};

export const sendData = (data: string) => {
  if (!dataChannel) {
    console.error("DataChannel not initialized");
    return false;
  }

  if (dataChannel.readyState === "open") {
    dataChannel.send(data);
    console.log("Data sent:", data);
    return true;
  } else {
    console.error("DataChannel not ready. State:", dataChannel.readyState);
    return false;
  }
};

export const closeConnection = () => {
  console.log("Closing P2P connection...");

  if (dataChannel) {
    dataChannel.close();
    dataChannel = undefined as unknown as RTCDataChannel;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = undefined as unknown as RTCPeerConnection;
  }

  // Reset state
  remoteDescriptionSet = false;
  pendingCandidates = [];

  console.log("Connection closed and cleaned up");
};
