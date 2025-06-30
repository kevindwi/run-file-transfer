import { Socket } from "socket.io-client";

let peerConnection: RTCPeerConnection;
export let dataChannel: RTCDataChannel;
let remoteDescriptionSet = false;
let pendingCandidates: RTCIceCandidateInit[] = [];

// File transfer constants
const CHUNK_SIZE = 16384; // 16KB chunks
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

// File transfer state
interface FileTransfer {
  id: string;
  name: string;
  size: number;
  type: string;
  chunks: ArrayBuffer[];
  receivedSize: number;
  totalChunks: number;
  receivedChunks: number;
}

let currentFileTransfer: FileTransfer | null = null;
let onFileReceived: ((file: File) => void) | null = () => {};
let onProgress:
  | ((progress: number, type: "send" | "receive") => void)
  | null = () => {};

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
  onFileReceivedCallback?: (file: File) => void,
  onProgressCallback?: (progress: number, type: "send" | "receive") => void,
) => {
  if (peerConnection) {
    peerConnection.close();
  }

  // Set callbacks
  onFileReceived = onFileReceivedCallback || null;
  onProgress = onProgressCallback || null;

  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  if (roomId === "") {
    console.error("roomId tidak boleh kosong");
    return;
  }

  remoteDescriptionSet = false;
  pendingCandidates = [];

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate");
      socket.emit("ice-candidate", {
        roomId,
        candidate: event.candidate,
      });
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
      maxRetransmits: 3,
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
    handleDataChannelMessage(event.data, onMessage);
  };

  dataChannel.onerror = (error) => {
    console.error("DataChannel error:", error);
  };

  dataChannel.onclose = () => {
    console.log("DataChannel closed");
  };
};

const handleDataChannelMessage = (
  data: any,
  onMessage: (data: string) => void,
) => {
  try {
    // Try to parse as JSON first (metadata)
    const message = JSON.parse(data);

    if (message.type === "file-start") {
      console.log("Starting file transfer:", message.name);
      currentFileTransfer = {
        id: message.id,
        name: message.name,
        size: message.size,
        type: message.fileType,
        chunks: [],
        receivedSize: 0,
        totalChunks: Math.ceil(message.size / CHUNK_SIZE),
        receivedChunks: 0,
      };

      if (onProgress) {
        onProgress(0, "receive");
      }
      return;
    }

    if (message.type === "file-end") {
      console.log("File transfer completed");
      if (currentFileTransfer && currentFileTransfer.id === message.id) {
        reconstructFile();
      }
      return;
    }

    // Regular text message
    if (message.type === "text") {
      console.log("Text message:", message.data);
      onMessage(message.data);
      return;
    }
  } catch (e) {
    // Data is binary (file chunk)
    if (currentFileTransfer) {
      currentFileTransfer.chunks.push(data);
      currentFileTransfer.receivedChunks++;
      currentFileTransfer.receivedSize += data.byteLength;

      const progress =
        (currentFileTransfer.receivedSize / currentFileTransfer.size) * 100;
      console.log(
        `Received chunk ${currentFileTransfer.receivedChunks}/${currentFileTransfer.totalChunks} (${progress.toFixed(1)}%)`,
      );

      if (onProgress) {
        onProgress(progress, "receive");
      }

      if (
        currentFileTransfer.receivedChunks === currentFileTransfer.totalChunks
      ) {
        reconstructFile();
      }
    }
  }
};

const reconstructFile = () => {
  if (!currentFileTransfer) return;

  console.log("🔄 Reconstructing file:", currentFileTransfer.name);

  const totalSize = currentFileTransfer.chunks.reduce(
    (acc, chunk) => acc + chunk.byteLength,
    0,
  );
  const fileData = new Uint8Array(totalSize);

  let offset = 0;
  for (const chunk of currentFileTransfer.chunks) {
    fileData.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  const file = new File([fileData], currentFileTransfer.name, {
    type: currentFileTransfer.type,
  });

  console.log("File reconstructed:", file.name, file.size, "bytes");
  onFileReceived?.(file);

  currentFileTransfer = null;
};

// File sending functions
export const sendFile = async (file: File): Promise<boolean> => {
  if (!dataChannel || dataChannel.readyState !== "open") {
    console.error("DataChannel not ready");
    return false;
  }

  if (file.size > MAX_FILE_SIZE) {
    console.error("File too large:", file.size, "bytes. Max:", MAX_FILE_SIZE);
    return false;
  }

  console.log("Starting file transfer:", file.name, file.size, "bytes");

  const fileId = generateFileId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Send file metadata
  const metadata = {
    type: "file-start",
    id: fileId,
    name: file.name,
    size: file.size,
    fileType: file.type,
    totalChunks,
  };

  dataChannel.send(JSON.stringify(metadata));

  // Send file in chunks
  const arrayBuffer = await file.arrayBuffer();
  let offset = 0;
  let chunkIndex = 0;

  while (offset < arrayBuffer.byteLength) {
    const chunk = arrayBuffer.slice(offset, offset + CHUNK_SIZE);

    // Wait for buffer to clear if needed
    while (dataChannel.bufferedAmount > CHUNK_SIZE * 3) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    dataChannel.send(chunk);

    offset += CHUNK_SIZE;
    chunkIndex++;

    const progress = (offset / arrayBuffer.byteLength) * 100;
    console.log(
      `Sent chunk ${chunkIndex}/${totalChunks} (${progress.toFixed(1)}%)`,
    );

    onProgress?.(Math.min(progress, 100), "send");
  }

  // Send completion signal
  const endSignal = {
    type: "file-end",
    id: fileId,
  };

  dataChannel.send(JSON.stringify(endSignal));
  console.log("File transfer completed:", file.name);

  return true;
};

const generateFileId = (): string => {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
};

export const handleOffer = async (
  socket: Socket,
  roomId: string,
  sdp: RTCSessionDescriptionInit,
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
