import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import QrScanner, { type QrScannerHandle } from "./componets/QRScanner";
import {
  closeConnection,
  createPeerConnection,
  handleAnswer,
  handleIceCandidate,
  handleOffer,
  isPeerConnectionExists,
  sendFile,
} from "./config/WebRTC";
import { generateQRCode } from "./utils/qr-code-generator";
import { toast, ToastContainer } from "react-toastify";
import { Toast } from "./componets/Toast";

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState<File[]>([]);
  // const [messages, setMessages] = useState<string[]>([]);

  // QR
  const scannerRef = useRef<QrScannerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_SIGNALING_SERVER_URL, {
      transports: ["websocket", "polling"],
    });

    setSocket(newSocket);
    let isRoomCreator = false; //

    newSocket.on("connect", () => {
      console.log("Connected to signaling server");
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
      setRoomId("");
      closeConnection();
    });

    // Create room (initiator)
    newSocket.emit("create-room", (roomId: string) => {
      isRoomCreator = true; // initiator//
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

      createPeerConnection(
        newSocket,
        joinedRoomId,
        true,
        (msg) => {
          console.log("Received message:", msg);
        },
        (file) => {
          console.log("file received:", file.name);
          displayMsg(
            "Success",
            `File "${file.name}" received successfully!`,
            "success",
          );
          setReceivedFiles((prev) => [...prev, file]);
          setIsDownloading(false);
          setDownloadProgress(0);
        },
        (progress, type) => {
          if (type == "send") {
            setUploadProgress(progress);
          } else {
            setDownloadProgress(progress);
            setIsDownloading(progress < 100);
          }
        },
      );
    });

    // User left
    newSocket.on("user-left", (userId) => {
      console.log(`User ${userId} left the room`);
      setConnected(false);
      closeConnection();
    });

    // Handle offer
    newSocket.on("offer", async ({ sdp, from, roomId: offerRoomId }) => {
      console.log("Received offer from:", from);

      if (from !== newSocket.id) {
        if (!isPeerConnectionExists()) {
          await createPeerConnection(
            newSocket,
            offerRoomId,
            false,
            (msg) => {
              console.log("Received message:", msg);
            },
            (file) => {
              console.log("📁 File received:", file.name);
              displayMsg(
                "Success",
                `File "${file.name}" received successfully!`,
                "success",
              );
              setReceivedFiles((prev) => [...prev, file]);
              setIsDownloading(false);
              setDownloadProgress(0);
            },
            (progress, type) => {
              if (type === "send") {
                setUploadProgress(progress);
              } else {
                setDownloadProgress(progress);
                setIsDownloading(progress < 100);
              }
            },
          );
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
      console.log("Received answer from:", from);

      if (!isRoomCreator) {
        console.error(
          "Non-room-creator received answer - this shouldn't happen!",
        );
        return;
      }

      await handleAnswer(sdp);
    });

    // Handle ICE candidates
    newSocket.on("ice-candidate", async ({ candidate, from }) => {
      console.log("Received ICE candidate from:", from);
      await handleIceCandidate(candidate);
    });

    // Cleanup on unmount
    return () => {
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
    if (!socket) return;

    socket.emit(
      "join-room",
      roomId,
      (response: { success: boolean; roomId?: string; error?: string }) => {
        if (response.success) {
          console.log("Successfully joined room:", response.roomId);
          setConnected(true);
          setRoomId(response.roomId || "");
        } else {
          console.error("Failed to join room:", response.error);
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    handleFileUpload(file);
  };

  const handleFileUpload = async (file: File) => {
    if (!connected) {
      displayMsg("Error", "Not connected to peer!", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const success = await sendFile(file);
      if (success) {
        displayMsg(
          "Success",
          `File "${file.name}" sent successfully!`,
          "success",
        );
      } else {
        displayMsg("Error", "Failed to send file", "error");
      }
    } catch (error) {
      console.error("File upload error:", error);
      displayMsg("Error", "Error uploading file", "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const displayMsg = (
    title: string,
    text: string,
    type: "success" | "error" | "info" | "warning",
  ) => {
    toast(Toast, { data: { title, text, type } });
  };

  return (
    <main className="w-full h-screen bg-white">
      <nav className="fixed w-full z-20 top-0 start-0 flex justify-between bg-white/30 backdrop-blur-md px-4 md:px-42 py-3 border-b-1 border-b-slate-100">
        <div className="flex items-center">
          <h1 className="text-2xl font-medium">run</h1>
        </div>
        <div className="flex items-center gap-3">
          {connected ? (
            <div className="flex items-center gap-2 text-gray-500">
              <span className="text-sm font-medium px-4 py-2">
                Connected to: <span className="text-gray-500">{roomId}</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500">
              <span className="text-sm font-medium px-4 py-1.5">Waiting</span>
            </div>
          )}
          <button
            onClick={handleStartScan}
            className="bg-black hover:bg-black/75 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Scan QR
          </button>
        </div>
      </nav>

      <QrScanner
        ref={scannerRef}
        onScanSuccess={(text) => handleScanSuccess(text)}
      />

      <div className="flex flex-col justify-center items-center mt-26 pb-32 gap-6">
        <div className="flex flex-col justify-center items-center text-center gap-3 md:gap-5">
          <h1 className="text-4xl md:text-5xl font-medium md:font-medium leading-12 md:leading-16 w-xs md:w-md">
            Send files with just single click
          </h1>
          <p className="text-lg text-gray-500 w-xs md:w-md mb-6">
            Run is a super simple tool for transfer file with just a single
            click
          </p>
        </div>

        {connected ? (
          <div className="space-y-4">
            {/* File Upload Area */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <h3 className="font-medium text-black mb-4">
                Upload file to send
              </h3>

              <div
                className="w-[240px] h-[200px] flex flex-col justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <p className="text-sm text-gray-600 mb-2">
                  <span className="font-semibold">Click to upload</span> or drag
                  and drop
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Upload Progress */}
              {isUploading && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Uploading...</span>
                    <span>{uploadProgress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Download Progress */}
            {isDownloading && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-semibold text-black mb-3">
                  Receiving File
                </h3>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Downloading...</span>
                  <span>{downloadProgress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Received Files */}
            {receivedFiles.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-medium text-black mb-3">Received Files</h3>
                <div className="space-y-2">
                  {receivedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium text-black truncate max-w-32">
                            {file.name}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadFile(file)}
                        className="text-black"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className="size-6"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col w-2xs gap-y-3">
            <div className="flex flex-col justify-center items-center rounded-2xl px-4 py-4 bg-white border border-slate-200 gap-y-1">
              <h1 className="font-medium">Scan or enter code to connect</h1>
              <canvas id="qr-code"></canvas>
              <h3 id="roomId" className="font-medium">
                {roomId}
              </h3>
            </div>

            <form
              onSubmit={handleSubmitCode}
              className="flex flex-col justify-center items-center rounded-2xl px-4 py-4 bg-white border border-slate-200 gap-y-1"
            >
              <input
                type="text"
                name="deviceCode"
                className="border border-gray-300 rounded-lg text-sm px-4 py-1.5 mb-1 placeholder-gray-300 w-full"
                placeholder="Code from other device"
              />
              <button
                type="submit"
                className="text-white bg-black hover:bg-black/75 focus:outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-1.5 w-full"
              >
                Connect
              </button>
            </form>
          </div>
        )}
      </div>

      <ToastContainer autoClose={5000} />
    </main>
  );
}

export default App;
