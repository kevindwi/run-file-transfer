interface ServerToClientEvents {
  noArg: () => void;
  message: (data: string) => void;
  "room-created": (roomId: string) => void;
  "user-joined": (userId: string, roomId: string) => void;
  "user-left": (userId: string) => void;
}

interface ClientToServerEvents {
  hello: () => void;
  sendMessage: (data: string) => void;
  "create-room": (callback: (roomId: string) => void) => void;
  "join-room": (
    roomId: string,
    callback: (response: {
      success: boolean;
      roomId?: string;
      error?: string;
    }) => void,
  ) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  name: string;
  age: number;
}
