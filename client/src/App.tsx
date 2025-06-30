import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import QrScanner, { type QrScannerHandle } from "./componets/QRScanner";
import {
  closeConnection,
  createPeerConnection,
  dataChannel,
  handleAnswer,
  handleIceCandidate,
  handleOffer,
  isPeerConnectionExists,
  sendData,
} from "./config/WebRTC";
import { generateQRCode } from "./utils/qr-code-generator";

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("");

  // QR
  const scannerRef = useRef<QrScannerHandle>(null);

  useEffect(() => {
    const newSocket = io(
      process.env.VITE_SIGNALING_SERVER_URL || "ws://localhost:3001",
      {
        transports: ["websocket", "polling"],
      },
    );

    setSocket(newSocket);
    let isRoomCreator = false;

    newSocket.on("connect", () => {
      console.log("Connected to signaling server");
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
      setRoomId("");
      console.log("Disconnected from signaling server");
      closeConnection();
    });

    // Create room (initiator)
    newSocket.emit("create-room", (roomId: string) => {
      console.log("Room created:", roomId);
      isRoomCreator = true; // initiator
      setConnected(false);
      setRoomId(roomId);
      generateQRCode(roomId, "qr-code");
    });

    newSocket.on("user-joined", (userId, joinedRoomId) => {
      console.log(`User ${userId} joined room ${joinedRoomId}`);

      // Cek apakah user yang join adalah diri sendiri
      if (userId === newSocket.id) {
        return;
      }

      setConnected(true);
      setRoomId(joinedRoomId);

      console.log("I am room creator, creating peer connection as initiator");
      createPeerConnection(newSocket, joinedRoomId, true, (msg) => {
        console.log("Received message:", msg);
      });
    });

    // User left
    newSocket.on("user-left", (userId) => {
      console.log(`User ${userId} left the room`);
      setConnected(false);
      closeConnection();
    });

    // Handle offer
    newSocket.on("offer", async ({ sdp, from, roomId: offerRoomId }) => {
      console.log("Received offer from:", from, "for room:", offerRoomId);

      if (from !== newSocket.id) {
        if (!isPeerConnectionExists()) {
          console.error("No peer connection exists!");
          await createPeerConnection(newSocket, offerRoomId, false, (msg) => {
            console.log("Received message:", msg);
          });
        }

        // Handle offer dan buat answer
        await handleOffer(newSocket, offerRoomId, sdp, (msg) => {
          console.log("Received message:", msg);
        });
      } else {
        console.error("Room creator received offer - this shouldn't happen!");
      }
    });

    // Handle answer (initiator)
    newSocket.on("answer", async ({ sdp, from, roomId: answerRoomId }) => {
      console.log("Received answer from:", from, "for room:", answerRoomId);

      if (!isRoomCreator) {
        console.error(
          "Non-room-creator received answer - this shouldn't happen!",
        );
        return;
      }

      await handleAnswer(sdp);
    });

    // Handle ICE candidates
    newSocket.on(
      "ice-candidate",
      async ({ candidate, from, roomId: iceRoomId }) => {
        console.log(
          "Received ICE candidate from:",
          from,
          "for room:",
          iceRoomId,
        );
        await handleIceCandidate(candidate);
      },
    );

    // Cleanup on unmount
    return () => {
      console.log("Cleaning up socket connection");
      newSocket.disconnect();
      closeConnection();
    };
  }, []);

  const handleStartScan = () => {
    scannerRef.current?.startScan();
  };

  const handleScanSuccess = (roomId: string) => {
    handleJoinRoom(roomId);
  };

  const handleJoinRoom = (roomId: string) => {
    if (!socket) {
      console.error("Socket not connected");
      return;
    }

    console.log("Attempting to join room:", roomId);

    socket.emit(
      "join-room",
      roomId,
      (response: { success: boolean; roomId?: string; error?: string }) => {
        if (response.success) {
          console.log("Successfully joined room:", response.roomId);
          setConnected(true);
          setRoomId(response.roomId || "");

          console.log("I am joiner, creating peer connection as receiver");
          createPeerConnection(socket, response.roomId || "", false, (msg) => {
            console.log("Received message:", msg);
          });
        } else {
          console.error("Failed to join room:", response.error);
          setConnected(false);
          setRoomId("");
          alert(response.error || "Failed to join room");
        }
      },
    );
  };

  const handleSubmitCode = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const roomId = formData.get("deviceCode") as string;

    if (!roomId) return;

    handleJoinRoom(roomId);
  };

  const handleUpload = () => {
    if (!dataChannel) {
      console.error("DataChannel not initialized");
      return;
    }

    if (dataChannel.readyState !== "open") {
      console.error(
        "DataChannel not open, current state:",
        dataChannel.readyState,
      );
      return;
    }

    sendData("Hello World");
  };

  return (
    <main className="bg-blue-50 w-full h-screen p-5">
      <nav className="flex justify-between mb-10">
        <div>
          <span>Device name</span>
          <h1 className="text-xl font-medium">xenonx</h1>
        </div>
        <div>
          <a
            href="#"
            onClick={handleStartScan}
            className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-full text-sm px-5 py-2 w-full"
          >
            Scan QR
          </a>
        </div>
      </nav>
      {/* <div>
        <div className="flex justify-center items-center">
          <div id="animation-pulse">
            <svg
              className="svg-area"
              width="250px"
              height="250px"
              viewBox="0 0 400 400"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
            >
              <g transform="translate(200,200)">
                <circle id="core" cx="0" cy="0" r="6"></circle>

                <circle id="radar" cx="0" cy="0" r="6"></circle>
              </g>
            </svg>
          </div>
        </div>
      </div> */}

      <QrScanner
        ref={scannerRef}
        onScanSuccess={(text) => handleScanSuccess(text)}
      />

      <div className="flex justify-center items-center">
        {connected ? (
          <div className="flex flex-col w-sm gap-y-3">
            <div className="flex flex-col justify-center items-center rounded-2xl px-6 py-6 bg-white gap-y-3">
              <h1 className="font-medium">Connected to room: {roomId}</h1>

              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="dropzone-file"
                  className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg
                      className="w-8 h-8 mb-4 text-gray-500"
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 20 16"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                      />
                    </svg>
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">Click to upload</span> or
                      drag and drop
                    </p>
                    <p className="text-xs text-gray-500">
                      SVG, PNG, JPG or GIF (MAX. 800x400px)
                    </p>
                  </div>
                  <input id="dropzone-file" type="file" className="hidden" />
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUpload}
              className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-full text-sm px-5 py-2 w-full"
            >
              Upload
            </button>
          </div>
        ) : (
          <div className="flex flex-col w-xs gap-y-3">
            <div className="flex flex-col justify-center items-center rounded-2xl px-6 py-6 bg-white gap-y-1">
              <h1 className="font-medium">Scan or enter code to connect</h1>
              <canvas id="qr-code"></canvas>
              <h3 id="roomId" className="font-medium">
                {roomId}
              </h3>
            </div>

            <div className="flex flex-col justify-center items-center rounded-2xl px-6 py-6 bg-white gap-y-2">
              <form onSubmit={handleSubmitCode}>
                <input
                  type="text"
                  name="deviceCode"
                  className="border border-gray-300 rounded-full text-sm px-4 py-2 mb-1 placeholder-slate-300 w-full"
                  placeholder="Code from other device"
                />
                <button
                  type="submit"
                  className="text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-full text-sm px-5 py-2 w-full"
                >
                  Connect
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* <div>
        <button
          className="justify-center px-3 py-1.5 text-xs font-medium text-center text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300"
          onClick={displayMsg}
        >
          Click me
        </button>
        <ToastContainer autoClose={false} />
      </div> */}

      {/* <input
        className="flex h-9 mt-5 w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-foreground file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        id="picture"
        name="picture"
        type="file"
      /> */}
    </main>
  );
}

export default App;
